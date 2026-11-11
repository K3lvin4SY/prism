<?php

declare(strict_types=1);

namespace PrismTweaks\Support;

/**
 * Works out the numbers Prism Tweaks gives the panel. Pure, so it can be checked on its own:
 * settings and the panel's own values go in, a number (or null for "no limit") comes out.
 */
final class Limits
{
    /** The APIs whose request limits can be changed, as named in the panel's config/http.php. */
    public const array APIS = ['client', 'application', 'admin'];

    /** No API limit goes below this, so the panel's own pages keep working. */
    public const int LOWEST_API = 30;

    public const int HIGHEST_API = 100000;

    /**
     * The panel's per-server create limits (Pterodactyl\Enum\ResourceLimit), by case name: the
     * setting that changes it, what it counts and the panel's own limit, for the help text.
     */
    public const array RESOURCES = [
        'Backup' => ['key' => 'backup_limit', 'label' => 'Backups started', 'panel' => '3 every 15 minutes'],
        'Database' => ['key' => 'database_limit', 'label' => 'Databases created', 'panel' => '2 a minute'],
        'FilePull' => ['key' => 'filepull_limit', 'label' => 'Files downloaded from a link', 'panel' => '5 every 10 minutes'],
        'Subuser' => ['key' => 'subuser_limit', 'label' => 'Subusers added', 'panel' => '10 every 15 minutes'],
        'Schedule' => ['key' => 'schedule_limit', 'label' => 'Schedules created', 'panel' => '2 a minute'],
        'Allocation' => ['key' => 'allocation_limit', 'label' => 'Allocations added', 'panel' => '2 a minute'],
        'Websocket' => ['key' => 'websocket_limit', 'label' => 'Console connections opened', 'panel' => '5 a minute'],
    ];

    public const int HIGHEST_RESOURCE = 1000;

    /** A whole number above zero from a stored value, or null for "not set". */
    public static function positive(mixed $value): ?int
    {
        if (is_string($value)) {
            $value = trim($value);
        }
        if (is_int($value) || (is_string($value) && preg_match('/^\d+$/', $value) === 1) || (is_float($value) && floor($value) === $value)) {
            $number = (int) $value;

            return $number > 0 ? $number : null;
        }

        return null;
    }

    /**
     * Each user's own API limits, keyed by user id, from the `user_limits` setting. Entries
     * without any limit are left out.
     *
     * @return array<int, array{client: ?int, application: ?int, admin: ?int}>
     */
    public static function users(mixed $stored): array
    {
        if (is_string($stored)) {
            try {
                $stored = json_decode($stored, true, 8, JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                return [];
            }
        }
        if (! is_array($stored)) {
            return [];
        }

        $users = [];
        foreach ($stored as $id => $limits) {
            $id = self::positive($id);
            if ($id === null || ! is_array($limits)) {
                continue;
            }

            $entry = [];
            foreach (self::APIS as $api) {
                $entry[$api] = self::api($limits[$api] ?? null);
            }
            if (array_filter($entry) !== []) {
                $users[$id] = $entry;
            }
        }
        ksort($users);

        return $users;
    }

    /**
     * The `user_limits` setting with one user's limits replaced. All three null takes the user
     * off the list.
     *
     * @param  array<string, mixed>  $limits
     */
    public static function withUser(mixed $stored, int $id, array $limits): string
    {
        $users = self::users($stored);
        $entry = [];
        foreach (self::APIS as $api) {
            $entry[$api] = self::api($limits[$api] ?? null);
        }

        if (array_filter($entry) === []) {
            unset($users[$id]);
        } else {
            $users[$id] = $entry;
        }
        ksort($users);

        return self::encode($users);
    }

    /** @param array<int, array<string, ?int>> $users */
    public static function encode(array $users): string
    {
        return $users === [] ? '{}' : json_encode((object) $users, JSON_THROW_ON_ERROR);
    }

    /** An API limit kept between the lowest and highest allowed, or null when not set. */
    public static function api(mixed $value): ?int
    {
        $number = self::positive($value);

        return $number === null ? null : max(self::LOWEST_API, min(self::HIGHEST_API, $number));
    }

    /**
     * Requests a minute one user may make to one API, or null for no limit. Root admins have no
     * limit when that is switched on; then come the user's own limit, the limit set for
     * everyone, and the panel's.
     *
     * @param  array<string, mixed>  $settings
     * @param  array<int, array<string, ?int>>  $users  from users()
     */
    public static function apiPerMinute(array $settings, array $users, string $api, ?int $userId, bool $rootAdmin, int $panel): ?int
    {
        if ($userId !== null && $rootAdmin && filter_var($settings['admins_unlimited'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            return null;
        }

        return ($userId !== null ? ($users[$userId][$api] ?? null) : null)
            ?? self::api($settings["{$api}_limit"] ?? null)
            ?? $panel;
    }

    /**
     * How many of one resource a server may create in the panel's period, or null to leave the
     * panel's limit: the server's own number first, then the one set for every server.
     *
     * @param  array<string, mixed>  $settings
     * @param  array<string, mixed>  $server  the server's admin form values
     */
    public static function resource(array $settings, array $server, string $case): ?int
    {
        $key = self::RESOURCES[$case]['key'] ?? null;
        if ($key === null) {
            return null;
        }
        $pick = static fn (mixed $value): ?int => ($number = self::positive($value)) === null ? null : min(self::HIGHEST_RESOURCE, $number);

        return $pick($server[$key] ?? null) ?? $pick($settings[$key] ?? null);
    }
}
