<?php

declare(strict_types=1);

namespace PrismSchedules\Support;

final class Text
{
    /** 1 hour, 30 minutes, 10 seconds, 1 hour 30 minutes. */
    public static function duration(int $seconds): string
    {
        $parts = [];
        foreach ([3600 => 'hour', 60 => 'minute', 1 => 'second'] as $size => $unit) {
            if ($seconds >= $size) {
                $count = intdiv($seconds, $size);
                $seconds %= $size;
                $parts[] = $count.' '.$unit.($count === 1 ? '' : 's');
            }
        }

        return $parts === [] ? '0 seconds' : implode(' ', array_slice($parts, 0, 2));
    }

    /**
     * Fills in {server}, {schedule}, {players}, {max_players}, {uptime}, {date}, {time} and
     * {message}; a value the closure for it cannot work out reads "?".
     *
     * @param  array<string, string|int|(callable(): (string|int|null))>  $values
     */
    public static function fill(string $text, array $values): string
    {
        return (string) preg_replace_callback('/\{(\w+)\}/', static function (array $match) use ($values): string {
            if (! array_key_exists($match[1], $values)) {
                return $match[0];
            }

            $value = $values[$match[1]];
            $value = is_callable($value) ? $value() : $value;

            return $value === null ? '?' : (string) $value;
        }, $text);
    }
}
