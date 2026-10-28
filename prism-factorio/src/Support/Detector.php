<?php

declare(strict_types=1);

namespace PrismFactorio\Support;

use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * Works out whether a server runs Factorio's headless server, and which version: the egg has a
 * Factorio tag or starts bin/x64/factorio. The answer decides which tabs a server gets, so it
 * is cached for a few minutes.
 */
final class Detector
{
    public const array FEATURES = ['players', 'properties', 'versions', 'mods'];

    /** The mods the expansion brings, shipped in data/ with the game rather than downloaded. */
    public const array BUILT_IN = ['base', 'elevated-rails', 'quality', 'recycler', 'space-age'];

    public function __construct(private readonly Server $server) {}

    public static function for(Server $server): self
    {
        return new self($server);
    }

    public static function forget(Server $server): void
    {
        Cache::forget(self::cacheKey($server));
    }

    /** @return array<string, mixed> */
    public function info(bool $fresh = false): array
    {
        if ($fresh) {
            self::forget($this->server);
        }

        return Cache::remember(self::cacheKey($this->server), 300, fn (): array => $this->detect());
    }

    private static function cacheKey(Server $server): string
    {
        // The detected tags are part of the key, so changing them applies at once.
        return 'ext:prism-factorio:info:'.$server->uuid.':'.md5(implode(',', Settings::eggTags()));
    }

    public function isFactorio(): bool
    {
        $egg = $this->server->egg;
        if ($egg === null) {
            return false;
        }

        $detected = Settings::eggTags();
        if ($egg->tags->contains(static fn ($tag): bool => in_array(strtolower((string) $tag->name), $detected, true) || in_array(strtolower((string) $tag->slug), $detected, true))) {
            return true;
        }

        return str_contains((string) $this->server->startup, 'bin/x64/factorio') || str_contains((string) $egg->startup, 'bin/x64/factorio');
    }

    /** @return array<string, mixed> */
    private function detect(): array
    {
        if (! $this->isFactorio()) {
            return ['factorio' => false, 'version' => null, 'expansion' => [], 'save' => null, 'features' => array_fill_keys(self::FEATURES, false)];
        }

        return [
            'factorio' => true,
            // The installed version, such as 2.1.23, from the base mod's info.json.
            'version' => $this->version(),
            // The expansion's mods in data/, which the headless server always has from 2.0 on.
            'expansion' => $this->expansion(),
            'save' => $this->variable('SAVE_NAME') ?? 'gamesave',
            'features' => array_fill_keys(self::FEATURES, true),
        ];
    }

    public function version(): ?string
    {
        try {
            $info = ServerFiles::for($this->server)->readJson('data/base/info.json', 100_000);
        } catch (Throwable) {
            return null;
        }

        return is_string($info['version'] ?? null) && preg_match('/^\d+\.\d+\.\d+$/', $info['version']) ? $info['version'] : null;
    }

    /** @return list<string> */
    private function expansion(): array
    {
        try {
            $data = ServerFiles::for($this->server)->list('data');
        } catch (Throwable) {
            return [];
        }

        return array_values(array_filter(array_slice(self::BUILT_IN, 1), static fn (string $name): bool => isset($data[$name]) && ! $data[$name]['file']));
    }

    /** A startup variable's value on this server, or null when the egg has no such variable. */
    public function variable(string $name): ?string
    {
        foreach ($this->server->variables as $variable) {
            if ($variable->env_variable === $name) {
                $value = $variable->server_value ?? $variable->default_value;

                return is_string($value) && $value !== '' ? $value : null;
            }
        }

        return null;
    }

    /** "2.1.23" -> "2.1", the version mods are made for. */
    public static function major(?string $version): ?string
    {
        return $version !== null && preg_match('/^(\d+\.\d+)/', $version, $match) ? $match[1] : null;
    }
}
