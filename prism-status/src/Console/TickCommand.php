<?php

declare(strict_types=1);

namespace PrismStatus\Console;

use Illuminate\Console\Command;
use PrismStatus\Support\Checks;
use PrismStatus\Support\Settings;
use PrismStatus\Support\Summary;

/** Every minute: checks each node and server on the status page. */
class TickCommand extends Command
{
    protected $signature = 'prism-status:tick';

    protected $description = 'Check the nodes and servers on the Prism Status page.';

    public function handle(): int
    {
        if (! Settings::bool('enabled')) {
            return self::SUCCESS;
        }

        Checks::run();
        Summary::forget();

        return self::SUCCESS;
    }
}
