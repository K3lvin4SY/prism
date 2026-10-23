<?php

declare(strict_types=1);

namespace PrismDatabase\Support;

use Pterodactyl\Facades\Extensions;
use Throwable;

final class Settings
{
    public const string EXTENSION = 'prism-database';

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

    /** Where backups and exports are kept on the panel. */
    public static function storage(int $database): string
    {
        $path = storage_path('app/prism-database/'.$database);
        if (! is_dir($path)) {
            mkdir($path, 0750, true);
        }

        return $path;
    }
}
