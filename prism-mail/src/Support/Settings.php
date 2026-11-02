<?php

declare(strict_types=1);

namespace PrismMail\Support;

use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use Throwable;

/** Prism Mail's settings from Prism Properties. */
final class Settings
{
    public const string EXTENSION = 'prism-mail';

    /** The same defaults the provider registers, for when the registry cannot be read. */
    public const array DEFAULTS = [
        'enabled' => true,
        'brand_color' => '#3869d4',
        'logo' => null,
        'layout_logo' => true,
        'header_text' => '',
        'sign_off' => 'Regards,',
        'footer_text' => '',
        'log' => true,
        'log_days' => 30,
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
}
