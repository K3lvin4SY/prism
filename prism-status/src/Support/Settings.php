<?php

declare(strict_types=1);

namespace PrismStatus\Support;

use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use Throwable;

/** Prism Status' settings from Prism Properties. */
final class Settings
{
    public const string EXTENSION = 'prism-status';

    /** The same defaults the provider registers, for when the registry cannot be read. */
    public const array DEFAULTS = [
        'enabled' => false,
        'title' => '',
        'intro' => '',
        'history_days' => 90,
        'require_sign_in' => false,
        'layout_logo' => true,
    ];

    public static function get(string $key): mixed
    {
        return self::from(self::EXTENSION, $key) ?? self::DEFAULTS[$key] ?? null;
    }

    /** Another extension's setting, or null when it is not installed or not enabled. */
    public static function from(string $extension, string $key): mixed
    {
        try {
            return app(ExtensionSettingsRegistry::class)->get($extension)?->get($key);
        } catch (Throwable) {
            return null;
        }
    }

    public static function bool(string $key): bool
    {
        $value = self::get($key);

        return is_bool($value) ? $value : filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    public static function int(string $key): int
    {
        $value = self::get($key);

        return is_numeric($value) ? (int) $value : (int) (self::DEFAULTS[$key] ?? 0);
    }

    public static function string(string $key): string
    {
        $value = self::get($key);

        return is_string($value) ? trim($value) : '';
    }

    /** How many days of history the page shows: 30, 60 or 90. */
    public static function historyDays(): int
    {
        $days = self::int('history_days');

        return in_array($days, [30, 60, 90], true) ? $days : 90;
    }
}
