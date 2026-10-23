<?php

declare(strict_types=1);

namespace PrismSchedules\Support;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;
use Throwable;

/**
 * A schedule's steps: a list where an If/Else step holds two more lists. A step is found by
 * its path, such as [2, 'then', 0] for the first step in the Then branch of the third step.
 */
final class Steps
{
    public const array TYPES = ['command', 'power', 'backup', 'wait', 'waitFor', 'countdown', 'discord', 'run', 'if'];

    public const array SIGNALS = ['start', 'stop', 'restart', 'kill'];

    public const array CONDITIONS = ['online', 'offline', 'players_above', 'players_below', 'time_between', 'weekday'];

    public const array MARKS = [3600, 1800, 900, 600, 300, 120, 60, 30, 10, 5, 4, 3, 2, 1];

    private const int MAX_DEPTH = 3;

    /**
     * Checks and cleans the steps a person sent. A Discord webhook is stored encrypted; one sent
     * empty keeps the stored one of the step with the same id.
     *
     * @param  list<array<string, mixed>>  $previous
     * @return list<array<string, mixed>>
     */
    public static function normalize(mixed $steps, array $previous = [], int $depth = 0): array
    {
        abort_unless(is_array($steps) && array_is_list($steps), 422, 'The steps are not valid.');
        abort_if($depth > self::MAX_DEPTH, 422, 'If/Else steps can only be nested three deep.');
        $old = [];
        foreach (self::flatten($previous) as $step) {
            $old[$step['id']] = $step;
        }

        $clean = [];
        foreach ($steps as $index => $step) {
            abort_unless(is_array($step), 422, 'The steps are not valid.');
            $type = (string) ($step['type'] ?? '');
            abort_unless(in_array($type, self::TYPES, true), 422, sprintf('Step %d has an unknown type.', $index + 1));
            $config = is_array($step['config'] ?? null) ? $step['config'] : [];
            $id = is_string($step['id'] ?? null) && preg_match('/^[\w-]{1,40}$/', $step['id']) === 1 ? $step['id'] : (string) Str::uuid();
            $label = sprintf('Step %d (%s)', $index + 1, $type);

            $entry = [
                'id' => $id,
                'type' => $type,
                'config' => self::config($type, $config, $old[$id] ?? null, $label, $previous, $depth),
                'continueOnFailure' => (bool) ($step['continueOnFailure'] ?? false),
                'retries' => max(0, min(3, (int) ($step['retries'] ?? 0))),
            ];
            if ($type === 'if') {
                $entry['then'] = self::normalize($step['then'] ?? [], $previous, $depth + 1);
                $entry['else'] = self::normalize($step['else'] ?? [], $previous, $depth + 1);
            }

            $clean[] = $entry;
        }

        return $clean;
    }

    private static function config(string $type, array $config, ?array $old, string $label, array $previous, int $depth): array
    {
        $text = static fn (string $key, int $max = 2000): string => mb_substr(trim((string) ($config[$key] ?? '')), 0, $max);
        $int = static fn (string $key, int $min, int $max, int $default): int => max($min, min($max, (int) ($config[$key] ?? $default)));

        switch ($type) {
            case 'command':
                $command = $text('command', 1000);
                abort_if($command === '', 422, $label.' needs a command.');

                return ['command' => $command];
            case 'power':
                $signal = (string) ($config['signal'] ?? '');
                abort_unless(in_array($signal, self::SIGNALS, true), 422, $label.' needs a power action.');

                return ['signal' => $signal];
            case 'backup':
                return ['name' => $text('name', 150), 'profile' => $text('profile', 64), 'locked' => (bool) ($config['locked'] ?? false)];
            case 'wait':
                return ['seconds' => $int('seconds', 1, 86400, 60)];
            case 'waitFor':
                $state = (string) ($config['state'] ?? 'running');
                abort_unless(in_array($state, ['running', 'offline'], true), 422, $label.' must wait for online or offline.');

                return ['state' => $state, 'timeout' => $int('timeout', 10, 3600, 300)];
            case 'countdown':
                $marks = array_values(array_unique(array_filter(array_map('intval', is_array($config['marks'] ?? null) ? $config['marks'] : []), static fn (int $mark): bool => in_array($mark, self::MARKS, true))));
                rsort($marks);
                $message = $text('message', 500);
                abort_if($message === '', 422, $label.' needs a message.');
                $command = $text('command', 500) ?: 'say {message}';

                return ['seconds' => $int('seconds', 5, 7200, 600), 'marks' => $marks, 'message' => $message, 'command' => $command];
            case 'discord':
                abort_unless(Settings::bool('feature_discord', true), 422, 'The administrator has turned off Discord messages.');
                $webhook = $text('webhook', 500);
                if ($webhook === '' && is_string($old['config']['webhook'] ?? null)) {
                    $stored = $old['config']['webhook'];
                } else {
                    abort_unless(preg_match('#^https://(?:ptb\.|canary\.)?discord(?:app)?\.com/api/webhooks/\d+/[\w-]+$#', $webhook) === 1, 422, $label.' needs a Discord webhook address.');
                    $stored = Crypt::encryptString($webhook);
                }
                $content = $text('content', 2000);
                abort_if($content === '', 422, $label.' needs a message.');

                return ['webhook' => $stored, 'content' => $content, 'username' => $text('username', 80)];
            case 'run':
                return ['schedule' => isset($config['schedule']) ? (int) $config['schedule'] : null];
            case 'if':
                return self::condition($config, $label);
        }

        return [];
    }

    /** A condition, for an If/Else step or a schedule. */
    public static function condition(array $config, string $label = 'The condition'): array
    {
        $type = (string) ($config['type'] ?? 'online');
        abort_unless(in_array($type, self::CONDITIONS, true), 422, $label.' has an unknown condition.');
        $time = static fn (mixed $value): string => is_string($value) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value) === 1 ? $value : '00:00';

        return match ($type) {
            'players_above', 'players_below' => ['type' => $type, 'count' => max(0, min(10000, (int) ($config['count'] ?? 0)))],
            'time_between' => ['type' => $type, 'from' => $time($config['from'] ?? null), 'to' => $time($config['to'] ?? null)],
            'weekday' => ['type' => $type, 'days' => array_values(array_unique(array_filter(array_map('intval', is_array($config['days'] ?? null) ? $config['days'] : []), static fn (int $day): bool => $day >= 0 && $day <= 6)))],
            default => ['type' => $type],
        };
    }

    /** @return list<array<string, mixed>> every step, branches included */
    public static function flatten(array $steps): array
    {
        $all = [];
        foreach ($steps as $step) {
            if (! is_array($step) || ! isset($step['id'])) {
                continue;
            }

            $all[] = $step;
            if (($step['type'] ?? null) === 'if') {
                array_push($all, ...self::flatten($step['then'] ?? []), ...self::flatten($step['else'] ?? []));
            }
        }

        return $all;
    }

    /** @return list<string> the permissions running these steps needs */
    public static function permissions(array $steps): array
    {
        $needed = [];
        foreach (self::flatten($steps) as $step) {
            $needed[] = match ($step['type']) {
                'command', 'countdown' => 'control.console',
                'power' => match ($step['config']['signal']) {
                    'start' => 'control.start',
                    'restart' => 'control.restart',
                    default => 'control.stop',
                },
                'backup' => 'backup.create',
                default => null,
            };
        }

        return array_values(array_unique(array_filter($needed)));
    }

    /** Steps for the browser: Discord webhooks are left out, with a flag that one is stored. */
    public static function present(array $steps): array
    {
        return array_map(static function (array $step): array {
            if ($step['type'] === 'discord') {
                $step['config']['webhookSet'] = is_string($step['config']['webhook'] ?? null) && $step['config']['webhook'] !== '';
                $step['config']['webhook'] = '';
            }
            if ($step['type'] === 'if') {
                $step['then'] = self::present($step['then'] ?? []);
                $step['else'] = self::present($step['else'] ?? []);
            }

            return $step;
        }, $steps);
    }

    public static function webhook(array $step): ?string
    {
        try {
            return Crypt::decryptString((string) ($step['config']['webhook'] ?? ''));
        } catch (Throwable) {
            return null;
        }
    }

    /** @param list<int|string> $path */
    public static function at(array $steps, array $path): ?array
    {
        $list = $steps;
        $step = null;
        for ($index = 0; $index < count($path); $index++) {
            $segment = $path[$index];
            if (is_string($segment)) {
                $list = $step[$segment] ?? [];
                continue;
            }

            $step = $list[$segment] ?? null;
            if ($step === null) {
                return null;
            }
        }

        return $step;
    }

    /**
     * The step after the one at $path: the next in its list, or the step after the If/Else it
     * sits in when it was the last. Null at the end.
     *
     * @param  list<int|string>  $path
     * @return list<int|string>|null
     */
    public static function next(array $steps, array $path): ?array
    {
        while ($path !== []) {
            $last = array_pop($path);
            $sibling = [...$path, $last + 1];
            if (self::at($steps, $sibling) !== null) {
                return $sibling;
            }

            // Leave the branch: drop its name and continue after the If/Else step.
            if ($path === []) {
                return null;
            }
            array_pop($path);
        }

        return null;
    }

    public static function label(array $step): string
    {
        $config = $step['config'] ?? [];

        return match ($step['type']) {
            'command' => 'Send command: '.$config['command'],
            'power' => 'Power: '.$config['signal'],
            'backup' => 'Create backup'.(($config['profile'] ?? '') !== '' ? ' with '.$config['profile'] : ''),
            'wait' => 'Wait '.Text::duration((int) $config['seconds']),
            'waitFor' => 'Wait until the server is '.($config['state'] === 'running' ? 'online' : 'offline'),
            'countdown' => 'Countdown of '.Text::duration((int) $config['seconds']),
            'discord' => 'Discord message',
            'run' => 'Run another schedule',
            'if' => 'If '.str_replace('_', ' ', (string) ($config['type'] ?? '')),
            default => $step['type'],
        };
    }
}
