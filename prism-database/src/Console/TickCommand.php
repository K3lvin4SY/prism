<?php

declare(strict_types=1);

namespace PrismDatabase\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use PrismDatabase\Models\DatabaseFile;
use PrismDatabase\Support\Backups;
use PrismDatabase\Support\Inspector;
use PrismDatabase\Support\Settings;
use Pterodactyl\Models\Database;
use Throwable;

/**
 * Runs every five minutes: due automatic backups, the hourly size and row samples for the
 * usage chart, and removing exports and old samples that have expired.
 */
class TickCommand extends Command
{
    protected $signature = 'prism-database:tick';

    protected $description = 'Prism Database Manager: automatic backups, usage history and clean-up.';

    public function handle(): int
    {
        $this->backups();
        $this->usage();
        $this->cleanUp();

        return self::SUCCESS;
    }

    private function backups(): void
    {
        if (! Settings::bool('backups', true)) {
            return;
        }

        $due = DB::table('prism_database_schedules')->where('enabled', true)->where(fn ($query) => $query->whereNull('next_at')->orWhere('next_at', '<=', now()))->get();
        foreach ($due as $schedule) {
            $database = Database::query()->with('host')->find($schedule->database_id);
            DB::table('prism_database_schedules')->where('id', $schedule->id)->update(['next_at' => Backups::nextRun((string) $schedule->interval), 'updated_at' => now()]);
            if (! $database instanceof Database) {
                continue;
            }

            try {
                Backups::start($database, 'backup', ['automatic' => true, 'label' => 'Automatic']);
            } catch (Throwable $exception) {
                $this->warn(sprintf('%s: %s', $database->database, $exception->getMessage()));
            }
        }
    }

    private function usage(): void
    {
        if (! Settings::bool('usage_history', true)) {
            return;
        }

        $recent = DB::table('prism_database_usage')->where('recorded_at', '>', now()->subMinutes(55))->pluck('database_id')->all();
        foreach (Database::query()->with('host')->whereNotIn('id', $recent)->get() as $database) {
            try {
                $totals = Inspector::for($database, 10)->totals();
                DB::table('prism_database_usage')->insert(['database_id' => $database->id, 'size' => $totals['size'], 'rows' => $totals['rows'], 'tables' => $totals['tables'], 'recorded_at' => now()]);
            } catch (Throwable) {
                // A database the panel cannot reach gets no sample this hour.
            }
        }
    }

    private function cleanUp(): void
    {
        foreach (DatabaseFile::query()->where('type', 'export')->whereNotNull('expires_at')->where('expires_at', '<', now())->get() as $file) {
            Backups::delete($file);
        }

        // Failed and finished imports leave only their record; keep the last month of those.
        DatabaseFile::query()->whereIn('type', ['import', 'restore'])->where('created_at', '<', now()->subDays(30))->delete();
        DB::table('prism_database_usage')->where('recorded_at', '<', now()->subDays(31))->delete();

        // Backups of a deleted database go with it.
        $root = storage_path('app/prism-database');
        $existing = Database::query()->pluck('id')->all();
        foreach (is_dir($root) ? (scandir($root) ?: []) : [] as $folder) {
            if (ctype_digit($folder) && ! in_array((int) $folder, $existing, true)) {
                array_map('unlink', glob($root.'/'.$folder.'/*') ?: []);
                @rmdir($root.'/'.$folder);
            }
        }
    }
}
