<?php

declare(strict_types=1);

namespace PrismNodes\Support;

use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use Throwable;

/** Prism Nodes' settings from Prism Properties. */
final class Settings
{
    public const string EXTENSION = 'prism-nodes';

    /** The same defaults the provider registers, for when the registry cannot be read. */
    public const array DEFAULTS = [
        'history' => true,
        'check_updates' => true,
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
}
