<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Support;

use Pterodactyl\Models\Server;
use Pterodactyl\Services\Extensions\ExtensionSettings;
use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use Throwable;

/**
 * Where Prism Core Keeper keeps its state: admin settings and per-server metadata.
 */
final class Settings
{
    public const string EXTENSION = 'prism-corekeeper';

    /** Egg tags Prism Core Keeper detects when the admin has not changed the list. */
    public const string DEFAULT_TAGS = 'core-keeper, corekeeper';

    public const string USER_AGENT = 'Donkare/prism-corekeeper/0.1.0 (Pterodactyl Panel extension)';

    /** The dedicated server's Steam app, and the game whose Workshop and mod.io page hold the mods. */
    public const int SERVER_APP = 1963720;

    public const int GAME_APP = 1621690;

    public static function store(): ExtensionSettings
    {
        return new ExtensionSettings(self::EXTENSION);
    }

    /** Per-server metadata: installed mods and the chosen branch. */
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

    public static function string(string $key): string
    {
        $value = self::admin($key, '');

        return is_scalar($value) ? trim((string) $value) : '';
    }

    /**
     * The egg tags that mark a server as Core Keeper, from Prism Properties: lower-case, without
     * blanks. Empty falls back to the default.
     *
     * @return list<string>
     */
    public static function eggTags(): array
    {
        $value = self::admin('egg_tags', self::DEFAULT_TAGS);
        $tags = array_values(array_unique(array_filter(array_map(static fn (string $tag): string => strtolower(trim($tag)), explode(',', is_string($value) ? $value : '')))));

        return $tags === [] ? array_map('trim', explode(',', self::DEFAULT_TAGS)) : $tags;
    }
}
