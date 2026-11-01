<?php

declare(strict_types=1);

namespace PrismNotes\Support;

use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use Throwable;

/** Prism Notes' settings from Prism Properties. */
final class Settings
{
    public const string EXTENSION = 'prism-notes';

    /** The same defaults the provider registers, for when the registry cannot be read. */
    public const array DEFAULTS = [
        'enabled' => true,
        'max_notes' => 50,
        'console_pinned' => true,
    ];

    public static function get(string $key): mixed
    {
        try {
            return app(ExtensionSettingsRegistry::class)->get(self::EXTENSION)?->get($key) ?? self::DEFAULTS[$key] ?? null;
        } catch (Throwable) {
            return self::DEFAULTS[$key] ?? null;
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
}
