<?php

declare(strict_types=1);

namespace PrismDiscord\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use PrismDiscord\Models\Hook;
use PrismDiscord\Support\Commands;
use PrismDiscord\Support\Events;
use PrismDiscord\Support\PlayerLines;
use PrismDiscord\Support\Requests;
use PrismDiscord\Support\Settings;
use Pterodactyl\Contracts\Servers\ReadsServerLogs;
use Pterodactyl\Contracts\Servers\ReadsServerState;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * Every minute, for servers with a webhook that wants them: notices a server starting, stopping
 * or crashing, and players joining or leaving in its console. Also puts the slash commands on
 * Discord when they are not there yet.
 */
class TickCommand extends Command
{
    protected $signature = 'prism-discord:tick';

    protected $description = 'Watch servers with Prism Discord webhooks for start, stop, crash and player events.';

    public function handle(): int
    {
        if (! Settings::bool('enabled')) {
            return self::SUCCESS;
        }

        rescue(static fn () => Commands::sync());

        $wanted = Hook::query()->where('enabled', true)->get(['server_id', 'events'])->groupBy('server_id')
            ->map(static fn ($hooks): array => array_values(array_unique($hooks->flatMap(static fn (Hook $hook): array => $hook->events)->all())));

        foreach (Server::query()->whereIn('id', $wanted->keys())->get() as $server) {
            $events = $wanted[$server->id];
            try {
                if (array_intersect($events, Events::STATE) !== []) {
                    $this->state($server);
                }
                if (array_intersect($events, Events::PLAYERS) !== [] && Settings::bool('players')) {
                    $this->players($server);
                }
            } catch (Throwable $exception) {
                report($exception);
            }
        }

        return self::SUCCESS;
    }

    /** Going down, or a restart between two checks, is decided a minute later: a stop someone asked for, or a crash. */
    private function state(Server $server): void
    {
        try {
            $reading = app(ReadsServerState::class)->read($server);
        } catch (Throwable) {
            return;
        }

        $key = 'prism-discord:state:'.$server->id;
        $previous = Cache::get($key);
        Cache::forever($key, ['state' => $reading->state, 'uptime' => $reading->uptime]);

        $pendingKey = 'prism-discord:pending:'.$server->id;
        if (is_array($previous)) {
            $restarted = $previous['state'] === 'running' && $reading->state === 'running' && $reading->uptime + 5000 < (int) $previous['uptime'];
            $down = in_array($previous['state'], ['running', 'starting', 'stopping'], true) && $reading->state === 'offline';
            if ($restarted || $down) {
                Cache::put($pendingKey, ['since' => time() - 120, 'at' => time(), 'restarted' => $restarted], now()->addHour());
            } elseif ($previous['state'] !== 'running' && $reading->state === 'running') {
                Events::fire($server, 'start');
            }
        }

        $pending = Cache::get($pendingKey);
        if (is_array($pending) && time() - (int) $pending['at'] >= 50) {
            Cache::forget($pendingKey);
            $asked = Requests::stopAskedSince($server, now()->setTimestamp((int) $pending['since']));
            if (! $asked) {
                Events::fire($server, 'crash');
            } elseif (! $pending['restarted']) {
                Events::fire($server, 'stop');
            }
            if ($pending['restarted']) {
                Events::fire($server, 'start');
            }
        }
    }

    /** New join and leave lines since the last read. The first read only takes note of the console. */
    private function players(Server $server): void
    {
        try {
            $lines = array_values(array_map('strval', app(ReadsServerLogs::class)->read($server, ReadsServerLogs::MAX_LINES)));
        } catch (Throwable) {
            return;
        }

        $key = 'prism-discord:console:'.$server->id;
        $before = Cache::get($key);
        Cache::put($key, $lines, now()->addHour());
        if (! is_array($before)) {
            return;
        }

        foreach (PlayerLines::fresh($before, $lines) as $line) {
            $found = PlayerLines::parse($line);
            if ($found !== null) {
                Events::fire($server, $found['event'], ['player' => $found['player']]);
            }
        }
    }
}
