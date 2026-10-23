<?php

declare(strict_types=1);

namespace PrismBackups\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use PrismBackups\Models\BackupJob;
use PrismBackups\Support\Archive;
use PrismBackups\Support\Background;
use PrismBackups\Support\ServerFiles;
use PrismBackups\Support\Settings;
use Pterodactyl\Contracts\Backups\GeneratesBackupDownloadLinks;
use Pterodactyl\Models\Backup;
use Pterodactyl\Models\User;
use RuntimeException;
use Throwable;

/**
 * Browses or restores from a backup in short runs: the download, listing and extraction run
 * as their own processes that each run checks on, and files go back to the server for about
 * forty seconds a run, until all are done.
 */
class RunBackupJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    public int $tries = 1;

    public int $timeout = 80;

    private const int SLICE_SECONDS = 40;

    /** Wings takes a whole file in one request, so very large single files are left out. */
    private const int MAX_FILE_BYTES = 256 * 1048576;

    public function __construct(public int $record)
    {
        $this->onQueue('standard');
    }

    public function handle(): void
    {
        $job = BackupJob::query()->with('server')->find($this->record);
        if (! $job instanceof BackupJob || $job->finished()) {
            return;
        }

        try {
            $finished = $this->step($job);
        } catch (Throwable $exception) {
            Log::warning('Prism Backups job failed', ['job' => $job->id, 'exception' => $exception]);
            $this->markFailed($job, mb_substr($exception->getMessage(), 0, 1000));

            return;
        }

        if (! $finished) {
            self::dispatch($job->id)->delay(now()->addSeconds(2));
        }
    }

    private function step(BackupJob $job): bool
    {
        throw_if($job->server === null, RuntimeException::class, 'The server no longer exists.');
        $backup = Backup::query()->where('server_id', $job->server_id)->where('uuid', $job->backup_uuid)->first();
        throw_unless($backup instanceof Backup, RuntimeException::class, 'The backup no longer exists.');

        $archive = Archive::for($job->backup_uuid);
        $state = $job->state ?? [];

        // 1. The archive on the panel.
        if (! $archive->downloaded()) {
            if (! isset($state['download'])) {
                $user = User::query()->find($job->user_id);
                throw_unless($user instanceof User, RuntimeException::class, 'The person who asked for this no longer exists.');
                $url = app(GeneratesBackupDownloadLinks::class)->generate($backup, $user);

                $this->save($job, 'running', 1, 'Downloading the backup to the panel', ['stage' => 'download', 'download' => $archive->startDownload($url), 'started' => time()]);

                return false;
            }

            $download = $archive->downloadState();
            if (! $download['done']) {
                throw_if(! Background::running((int) $state['download']) && Background::code($archive->partial().'.code') === null, RuntimeException::class, 'The download stopped unexpectedly.');
                $share = $backup->bytes > 0 ? min(1, $archive->downloadedBytes() / $backup->bytes) : 0;
                $this->save($job, 'running', (int) round(1 + $share * ($job->type === 'browse' ? 79 : 49)), sprintf('Downloading the backup to the panel: %s of %s', self::bytes($archive->downloadedBytes()), self::bytes((int) $backup->bytes)), $state);

                return false;
            }

            throw_if($download['error'] !== null, RuntimeException::class, (string) $download['error']);
        }

        // 2. What is in it.
        if (! $archive->listed()) {
            if (! isset($state['listing'])) {
                $this->save($job, 'running', $job->type === 'browse' ? 82 : 52, 'Reading what is in the backup', [...$state, 'stage' => 'list', 'listing' => $archive->startListing()]);

                return false;
            }

            $listing = $archive->listingState();
            if (! $listing['done']) {
                return false;
            }

            throw_if($listing['error'] !== null, RuntimeException::class, (string) $listing['error']);
        }

        $archive->touch();

        if ($job->type === 'browse') {
            $this->save($job, 'done', 100, null, [...$state, 'stage' => 'ready']);

            return true;
        }

        return $this->restore($job, $archive, $state);
    }

    /** 3. Extract the picked paths, then 4. put each file back on the server. */
    private function restore(BackupJob $job, Archive $archive, array $state): bool
    {
        $work = Settings::storage('restore').'/'.$job->id;
        $payload = $job->payload ?? [];

        if (! isset($state['extract'])) {
            $members = array_values(array_unique(array_map('strval', $payload['members'] ?? [])));
            throw_if($members === [], RuntimeException::class, 'Nothing was picked to restore.');
            $this->save($job, 'running', 55, 'Taking the files out of the backup', [...$state, 'stage' => 'extract', 'extract' => $archive->startExtract($members, $work)]);

            return false;
        }

        if (! isset($state['files'])) {
            $code = Background::code($work.'.code');
            if ($code === null) {
                return false;
            }

            if ($code !== 0) {
                $error = Background::error($work.'.err');
                throw new RuntimeException('The files could not be taken out of the backup: '.($error ?: 'tar exited with '.$code.'.'));
            }

            $files = [];
            foreach (File::allFiles($work, true) as $file) {
                $files[] = str_replace('\\', '/', $file->getRelativePathname());
            }

            sort($files);
            $state = [...$state, 'stage' => 'upload', 'files' => $files, 'next' => 0, 'skipped' => []];
            $this->save($job, 'running', 60, sprintf('Putting %d files back on the server', count($files)), $state);

            return false;
        }

        $files = $state['files'];
        $destination = (string) ($payload['destination'] ?? '');
        $server = ServerFiles::for($job->server);
        $started = microtime(true);
        $next = (int) $state['next'];
        $skipped = $state['skipped'] ?? [];

        while ($next < count($files) && microtime(true) - $started < self::SLICE_SECONDS) {
            $relative = $files[$next];
            $local = $work.'/'.$relative;
            $target = ServerFiles::join($destination, $relative);

            if (is_link($local) || ! is_file($local)) {
                $skipped[] = $relative;
            } elseif (filesize($local) > self::MAX_FILE_BYTES) {
                $skipped[] = $relative.' (too large to restore on its own; restore the whole backup instead)';
            } else {
                $server->write($target, (string) file_get_contents($local));
            }

            $next++;
        }

        $total = max(1, count($files));
        $state = [...$state, 'next' => $next, 'skipped' => array_slice($skipped, 0, 50)];

        if ($next < count($files)) {
            $this->save($job, 'running', 60 + (int) floor($next / $total * 39), sprintf('Putting files back on the server: %d of %d', $next, count($files)), $state);

            return false;
        }

        File::deleteDirectory($work);
        foreach (['.members', '.code', '.err'] as $suffix) {
            @unlink($work.$suffix);
        }

        $restored = count($files) - count($skipped);
        $message = sprintf('Restored %d %s%s.', $restored, $restored === 1 ? 'file' : 'files', $destination === '' ? '' : ' into '.$destination);
        if ($skipped !== []) {
            $message .= sprintf(' Skipped %d: %s', count($skipped), implode(', ', array_slice($skipped, 0, 5)));
        }

        $this->save($job, 'done', 100, mb_substr($message, 0, 1000), [...$state, 'stage' => 'done', 'files' => []]);

        return true;
    }

    private function save(BackupJob $job, string $status, int $progress, ?string $message, array $state): void
    {
        $job->forceFill(['status' => $status, 'progress' => max(0, min(100, $progress)), 'message' => $message, 'state' => $state])->save();
    }

    private function markFailed(BackupJob $job, string $message): void
    {
        $state = $job->state ?? [];
        foreach (['download', 'listing', 'extract'] as $key) {
            if (isset($state[$key])) {
                Background::stop((int) $state[$key]);
            }
        }

        if ($job->type === 'restore') {
            File::deleteDirectory(Settings::storage('restore').'/'.$job->id);
        }

        $this->save($job, 'failed', $job->progress, $message, [...$state, 'stage' => 'failed', 'files' => []]);
    }

    private static function bytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $index = 0;
        $value = (float) $bytes;
        while ($value >= 1024 && $index < count($units) - 1) {
            $value /= 1024;
            $index++;
        }

        return ($index === 0 ? (string) $bytes : number_format($value, 1)).' '.$units[$index];
    }
}
