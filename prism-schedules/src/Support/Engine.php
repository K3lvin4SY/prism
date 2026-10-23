<?php

declare(strict_types=1);

namespace PrismSchedules\Support;

use Cron\CronExpression;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Http;
use PrismSchedules\Jobs\RunSchedule;
use PrismSchedules\Models\PrismSchedule;
use PrismSchedules\Models\ScheduleRun;
use Pterodactyl\Contracts\Backups\InitiatesBackups;
use Pterodactyl\Contracts\Servers\ReadsServerState;
use Pterodactyl\Contracts\Servers\SendsServerCommands;
use Pterodactyl\Contracts\Servers\SendsServerPower;
use Pterodactyl\Models\Server;
use RuntimeException;
use Throwable;

/**
 * Runs schedules a step at a time. Each queued run executes one step, writes the log and queues
 * the next, after a delay when the step waits, so no run holds a worker for long.
 */
final class Engine
{
    public const array TRIGGERS = ['cron', 'start', 'stop', 'crash', 'empty', 'manual'];

    /** Starts a run unless the schedule is already running or its conditions say no. */
    public static function start(PrismSchedule $schedule, string $trigger, ?int $userId = null, bool $checkConditions = true): ?ScheduleRun
    {
        $server = $schedule->server;
        if ($server === null || ($server->status !== null && $server->status !== '')) {
            return null;
        }

        if (ScheduleRun::query()->where('schedule_id', $schedule->id)->where('status', 'running')->exists()) {
            return null;
        }

        $run = new ScheduleRun(['schedule_id' => $schedule->id, 'server_id' => $schedule->server_id, 'user_id' => $userId, 'status' => 'running', 'trigger' => $trigger, 'log' => [], 'state' => [], 'started_at' => now()]);
        $run->write('info', sprintf('Started by %s.', self::triggerLabel($trigger)));

        $blocker = $checkConditions ? Conditions::blocker($schedule->conditions ?? [], $server, $schedule->last_status) : null;
        if ($blocker !== null) {
            $run->write('warning', $blocker);
            $run->forceFill(['status' => 'skipped', 'finished_at' => now()])->save();
            // The last real run's outcome stays, for "only if the last run succeeded".
            $schedule->forceFill(['last_run_at' => now()])->save();

            return $run;
        }

        $run->state = ['path' => ($schedule->steps ?? []) === [] ? null : [0], 'attempt' => 0, 'step' => null];
        $run->save();
        $schedule->forceFill(['last_run_at' => now(), 'last_status' => 'running'])->save();
        RunSchedule::dispatch($run->id);

        return $run;
    }

    public static function triggerLabel(string $trigger): string
    {
        return match (true) {
            $trigger === 'cron' => 'its schedule',
            $trigger === 'manual' => 'Run now',
            $trigger === 'start' => 'the server starting',
            $trigger === 'stop' => 'the server stopping',
            $trigger === 'crash' => 'the server crashing',
            $trigger === 'empty' => 'the server being empty',
            str_starts_with($trigger, 'schedule:') => 'another schedule',
            default => $trigger,
        };
    }

    /**
     * Executes the step the run has reached.
     *
     * @return int|null seconds until the run should continue, or null once it has finished
     */
    public static function step(ScheduleRun $run): ?int
    {
        $schedule = $run->schedule;
        $server = $run->server;
        if ($schedule === null || $server === null) {
            self::finish($run, 'failed', 'The schedule or server no longer exists.');

            return null;
        }

        $state = $run->state;
        $path = $state['path'] ?? null;
        $step = is_array($path) ? Steps::at($schedule->steps, $path) : null;
        if ($step === null) {
            self::finish($run, 'done', 'Finished.');

            return null;
        }

        $label = Steps::label($step);
        $state['step'] = $step['id'];
        $run->state = $state;

        try {
            $result = self::execute($run, $schedule, $server, $step, $label);
        } catch (Throwable $exception) {
            return self::failed($run, $schedule, $step, $label, $exception->getMessage());
        }

        // A step that is waiting comes back later; its progress is in the run's state.
        if (is_int($result)) {
            $run->save();

            return $result;
        }

        $state = $run->state;
        $state['attempt'] = 0;
        $state['progress'] = null;
        $state['detail'] = null;
        $state['path'] = is_array($result) ? $result : Steps::next($schedule->steps, $path);
        $run->state = $state;
        $run->save();

        if ($state['path'] === null) {
            self::finish($run, 'done', 'Finished.');

            return null;
        }

        return 0;
    }

    /**
     * @return int|list<int|string>|true seconds to wait, a path to go to next (If/Else), or true when the step is done
     */
    private static function execute(ScheduleRun $run, PrismSchedule $schedule, Server $server, array $step, string $label): int|array|bool
    {
        $config = $step['config'];
        $state = $run->state;
        $variables = self::variables($server, $schedule);

        switch ($step['type']) {
            case 'command':
                $command = Text::fill($config['command'], $variables);
                app(SendsServerCommands::class)->send($server, $command);
                $run->write('success', 'Sent: '.$command, $step['id']);

                return true;

            case 'power':
                app(SendsServerPower::class)->send($server, $config['signal']);
                $run->write('success', ucfirst($config['signal']).' sent to the server.', $step['id']);

                return true;

            case 'backup':
                $initiate = app(InitiatesBackups::class)->setIsLocked((bool) $config['locked'])->setIgnoredFiles(($config['profile'] ?? '') !== '' ? ['# prism-backups: profile='.$config['profile']] : []);
                $backup = $initiate->initiate($server, ($config['name'] ?? '') !== '' ? Text::fill($config['name'], $variables) : null, true);
                $run->write('success', 'Backup started: '.$backup->name, $step['id']);

                return true;

            case 'wait':
                if (! isset($state['until'])) {
                    $state['until'] = time() + (int) $config['seconds'];
                    $state['detail'] = 'Waiting '.Text::duration((int) $config['seconds']);
                    $run->state = $state;
                    $run->write('info', $label, $step['id']);
                }

                $left = (int) $state['until'] - time();
                if ($left > 0) {
                    return min($left, 900);
                }

                unset($state['until']);
                $run->state = $state;

                return true;

            case 'waitFor':
                $state['since'] ??= time();
                $now = Conditions::state($server);
                $wanted = $config['state'] === 'running' ? $now === 'running' : $now === 'offline';
                if ($wanted) {
                    unset($state['since']);
                    $run->state = $state;
                    $run->write('success', 'The server is '.($config['state'] === 'running' ? 'online' : 'offline').'.', $step['id']);

                    return true;
                }

                if (time() - (int) $state['since'] > (int) $config['timeout']) {
                    unset($state['since']);
                    $run->state = $state;

                    throw new RuntimeException('The server did not get there within '.Text::duration((int) $config['timeout']).'.');
                }

                $state['detail'] = 'Waiting for the server to be '.($config['state'] === 'running' ? 'online' : 'offline');
                $run->state = $state;

                return 5;

            case 'countdown':
                return self::countdown($run, $server, $step, $variables);

            case 'discord':
                $webhook = Steps::webhook($step);
                throw_if($webhook === null, RuntimeException::class, 'The Discord webhook could not be read; enter it again.');
                $payload = ['content' => Text::fill($config['content'], $variables), 'allowed_mentions' => ['parse' => []]];
                if (($config['username'] ?? '') !== '') {
                    $payload['username'] = $config['username'];
                }

                $response = Http::timeout(10)->acceptJson()->post($webhook, $payload);
                throw_unless($response->successful(), RuntimeException::class, 'Discord answered '.$response->status().'.');
                $run->write('success', 'Discord message sent.', $step['id']);

                return true;

            case 'run':
                $other = PrismSchedule::query()->where('server_id', $server->id)->find($config['schedule'] ?? 0);
                throw_if($other === null, RuntimeException::class, 'The schedule to run no longer exists.');
                throw_if($other->id === $schedule->id, RuntimeException::class, 'A schedule cannot run itself.');
                $started = self::start($other, 'schedule:'.$schedule->id, $run->user_id);
                $run->write($started?->status === 'running' ? 'success' : 'warning', $started === null ? $other->name.' is already running.' : 'Started '.$other->name.($started->status === 'skipped' ? ', which skipped itself.' : '.'), $step['id']);

                return true;

            case 'if':
                $holds = Conditions::holds($config, $server);
                $branch = $holds ? 'then' : 'else';
                $run->write('info', ucfirst(Conditions::describe($config)).': '.($holds ? 'yes' : 'no').'.', $step['id']);

                return ($step[$branch] ?? []) !== [] ? [...$run->state['path'], $branch, 0] : true;
        }

        throw new RuntimeException('Unknown step.');
    }

    /** Announces each mark as it comes, then finishes when the time is up. */
    private static function countdown(ScheduleRun $run, Server $server, array $step, array $variables): int|bool
    {
        $config = $step['config'];
        $state = $run->state;
        if (! isset($state['end'])) {
            $state['end'] = time() + (int) $config['seconds'];
            $state['marks'] = array_values(array_filter($config['marks'], static fn (int $mark): bool => $mark <= (int) $config['seconds']));
            $run->write('info', 'Countdown of '.Text::duration((int) $config['seconds']).' started.', $step['id']);
        }

        while (true) {
            $left = (int) $state['end'] - time();
            while (($state['marks'] ?? []) !== [] && $state['marks'][0] >= $left) {
                $mark = array_shift($state['marks']);
                $message = Text::fill($config['message'], [...$variables, 'time' => Text::duration((int) $mark)]);
                $command = Text::fill($config['command'], [...$variables, 'time' => Text::duration((int) $mark), 'message' => $message]);
                try {
                    app(SendsServerCommands::class)->send($server, $command);
                    $run->write('info', 'Announced: '.$message, $step['id']);
                } catch (Throwable $exception) {
                    // An offline server cannot be told; the countdown carries on.
                    $run->write('warning', 'Could not announce "'.$message.'": '.$exception->getMessage(), $step['id']);
                }
            }

            if ($left <= 0) {
                unset($state['end'], $state['marks']);
                $state['detail'] = null;
                $run->state = $state;
                $run->write('success', 'Countdown finished.', $step['id']);

                return true;
            }

            $state['detail'] = Text::duration($left).' left';
            $run->state = $state;

            // The queue is only good to a few seconds, so the last stretch before an announcement
            // is waited out here, and the job comes back a little early for the rest.
            $wait = $left - ($state['marks'][0] ?? 0);
            if ($wait > 8) {
                return min($wait - 3, 900);
            }

            sleep($wait);
        }
    }

    private static function failed(ScheduleRun $run, PrismSchedule $schedule, array $step, string $label, string $message): ?int
    {
        $state = $run->state;
        $attempt = (int) ($state['attempt'] ?? 0);
        foreach (['until', 'since', 'end', 'marks'] as $key) {
            unset($state[$key]);
        }

        if ($attempt < (int) $step['retries']) {
            $state['attempt'] = $attempt + 1;
            $run->state = $state;
            $run->write('warning', sprintf('%s failed: %s Trying again (%d of %d).', $label, $message, $attempt + 1, $step['retries']), $step['id']);
            $run->save();

            return 10;
        }

        if ($step['continueOnFailure']) {
            $run->write('warning', sprintf('%s failed: %s Carrying on.', $label, $message), $step['id']);
            $state['attempt'] = 0;
            $state['path'] = Steps::next($schedule->steps, $state['path']);
            $run->state = $state;
            $run->save();
            if ($state['path'] === null) {
                self::finish($run, 'done', 'Finished.');

                return null;
            }

            return 0;
        }

        $run->state = $state;
        $run->write('error', sprintf('%s failed: %s', $label, $message), $step['id']);
        self::finish($run, 'failed', 'Stopped at a failed step.');

        return null;
    }

    public static function finish(ScheduleRun $run, string $status, string $message): void
    {
        $state = $run->state;
        $state['detail'] = null;
        $run->state = $state;
        $run->write($status === 'done' ? 'success' : ($status === 'cancelled' ? 'warning' : 'error'), $message);
        $run->forceFill(['status' => $status, 'finished_at' => now()])->save();
        $run->schedule?->forceFill(['last_status' => $status])->save();
    }

    /** @return array<string, string|int|callable> */
    public static function variables(Server $server, PrismSchedule $schedule): array
    {
        return [
            'server' => $server->name,
            'schedule' => $schedule->name,
            'date' => now()->toDateString(),
            'players' => static fn () => Players::count($server)['online'] ?? null,
            'max_players' => static fn () => Players::count($server)['max'] ?? null,
            'uptime' => static function () use ($server): ?string {
                try {
                    $uptime = app(ReadsServerState::class)->read($server)->uptime;
                } catch (Throwable) {
                    return null;
                }

                return Text::duration(intdiv($uptime, 1000));
            },
            'time' => '',
        ];
    }

    /** The next time a cron expression fires, in the panel's time zone. */
    public static function nextRun(string $cron, ?CarbonInterface $from = null): ?CarbonInterface
    {
        try {
            return CarbonImmutable::instance((new CronExpression($cron))->getNextRunDate($from ?? now(), 0, false, config('app.timezone')));
        } catch (Throwable) {
            return null;
        }
    }

    /** @return list<string> the runs within the coming days, as ISO times */
    public static function upcoming(string $cron, int $days = 7, int $limit = 200): array
    {
        $times = [];
        $cursor = now();
        $end = now()->addDays($days);
        while (count($times) < $limit) {
            $next = self::nextRun($cron, $cursor);
            if ($next === null || $next->gt($end)) {
                break;
            }

            $times[] = $next->toIso8601String();
            $cursor = $next->addSecond();
        }

        return $times;
    }
}
