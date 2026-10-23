<?php

declare(strict_types=1);

namespace PrismBackups\Support;

use Pterodactyl\Facades\Extensions;
use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use Throwable;

final class Settings
{
    public const string EXTENSION = 'prism-backups';

    public static function get(string $key, mixed $default = null): mixed
    {
        try {
            return Extensions::settings(self::EXTENSION)->get($key, $default) ?? $default;
        } catch (Throwable) {
            return $default;
        }
    }

    public static function bool(string $key, bool $default): bool
    {
        return (bool) self::get($key, $default);
    }

    public static function int(string $key, int $default): int
    {
        return (int) self::get($key, $default);
    }

    /** The admin's settings as the frontend sees them, so a change shows without a reload. */
    public static function frontend(): object
    {
        return (object) (app(ExtensionSettingsRegistry::class)->get(self::EXTENSION)?->frontendConfig() ?? []);
    }

    /** Where downloaded backups and restores are kept on the panel. */
    public static function storage(string $sub = ''): string
    {
        $path = storage_path('app/prism-backups'.($sub === '' ? '' : '/'.$sub));
        if (! is_dir($path)) {
            mkdir($path, 0750, true);
        }

        return $path;
    }
}
