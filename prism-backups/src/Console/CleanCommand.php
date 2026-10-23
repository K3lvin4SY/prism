<?php

declare(strict_types=1);

namespace PrismBackups\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use PrismBackups\Models\BackupJob;
use PrismBackups\Support\Settings;

/** Removes downloaded backups the panel has kept long enough, and old job records. */
class CleanCommand extends Command
{
    protected $signature = 'prism-backups:clean';

    protected $description = 'Remove downloaded backups and finished jobs that are no longer needed.';

    public function handle(): int
    {
        $busy = BackupJob::query()->whereIn('status', ['pending', 'running'])->pluck('backup_uuid')->all();
        $cutoff = time() - Settings::int('cache_hours', 6) * 3600;
        $removed = 0;

        foreach (File::files(Settings::storage('cache')) as $file) {
            $uuid = mb_substr($file->getFilename(), 0, 36);
            if (! in_array($uuid, $busy, true) && $file->getMTime() < $cutoff) {
                @unlink($file->getPathname());
                $removed++;
            }
        }

        // Restores that stopped half way leave their folder behind.
        foreach (File::directories(Settings::storage('restore')) as $directory) {
            $job = BackupJob::query()->find((int) basename($directory));
            if ($job === null || ($job->finished() && $job->updated_at->lt(now()->subHour()))) {
                File::deleteDirectory($directory);
            }
        }

        // A job nobody has touched for a day has died with its worker.
        BackupJob::query()->whereIn('status', ['pending', 'running'])->where('updated_at', '<', now()->subDay())->update(['status' => 'failed', 'message' => 'This stopped and did not finish.']);
        BackupJob::query()->where('updated_at', '<', now()->subDays(7))->delete();
        DB::table('prism_backup_meta')->whereNotIn('backup_uuid', DB::table('backups')->whereNull('deleted_at')->select('uuid'))->delete();

        $this->info(sprintf('Removed %d cached files.', $removed));

        return self::SUCCESS;
    }
}
