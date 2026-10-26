<?php

declare(strict_types=1);

namespace PrismAuth\Support;

use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use Throwable;

/** Prism Auth's settings from Prism Properties. */
final class Settings
{
    public const string EXTENSION = 'prism-auth';

    public static function get(string $key, mixed $default = null): mixed
    {
        try {
            return app(ExtensionSettingsRegistry::class)->get(self::EXTENSION)?->get($key) ?? $default;
        } catch (Throwable) {
            return $default;
        }
    }

    public static function bool(string $key, bool $default = false): bool
    {
        $value = self::get($key, $default);

        return is_bool($value) ? $value : filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    public static function int(string $key, int $default): int
    {
        $value = self::get($key, $default);

        return is_numeric($value) ? (int) $value : $default;
    }

    public static function string(string $key, string $default = ''): string
    {
        $value = self::get($key, $default);

        return is_scalar($value) ? trim((string) $value) : $default;
    }

    /**
     * A list setting written one per line or comma separated, lower-case.
     *
     * @return list<string>
     */
    public static function list(string $key): array
    {
        return array_values(array_filter(array_map(static fn (string $item): string => mb_strtolower(trim($item)), preg_split('/[\s,]+/', self::string($key)) ?: [])));
    }
}
