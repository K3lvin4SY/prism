<?php

declare(strict_types=1);

namespace PrismBackups\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use PrismBackups\Jobs\RunBackupJob;
use PrismBackups\Models\BackupJob;
use PrismBackups\Support\Access;
use PrismBackups\Support\Archive;
use PrismBackups\Support\ServerFiles;
use PrismBackups\Support\Settings;
use Pterodactyl\Models\Backup;
use Pterodactyl\Models\Server;

class BackupsController
{
    /** Profiles, which profile made each backup, open browses and recent restores, and the admin's settings. */
    public function state(Request $request, Server $server): JsonResponse
    {
        Access::require($request, $server, 'backup.read', 'You do not have permission to see backups.');

        $uuids = Backup::query()->where('server_id', $server->id)->pluck('uuid');

        return new JsonResponse([
            'config' => Settings::frontend(),
            'extras' => Access::extras($request, $server),
            'owner' => $request->user()->root_admin || $request->user()->id === $server->owner_id,
            'profiles' => DB::table('prism_backup_profiles')->where('server_id', $server->id)->orderByDesc('is_default')->orderBy('name')->get()->map(ProfilesController::present(...))->values(),
            'meta' => (object) DB::table('prism_backup_meta')->whereIn('backup_uuid', $uuids)->pluck('profile', 'backup_uuid')->all(),
            'opened' => $uuids->filter(static fn (string $uuid): bool => Archive::for($uuid)->listed())->values(),
            'jobs' => BackupJob::query()
                ->where('server_id', $server->id)
                ->where(static fn ($query) => $query->whereIn('status', ['pending', 'running'])->orWhere('updated_at', '>=', now()->subMinutes(10)))
                ->latest('id')
                ->limit(20)
                ->get()
                ->map(static fn (BackupJob $job): array => $job->present())
                ->values(),
        ]);
    }

    /** Whether the backup has been opened, and what is in it once it has. */
    public function browse(Request $request, Server $server, string $uuid): JsonResponse
    {
        $this->authorizeBrowse($request, $server);
        $backup = $this->backup($server, $uuid);
        $archive = Archive::for($backup->uuid);

        $job = BackupJob::query()->where('server_id', $server->id)->where('backup_uuid', $backup->uuid)->where('type', 'browse')->latest('id')->first();

        if ($archive->listed()) {
            $archive->touch();

            return new JsonResponse(['ready' => true, 'job' => $job?->present(), 'entries' => $archive->entries()]);
        }

        return new JsonResponse(['ready' => false, 'job' => $job?->present(), 'entries' => []]);
    }

    /** Starts downloading and reading the backup, unless that is already done or under way. */
    public function open(Request $request, Server $server, string $uuid): JsonResponse
    {
        $this->authorizeBrowse($request, $server);
        $backup = $this->backup($server, $uuid);
        abort_unless($backup->is_successful && $backup->completed_at !== null, 422, 'The backup is not finished.');
        abort_if($backup->bytes > Settings::int('browse_max_mb', 4096) * 1048576, 422, sprintf('This backup is larger than the %d MB the administrator allows to browse. Download it, or restore it whole.', Settings::int('browse_max_mb', 4096)));

        $running = BackupJob::query()->where('backup_uuid', $backup->uuid)->whereIn('status', ['pending', 'running'])->latest('id')->first();
        if ($running instanceof BackupJob) {
            return new JsonResponse(['job' => $running->present()]);
        }

        if (Archive::for($backup->uuid)->listed()) {
            return new JsonResponse(['job' => null]);
        }

        $job = BackupJob::query()->create(['server_id' => $server->id, 'user_id' => $request->user()->id, 'backup_uuid' => $backup->uuid, 'type' => 'browse', 'status' => 'pending', 'message' => 'Waiting to start']);
        RunBackupJob::dispatch($job->id);

        return new JsonResponse(['job' => $job->present()], 202);
    }

    /** Puts picked files and folders back where they were, or into a folder. */
    public function restoreFiles(Request $request, Server $server, string $uuid): JsonResponse
    {
        Access::require($request, $server, 'backup.restore', 'You do not have permission to restore backups.');
        Access::feature($request, $server, 'feature_file_restore');
        $data = $request->validate([
            'paths' => ['required', 'array', 'min:1', 'max:5000'],
            'paths.*' => ['string', 'max:4096'],
            'destination' => ['nullable', 'string', 'max:1024'],
        ]);

        $backup = $this->backup($server, $uuid);
        $archive = Archive::for($backup->uuid);
        abort_unless($archive->listed() && $archive->downloaded(), 422, 'Open the backup again first; the panel no longer has a copy of it.');
        abort_if($server->status !== null && $server->status !== '', 409, 'The server is busy installing, transferring or restoring.');

        $picked = array_map(static fn (string $path): string => trim($path, '/'), $data['paths']);
        $members = [];
        $bytes = 0;
        foreach ($archive->entries() as $entry) {
            if ($entry['d']) {
                continue;
            }

            foreach ($picked as $path) {
                if ($entry['p'] === $path || str_starts_with($entry['p'], $path.'/')) {
                    $members[] = $entry['r'] ?? $entry['p'];
                    $bytes += $entry['s'];
                    break;
                }
            }
        }

        abort_if($members === [], 422, 'The picked paths have no files in them.');
        $limit = Settings::int('restore_max_mb', 1024);
        abort_if($bytes > $limit * 1048576, 422, sprintf('That is more than the %d MB the administrator allows in one go. Pick fewer files, or restore the whole backup.', $limit));

        $destination = ServerFiles::normalize((string) ($data['destination'] ?? ''));

        $job = BackupJob::query()->create([
            'server_id' => $server->id,
            'user_id' => $request->user()->id,
            'backup_uuid' => $backup->uuid,
            'type' => 'restore',
            'status' => 'pending',
            'message' => 'Waiting to start',
            'payload' => ['members' => $members, 'destination' => $destination, 'bytes' => $bytes],
        ]);
        RunBackupJob::dispatch($job->id);

        return new JsonResponse(['job' => $job->present()], 202);
    }

    public function job(Request $request, Server $server, int $job): JsonResponse
    {
        Access::require($request, $server, 'backup.read', 'You do not have permission to see backups.');
        $record = BackupJob::query()->where('server_id', $server->id)->findOrFail($job);

        return new JsonResponse(['job' => $record->present()]);
    }

    private function authorizeBrowse(Request $request, Server $server): void
    {
        Access::require($request, $server, 'backup.download', 'Browsing a backup needs permission to download backups.');
        Access::feature($request, $server, 'feature_browse');
    }

    private function backup(Server $server, string $uuid): Backup
    {
        $backup = Backup::query()->where('server_id', $server->id)->where('uuid', $uuid)->first();
        abort_unless($backup instanceof Backup, 404, 'That backup does not exist.');

        return $backup;
    }
}
