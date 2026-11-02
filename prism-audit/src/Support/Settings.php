<?php

declare(strict_types=1);

namespace PrismAudit\Support;

use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use Throwable;

/** Prism Audit's settings from Prism Properties. */
final class Settings
{
    public const string EXTENSION = 'prism-audit';

    /** Admin actions worth an alert unless the admin chooses others. */
    public const array RISKY_ADMIN_EVENTS = ['admin:server.delete', 'admin:user.delete', 'admin:node.delete', 'admin:api-key.create', 'admin:user.disable-2fa'];

    /** The same defaults the provider registers, for when the registry cannot be read. */
    public const array DEFAULTS = [
        'alerts' => true,
        'rule_new_ip' => true,
        'new_ip_who' => 'admins',
        'new_ip_days' => 90,
        'rule_failed' => true,
        'fail_count' => 10,
        'fail_minutes' => 10,
        'rule_two_factor' => true,
        'admin_events' => self::RISKY_ADMIN_EVENTS,
        'alert_email' => false,
        'alert_webhook_on' => false,
        'alert_webhook' => '',
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

    public static function string(string $key): string
    {
        $value = self::get($key);

        return is_string($value) ? trim($value) : '';
    }

    /** @return list<string> */
    public static function list(string $key): array
    {
        $value = self::get($key);

        return is_array($value) ? array_values(array_filter($value, 'is_string')) : [];
    }
}
