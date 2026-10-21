<?php

declare(strict_types=1);

namespace McSuite\Support;

use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Extensions\ExtensionSettings;
use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use Throwable;

/**
 * Where MC Suite keeps its state: admin settings, per-egg form values, and per-server metadata.
 */
final class Settings
{
    public const string EXTENSION = 'mc-suite';

    public static function store(): ExtensionSettings
    {
        return new ExtensionSettings(self::EXTENSION);
    }

    /** Per-server metadata: installed software build, installed content and modpack records. */
    public static function server(Server $server): ExtensionSettings
    {
        return self::store()->forServer($server);
    }

    /** An admin setting from the extension's settings page, or its default. */
    public static function admin(string $key, mixed $default = null): mixed
    {
        try {
            return app(ExtensionSettingsRegistry::class)->get(self::EXTENSION)?->get($key) ?? $default;
        } catch (Throwable) {
            return $default;
        }
    }

    /** The egg's forced server type from the admin egg form, or `auto`. */
    public static function eggType(?Egg $egg): string
    {
        if (! $egg instanceof Egg || ! $egg->exists) {
            return 'auto';
        }

        try {
            $value = self::store()->fields($egg)->get('type');
        } catch (Throwable) {
            return 'auto';
        }

        return is_string($value) && in_array($value, Detector::KINDS, true) ? $value : 'auto';
    }
}
