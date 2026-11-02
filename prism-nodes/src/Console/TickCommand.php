<?php

declare(strict_types=1);

namespace PrismNodes\Console;

use Illuminate\Console\Command;
use PrismNodes\Support\Health;
use PrismNodes\Support\Mover;
use PrismNodes\Support\Settings;
use Throwable;

/** Every minute: moves the next queued server along. Every five: adds up what each node's servers use. */
class TickCommand extends Command
{
    protected $signature = 'prism-nodes:tick';

    protected $description = 'Move queued servers and record node usage for Prism Nodes.';

    public function handle(): int
    {
        try {
            Mover::step();
        } catch (Throwable $exception) {
            report($exception);
        }

        if (Settings::bool('history') && now()->minute % 5 === 0) {
            try {
                Health::sample();
            } catch (Throwable $exception) {
                report($exception);
            }
        }

        return self::SUCCESS;
    }
}
