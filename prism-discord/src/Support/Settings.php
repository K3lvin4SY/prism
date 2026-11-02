<?php

declare(strict_types=1);

namespace PrismDiscord\Support;

use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use Throwable;

/** Prism Discord' settings from Prism Properties. */
final class Settings
{
    public const string EXTENSION = 'prism-discord';

    /** The same defaults the provider registers, for when the registry cannot be read. */
    public const array DEFAULTS = [
        'enabled' => true,
        'players' => true,
        'max_hooks' => 5,
        'app_id' => '',
        'public_key' => '',
        'bot_token' => '',
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
