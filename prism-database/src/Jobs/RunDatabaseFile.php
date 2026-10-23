<?php

declare(strict_types=1);

namespace PrismDatabase\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;
use PrismDatabase\Models\DatabaseFile;
use PrismDatabase\Support\Backups;
use PrismDatabase\Support\Dumper;
use PrismDatabase\Support\Importer;
use PrismDatabase\Support\Settings;
use RuntimeException;
use Throwable;

/**
 * Works on a backup, export, import or restore in short runs. A dump runs as its own process
 * that each run checks on; an import runs statements for about forty seconds, then queues the
 * next run from where it stopped.
 */
class RunDatabaseFile implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    public int $tries = 1;

    public int $timeout = 80;

    private const int SLICE_SECONDS = 40;

    private const int DUMP_TIMEOUT = 7200;

    public function __construct(public int $file)
    {
        $this->onQueue('standard');
    }

    public function handle(): void
    {
        $file = DatabaseFile::query()->with('database.host')->find($this->file);
        if (! $file instanceof DatabaseFile || in_array($file->status, ['done', 'failed'], true)) {
            return;
        }

        if ($file->database === null) {
            $this->fail($file, 'The database no longer exists.');

            return;
        }

        try {
            $finished = in_array($file->type, ['backup', 'export'], true) ? $this->dump($file) : $this->import($file);
        } catch (Throwable $exception) {
            Log::warning('Prism Database job failed', ['file' => $file->id, 'exception' => $exception]);
            $this->fail($file, mb_substr($exception->getMessage(), 0, 1000));

            return;
        }

        if (! $finished) {
            self::dispatch($file->id)->delay(now()->addSeconds(in_array($file->type, ['backup', 'export'], true) ? 3 : 1));
        }
    }

    private function dump(DatabaseFile $file): bool
    {
        $state = $file->state ?? [];

        if (! isset($state['pid'])) {
            $name = sprintf('%s-%s.sql.gz', $file->database->database, now()->format('Y-m-d-His'));
            $target = Settings::storage($file->database_id).'/'.($file->type === 'backup' ? 'backup' : 'export').'-'.$file->id.'.sql.gz';
            $process = Dumper::start($file->database, $target);
            $file->path = $target;
            $file->status = 'running';
            $file->patchState(['pid' => $process['pid'], 'started' => time(), 'name' => $name, 'progress' => null]);
            $file->message = 'Dumping the database.';
            $file->save();

            return false;
        }

        $result = Dumper::poll((string) $file->path);
        if ($result === null) {
            throw_if(time() - (int) $state['started'] > self::DUMP_TIMEOUT, RuntimeException::class, 'The dump took longer than two hours.');
            throw_if(! Dumper::running((int) $state['pid']) && ! is_file($file->path.'.code'), RuntimeException::class, 'mysqldump stopped without finishing.');
            $file->size = is_file((string) $file->path) ? (int) filesize((string) $file->path) : 0;
            $file->save();

            return false;
        }

        if ($result['code'] !== 0) {
            @unlink((string) $file->path);
            $warning = preg_replace('/^mysqldump: \[Warning\].*$/m', '', $result['error']);
            throw new RuntimeException('mysqldump failed: '.(trim((string) $warning) ?: 'exit code '.$result['code']));
        }

        $file->status = 'done';
        $file->size = (int) filesize((string) $file->path);
        $file->finished_at = now();
        $file->message = $file->type === 'backup' ? 'Backup complete.' : 'Export complete.';
        $file->patchState(['progress' => 1]);
        if ($file->type === 'export') {
            $file->expires_at = now()->addHours(Settings::int('export_keep_hours', 24));
        }

        // An export to the server's files is copied there now.
        if ($file->type === 'export' && ! empty($state['destination'])) {
            $this->copyToServer($file, (string) $state['destination']);
        }

        $file->save();
        if ($file->type === 'backup') {
            Backups::prune($file->database);
        }

        return true;
    }

    private function copyToServer(DatabaseFile $file, string $destination): void
    {
        $server = $file->database->server;
        throw_unless($server, RuntimeException::class, 'The server of this database no longer exists.');
        $content = (string) file_get_contents((string) $file->path);
        \PrismDatabase\Support\ServerFiles::for($server)->write($destination, $content);
        $file->message = 'Saved to /'.ltrim($destination, '/').' on the server.';
    }

    private function import(DatabaseFile $file): bool
    {
        $state = $file->state ?? [];
        throw_unless($file->path && is_file($file->path), RuntimeException::class, 'The file to import is gone.');

        if (($state['emptied'] ?? false) === false && ($state['empty_first'] ?? false)) {
            $file->status = 'running';
            $file->message = 'Emptying the database first.';
            $file->save();
            Importer::emptyDatabase($file->database);
            $file->patchState(['emptied' => true]);
            $file->save();

            return false;
        }

        $file->status = 'running';
        $result = Importer::run($file->database, (string) $file->path, $state, (bool) ($state['stop_on_error'] ?? true), self::SLICE_SECONDS);
        $file->patchState([
            'offset' => $result['offset'],
            'delimiter' => $result['delimiter'],
            'statements' => $result['statements'],
            'errors' => $result['errors'],
            'log' => $result['log'],
            'progress' => $result['total'] > 0 ? min(1, $result['offset'] / $result['total']) : null,
        ]);
        $file->message = sprintf('%s statements run%s.', number_format($result['statements']), $result['errors'] ? sprintf(', %d failed', $result['errors']) : '');

        if ($result['done']) {
            $file->status = 'done';
            $file->finished_at = now();
            $file->message = ($file->type === 'restore' ? 'Restored. ' : 'Imported. ').$file->message.($result['log'] !== [] ? ' First error: '.$result['log'][0] : '');
            // An uploaded import is not kept; a restore reads a backup that stays.
            if ($file->type === 'import') {
                @unlink((string) $file->path);
                $file->path = null;
            }
        }

        $file->save();

        return $result['done'];
    }

    private function fail(DatabaseFile $file, string $message): void
    {
        $file->status = 'failed';
        $file->message = $message;
        $file->finished_at = now();
        if ($file->type === 'import' && $file->path) {
            @unlink($file->path);
            $file->path = null;
        }

        $file->save();
    }

    public function failed(?Throwable $exception): void
    {
        $file = DatabaseFile::query()->find($this->file);
        if ($file instanceof DatabaseFile && ! in_array($file->status, ['done', 'failed'], true)) {
            $this->fail($file, $exception?->getMessage() ?: 'The worker stopped.');
        }
    }
}
