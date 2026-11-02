<?php

declare(strict_types=1);

namespace PrismMail\Console;

use Illuminate\Console\Command;
use PrismMail\Models\LogEntry;
use PrismMail\Support\Settings;

/** Daily: forgets delivery log entries older than the setting allows. */
class PruneCommand extends Command
{
    protected $signature = 'prism-mail:prune';

    protected $description = 'Remove old entries from the Prism Mail delivery log.';

    public function handle(): int
    {
        $days = max(1, Settings::int('log_days'));
        $removed = LogEntry::query()->where('created_at', '<', now()->subDays($days))->delete();
        $this->info("Removed {$removed} log entries older than {$days} days.");

        return self::SUCCESS;
    }
}
