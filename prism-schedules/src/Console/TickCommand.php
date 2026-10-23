<?php

declare(strict_types=1);

namespace PrismSchedules\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use PrismSchedules\Jobs\RunSchedule;
use PrismSchedules\Models\PrismSchedule;
use PrismSchedules\Models\ScheduleRun;
use PrismSchedules\Support\Engine;
use PrismSchedules\Support\Players;
use PrismSchedules\Support\Requests;
use PrismSchedules\Support\Settings;
use Pterodactyl\Contracts\Servers\ReadsServerState;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * Every minute: starts schedules that are due, notices servers starting, stopping, crashing or
 * emptying, picks up runs whose queued job went missing, and forgets old runs once an hour.
 */
class TickCommand extends Command
{
    protected $signature = 'prism-schedules:tick';

    protected $description = 'Start due Prism Schedules and watch servers for start, stop, crash and empty triggers.';

    public function handle(): int
    {
        if (! Settings::bool('enabled', true)) {
            return self::SUCCESS;
        }

        $this->due();
        if (Settings::bool('feature_state_triggers', true)) {
            $this->watch();
        }
        $this->recover();

        if ((int) now()->format('i') === 0) {
            ScheduleRun::query()->where('started_at', '<', now()->subDays(Settings::int('history_days', 7)))->delete();
        }

        return self::SUCCESS;
    }

    private function due(): void
    {
        $schedules = PrismSchedule::query()
            ->with('server')
            ->where('enabled', true)
            ->where('trigger->type', 'cron')
            ->where(static fn ($query) => $query->whereNull('next_run_at')->orWhere('next_run_at', '<=', now()))
            ->get();

        foreach ($schedules as $schedule) {
            $due = $schedule->next_run_at !== null;
            $schedule->forceFill(['next_run_at' => Engine::nextRun((string) ($schedule->trigger['cron'] ?? ''))])->save();

            if ($due && ! $schedule->paused()) {
                rescue(static fn () => Engine::start($schedule, 'cron'));
            }
        }
    }

    private function watch(): void
    {
        $schedules = PrismSchedule::query()
            ->with('server.egg')
            ->where('enabled', true)
            ->whereIn('trigger->type', ['start', 'stop', 'crash', 'empty'])
            ->get()
            ->filter(static fn (PrismSchedule $schedule): bool => ! $schedule->paused() && $schedule->server !== null)
            ->groupBy('server_id');

        foreach ($schedules as $serverSchedules) {
            /** @var Server $server */
            $server = $serverSchedules->first()->server;
            try {
                $reading = app(ReadsServerState::class)->read($server);
            } catch (Throwable) {
                continue;
            }

            $state = $reading->state;
            $key = 'prism-schedules:state:'.$server->id;
            $previous = Cache::get($key);
            Cache::forever($key, ['state' => $state, 'uptime' => $reading->uptime]);

            // Going down, or a restart between two checks, is decided a minute later, once the
            // node has reported its activity: a stop someone asked for, or a crash.
            $pendingKey = 'prism-schedules:pending:'.$server->id;
            $event = null;
            if (is_array($previous)) {
                $restarted = $previous['state'] === 'running' && $state === 'running' && $reading->uptime + 5000 < (int) $previous['uptime'];
                $down = in_array($previous['state'], ['running', 'starting', 'stopping'], true) && $state === 'offline';
                if ($restarted || $down) {
                    Cache::put($pendingKey, ['since' => time() - 120, 'at' => time(), 'restarted' => $restarted], now()->addHour());
                } elseif ($previous['state'] !== 'running' && $state === 'running') {
                    $event = 'start';
                }
            }

            $pending = Cache::get($pendingKey);
            if (is_array($pending) && time() - (int) $pending['at'] >= 50) {
                Cache::forget($pendingKey);
                $asked = Requests::stopAskedSince($server, now()->setTimestamp((int) $pending['since']));
                $fired = $asked ? ($pending['restarted'] ? 'start' : 'stop') : 'crash';
                $event = $event === null ? $fired : $event;
                if ($pending['restarted'] && ! $asked) {
                    // A crash Wings restarted from is also a start.
                    $this->fire($serverSchedules, 'start');
                }
            }

            if ($event !== null) {
                $this->fire($serverSchedules, $event);
            }

            foreach ($serverSchedules as $schedule) {
                $type = $schedule->trigger['type'];
                if ($type === 'empty' && Settings::bool('feature_empty_trigger', true)) {
                    $this->empty($schedule, $server, $state);
                }
            }
        }
    }

    private function fire(iterable $schedules, string $event): void
    {
        foreach ($schedules as $schedule) {
            if ($schedule->trigger['type'] === $event) {
                rescue(static fn () => Engine::start($schedule, $event));
            }
        }
    }

    /** Fires once the server has had no players for the schedule's minutes, then waits for someone to join. */
    private function empty(PrismSchedule $schedule, Server $server, string $state): void
    {
        $key = 'prism-schedules:empty:'.$schedule->id;
        if ($state !== 'running') {
            Cache::forget($key);

            return;
        }

        $players = Players::count($server);
        if ($players === null) {
            return;
        }

        if ($players['online'] > 0) {
            Cache::forget($key);

            return;
        }

        $mark = Cache::get($key) ?? ['since' => time(), 'fired' => false];
        if (! $mark['fired'] && time() - $mark['since'] >= max(1, (int) ($schedule->trigger['minutes'] ?? 10)) * 60) {
            rescue(static fn () => Engine::start($schedule, 'empty'));
            $mark['fired'] = true;
        }

        Cache::put($key, $mark, now()->addDay());
    }

    /** A run whose next job is long overdue lost it, with a restarted worker for one; queue it again. */
    private function recover(): void
    {
        foreach (ScheduleRun::query()->where('status', 'running')->get() as $run) {
            $wake = (int) ($run->state['wakeAt'] ?? $run->started_at->getTimestamp());
            if ($wake < time() - 300) {
                $state = $run->state;
                $state['recovered'] = (int) ($state['recovered'] ?? 0) + 1;
                if ($state['recovered'] > 3) {
                    $run->state = $state;
                    Engine::finish($run, 'failed', 'Stopped: the run kept getting lost.');

                    continue;
                }

                $state['wakeAt'] = time();
                $run->forceFill(['state' => $state])->save();
                RunSchedule::dispatch($run->id);
            }
        }
    }
}
