<?php

declare(strict_types=1);

namespace PrismAudit\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use PrismAudit\Models\Alert;
use PrismAudit\Support\Deliver;
use PrismAudit\Support\Rules;
use PrismAudit\Support\Settings;
use PrismAudit\Support\Timeline;
use Pterodactyl\Models\ActivityLog;
use Throwable;

/**
 * Every minute: reads the activity entries added since the last run and runs the alert rules on
 * them. The first run starts from the newest entry, so turning alerts on never raises old ones.
 */
class TickCommand extends Command
{
    private const string CURSOR = 'prism-audit:cursor';

    /** Entries read in one run at most; the rest wait for the next. */
    private const int BATCH = 2000;

    protected $signature = 'prism-audit:tick';

    protected $description = 'Run the Prism Audit alert rules on new activity.';

    public function handle(): int
    {
        $newest = (int) ActivityLog::query()->max('id');
        // The cache may hand the number back as a string.
        $stored = Cache::get(self::CURSOR);
        $cursor = is_numeric($stored) ? (int) $stored : null;
        if (! Settings::bool('alerts') || $cursor === null || $cursor > $newest) {
            Cache::forever(self::CURSOR, $newest);

            return self::SUCCESS;
        }

        $logs = ActivityLog::query()->with(['actor', 'subjects.subject'])
            ->where('id', '>', $cursor)->where('id', '<=', $newest)
            ->whereIn('event', Rules::events())
            ->orderBy('id')->limit(self::BATCH)->get();
        $reached = $logs->count() === self::BATCH ? (int) $logs->last()->id : $newest;

        foreach ($logs as $log) {
            try {
                foreach (Rules::check($log) as $found) {
                    $alert = Alert::query()->create([
                        'rule' => $found['rule'],
                        'activity_log_id' => $log->id,
                        'user_id' => Timeline::person($log)?->id,
                        'ip' => $log->ip,
                        'summary' => mb_substr($found['summary'], 0, 500),
                    ]);
                    Deliver::alert($alert);
                }
            } catch (Throwable $exception) {
                report($exception);
            }
        }

        Cache::forever(self::CURSOR, $reached);
        Alert::query()->where('created_at', '<', now()->subDays(365))->delete();

        return self::SUCCESS;
    }
}
