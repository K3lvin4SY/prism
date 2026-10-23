<?php

declare(strict_types=1);

namespace PrismSchedules\Support;

use Carbon\CarbonInterface;
use Pterodactyl\Contracts\Servers\ReadsServerState;
use Pterodactyl\Models\Server;
use Throwable;

/** Checks the conditions of a schedule and of If/Else steps. */
final class Conditions
{
    public static function state(Server $server): ?string
    {
        try {
            return app(ReadsServerState::class)->read($server)->state;
        } catch (Throwable) {
            return null;
        }
    }

    public static function online(Server $server): bool
    {
        return in_array(self::state($server), ['running', 'starting'], true);
    }

    /** Whether one condition holds, with why when it does not. */
    public static function holds(array $condition, Server $server, ?CarbonInterface $now = null): bool
    {
        $now ??= now();

        return match ($condition['type'] ?? null) {
            'online' => self::online($server),
            'offline' => self::state($server) === 'offline',
            'players_above' => (self::players($server) ?? -1) > (int) $condition['count'],
            'players_below' => ($players = self::players($server)) !== null && $players < (int) $condition['count'],
            'time_between' => self::between($now, (string) $condition['from'], (string) $condition['to']),
            'weekday' => in_array($now->dayOfWeek, $condition['days'] ?? [], true),
            default => true,
        };
    }

    /**
     * Whether a schedule may run now: each of its conditions, all of which must hold.
     *
     * @return string|null why it may not, or null when it may
     */
    public static function blocker(array $conditions, Server $server, ?string $lastStatus): ?string
    {
        foreach ($conditions['all'] ?? [] as $condition) {
            if (! self::holds($condition, $server)) {
                return 'Skipped: '.self::describe($condition).' does not hold.';
            }
        }

        if (($conditions['lastSucceeded'] ?? false) && in_array($lastStatus, ['failed', 'cancelled'], true)) {
            return 'Skipped: the last run did not succeed.';
        }

        return null;
    }

    public static function describe(array $condition): string
    {
        return match ($condition['type'] ?? null) {
            'online' => 'the server is online',
            'offline' => 'the server is offline',
            'players_above' => 'more than '.$condition['count'].' players are online',
            'players_below' => 'fewer than '.$condition['count'].' players are online',
            'time_between' => 'the time is between '.$condition['from'].' and '.$condition['to'],
            'weekday' => 'today is one of the chosen days',
            default => 'the condition',
        };
    }

    private static function players(Server $server): ?int
    {
        return Players::count($server)['online'] ?? null;
    }

    /** Between two times of day; a window past midnight, such as 22:00 to 06:00, works too. */
    public static function between(CarbonInterface $now, string $from, string $to): bool
    {
        $minutes = $now->hour * 60 + $now->minute;
        [$fromHour, $fromMinute] = array_map('intval', explode(':', $from));
        [$toHour, $toMinute] = array_map('intval', explode(':', $to));
        $start = $fromHour * 60 + $fromMinute;
        $end = $toHour * 60 + $toMinute;

        return $start <= $end ? $minutes >= $start && $minutes < $end : $minutes >= $start || $minutes < $end;
    }
}
