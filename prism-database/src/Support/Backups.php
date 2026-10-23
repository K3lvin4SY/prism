<?php

declare(strict_types=1);

namespace PrismDatabase\Support;

use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use PrismDatabase\Jobs\RunDatabaseFile;
use PrismDatabase\Models\DatabaseFile;
use Pterodactyl\Models\Database;

/** Backups, exports, imports and restores: making the record and queueing the work. */
final class Backups
{
    public const array INTERVALS = ['hourly' => 1, '6h' => 6, '12h' => 12, 'daily' => 24, 'weekly' => 168];

    public static function start(Database $database, string $type, array $attributes = []): DatabaseFile
    {
        abort_if(
            DatabaseFile::query()->where('database_id', $database->id)->whereIn('status', ['pending', 'running'])->whereIn('type', ['backup', 'export', 'import', 'restore'])->exists(),
            409,
            'Another backup, import or export of this database is running. Try again when it is done.',
        );

        if ($type === 'backup') {
            $limit = Settings::int('backup_max_mb', 2048) * 1048576;
            abort_if(self::storageUsed($database) >= $limit, 422, 'This database\'s backups use all the space the administrator allows. Delete some first.');
            abort_if(DatabaseFile::query()->where('database_id', $database->id)->where('type', 'backup')->where('locked', true)->count() >= Settings::int('backup_max_keep', 20), 422, 'Too many backups are locked. Unlock some first.');
        }

        $file = DatabaseFile::query()->create([
            'database_id' => $database->id,
            'type' => $type,
            'status' => 'pending',
            ...$attributes,
        ]);

        RunDatabaseFile::dispatch($file->id);

        return $file;
    }

    public static function storageUsed(Database $database): int
    {
        return (int) DatabaseFile::query()->where('database_id', $database->id)->where('type', 'backup')->sum('size');
    }

    /** Keeps the newest unlocked backups up to the schedule's count; locked ones always stay. */
    public static function prune(Database $database): void
    {
        $schedule = DB::table('prism_database_schedules')->where('database_id', $database->id)->first();
        $keep = min(Settings::int('backup_max_keep', 20), (int) ($schedule->keep ?? Settings::int('backup_max_keep', 20)));

        $old = DatabaseFile::query()
            ->where('database_id', $database->id)
            ->where('type', 'backup')
            ->where('locked', false)
            ->where('status', 'done')
            ->orderByDesc('created_at')
            ->skip(max(1, $keep))
            ->take(1000)
            ->get();

        foreach ($old as $file) {
            self::delete($file);
        }
    }

    public static function delete(DatabaseFile $file): void
    {
        if ($file->path && is_file($file->path)) {
            @unlink($file->path);
        }

        $file->delete();
    }

    public static function nextRun(string $interval, ?CarbonInterface $from = null): CarbonInterface
    {
        return ($from ?? now())->copy()->addHours(self::INTERVALS[$interval] ?? 24);
    }

    /** The shortest interval the admin allows. */
    public static function allowed(string $interval): bool
    {
        $fastest = (string) Settings::get('backup_fastest', 'hourly');

        return (self::INTERVALS[$interval] ?? 0) >= (self::INTERVALS[$fastest] ?? 1);
    }
}
