<?php

declare(strict_types=1);

namespace PrismDatabase\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use PrismDatabase\Models\DatabaseFile;
use PrismDatabase\Support\Access;
use PrismDatabase\Support\Backups;
use PrismDatabase\Support\ServerFiles;
use PrismDatabase\Support\Settings;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** Backups, imports and exports: files kept on the panel, each worked on by a queued job. */
class FilesController
{
    public function index(Request $request, Server $server, int $db): JsonResponse
    {
        $model = Access::find($request, $server, $db, 'database.read');
        $files = DatabaseFile::query()->where('database_id', $model->id)->orderByDesc('created_at')->limit(200)->get();
        $schedule = DB::table('prism_database_schedules')->where('database_id', $model->id)->first();

        return new JsonResponse([
            'backups' => $files->where('type', 'backup')->map->present()->values(),
            'transfers' => $files->whereIn('type', ['import', 'export', 'restore'])->take(20)->map->present()->values(),
            'storage' => Backups::storageUsed($model),
            'schedule' => [
                'enabled' => (bool) ($schedule->enabled ?? false),
                'interval' => (string) ($schedule->interval ?? 'daily'),
                'keep' => (int) ($schedule->keep ?? 7),
                'nextAt' => $schedule?->next_at,
            ],
        ]);
    }

    public function backup(Request $request, Server $server, int $db): JsonResponse
    {
        abort_unless(Settings::bool('backups', true), 403, 'Backups are turned off.');
        $model = Access::find($request, $server, $db, 'database.update');
        $data = $request->validate(['label' => ['nullable', 'string', 'max:120']]);
        $file = Backups::start($model, 'backup', ['label' => $data['label'] ?? null, 'user_id' => $request->user()->id]);
        Activity::event('server:prism-database.backup')->property(['database' => $model->database, 'label' => $data['label'] ?? null])->log();

        return new JsonResponse(['file' => $file->present()], 202);
    }

    public function lock(Request $request, Server $server, int $db, int $record): JsonResponse
    {
        $model = Access::find($request, $server, $db, 'database.update');
        $record = $this->file($model->id, $record, 'backup');
        $record->locked = $request->boolean('locked', ! $record->locked);
        $record->save();

        return new JsonResponse(['file' => $record->present()]);
    }

    public function restore(Request $request, Server $server, int $db, int $record): JsonResponse
    {
        $model = Access::find($request, $server, $db, 'database.update');
        $record = $this->file($model->id, $record, 'backup');
        abort_unless($record->status === 'done' && $record->path && is_file($record->path), 422, 'This backup cannot be restored.');

        $restore = Backups::start($model, 'restore', ['label' => $record->label ?? 'Backup', 'path' => $record->path, 'state' => ['empty_first' => true, 'stop_on_error' => true, 'from' => $record->id], 'user_id' => $request->user()->id]);
        Activity::event('server:prism-database.restore')->property(['database' => $model->database, 'backup' => $record->id])->log();

        return new JsonResponse(['file' => $restore->present()], 202);
    }

    public function destroy(Request $request, Server $server, int $db, int $record): JsonResponse
    {
        $model = Access::find($request, $server, $db, 'database.delete');
        $record = DatabaseFile::query()->where('database_id', $model->id)->findOrFail($record);
        abort_if($record->locked, 422, 'Unlock the backup before deleting it.');
        abort_if(in_array($record->status, ['pending', 'running'], true), 409, 'It is still running.');
        Backups::delete($record);

        return new JsonResponse(['deleted' => true]);
    }

    public function download(Request $request, Server $server, int $db, int $record): BinaryFileResponse
    {
        $model = Access::find($request, $server, $db, 'database.update');
        $record = DatabaseFile::query()->where('database_id', $model->id)->whereIn('type', ['backup', 'export'])->findOrFail($record);
        abort_unless($record->status === 'done' && $record->path && is_file($record->path), 404, 'The file is not available.');
        Activity::event('server:prism-database.download')->property(['database' => $model->database, 'file' => $record->id])->log();

        return response()->download($record->path, (string) ($record->state['name'] ?? basename($record->path)), ['Content-Type' => 'application/gzip']);
    }

    public function schedule(Request $request, Server $server, int $db): JsonResponse
    {
        $model = Access::find($request, $server, $db, 'database.update');
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'interval' => ['required', 'string', 'in:'.implode(',', array_keys(Backups::INTERVALS))],
            'keep' => ['required', 'integer', 'min:1', 'max:'.Settings::int('backup_max_keep', 20)],
        ]);
        abort_unless(Backups::allowed($data['interval']), 422, 'The administrator does not allow backups this often.');

        DB::table('prism_database_schedules')->updateOrInsert(['database_id' => $model->id], [
            'enabled' => $data['enabled'],
            'interval' => $data['interval'],
            'keep' => $data['keep'],
            'next_at' => $data['enabled'] ? Backups::nextRun($data['interval']) : null,
            'updated_at' => now(),
            'created_at' => now(),
        ]);
        Activity::event('server:prism-database.schedule')->property(['database' => $model->database, ...$data])->log();

        return new JsonResponse(['saved' => true]);
    }

    /** An upload, or a file from the server's own files, run into the database. */
    public function import(Request $request, Server $server, int $db): JsonResponse
    {
        $model = Access::find($request, $server, $db, 'database.update');
        $max = Settings::int('import_max_mb', 100);
        $data = $request->validate([
            'file' => ['required_without:path', 'file', 'max:'.($max * 1024)],
            'path' => ['required_without:file', 'string', 'max:4096'],
            'empty_first' => ['sometimes', 'boolean'],
            'stop_on_error' => ['sometimes', 'boolean'],
        ]);

        $target = Settings::storage($model->id).'/import-'.bin2hex(random_bytes(8)).'.sql';
        if ($request->hasFile('file')) {
            $name = $request->file('file')->getClientOriginalName();
            $request->file('file')->move(dirname($target), basename($target));
        } else {
            abort_unless($request->user()->can('file.read-content', $server), 403, 'You cannot read the server\'s files.');
            $files = ServerFiles::for($server);
            $size = $files->size($data['path']);
            abort_if($size === null, 404, 'That file was not found on the server.');
            abort_if($size > $max * 1048576, 422, sprintf('The file is larger than the %d MB import limit.', $max));
            file_put_contents($target, (string) $files->read($data['path'], $max * 1048576));
            $name = basename($data['path']);
        }

        $file = Backups::start($model, 'import', [
            'label' => $name,
            'path' => $target,
            'size' => (int) filesize($target),
            'user_id' => $request->user()->id,
            'state' => ['empty_first' => $request->boolean('empty_first'), 'stop_on_error' => $request->boolean('stop_on_error', true), 'name' => $name],
        ]);
        Activity::event('server:prism-database.import')->property(['database' => $model->database, 'file' => $name])->log();

        return new JsonResponse(['file' => $file->present()], 202);
    }

    /** A full .sql.gz dump, to download or to save in the server's files. */
    public function export(Request $request, Server $server, int $db): JsonResponse
    {
        $model = Access::find($request, $server, $db, 'database.update');
        $data = $request->validate(['destination' => ['nullable', 'string', 'max:4096']]);
        $destination = null;
        if (! empty($data['destination'])) {
            abort_unless($request->user()->can('file.create', $server), 403, 'You cannot create files on this server.');
            $destination = ServerFiles::normalize($data['destination']);
            abort_if($destination === '', 422, 'Pick where to save the export.');
        }

        $file = Backups::start($model, 'export', ['label' => $destination ? '/'.$destination : 'Download', 'user_id' => $request->user()->id, 'state' => ['destination' => $destination]]);
        Activity::event('server:prism-database.export')->property(['database' => $model->database, 'destination' => $destination])->log();

        return new JsonResponse(['file' => $file->present()], 202);
    }

    private function file(int $db, int $id, string $type): DatabaseFile
    {
        return DatabaseFile::query()->where('database_id', $db)->where('type', $type)->findOrFail($id);
    }
}
