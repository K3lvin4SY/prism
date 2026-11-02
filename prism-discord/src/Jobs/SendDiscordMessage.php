<?php

declare(strict_types=1);

namespace PrismDiscord\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use PrismDiscord\Models\Hook;
use PrismDiscord\Support\Discord;

/** Posts one event to one webhook; Discord's rate limit is waited out. */
class SendDiscordMessage implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    public int $tries = 4;

    public int $timeout = 30;

    /** @param  array<string, string>  $values */
    public function __construct(public int $hook, public string $event, public array $values)
    {
        $this->onQueue('standard');
    }

    public function handle(): void
    {
        $hook = Hook::query()->with('server')->find($this->hook);
        if ($hook === null || ! $hook->enabled) {
            return;
        }

        $result = Discord::send($hook, $this->event, $this->values);
        if ($result['retry'] !== null && $this->attempts() < $this->tries) {
            $this->release($result['retry']);
        }
    }
}
