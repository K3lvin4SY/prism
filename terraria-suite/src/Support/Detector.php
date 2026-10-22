<?php

declare(strict_types=1);

namespace TerrariaSuite\Support;

use Illuminate\Support\Facades\Cache;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * Works out which Terraria server a server runs: Re-Logic's vanilla server, TShock, or
 * tModLoader, and its version. The answer decides which tabs a server gets, so it
 * is cached for a few minutes.
 */
final class Detector
{
    /** Kinds an egg override may force. */
    public const array KINDS = ['auto', 'off', 'vanilla', 'tshock', 'tmodloader'];

    /** Startup variables that pick the build each egg installs. */
    public const array VERSION_VARIABLES = [
        'vanilla' => 'TERRARIA_VERSION',
        'tshock' => 'TSHOCK_VERSION',
        'tmodloader' => 'VERSION',
    ];

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
        return 'ext:terraria-suite:info:'.$server->uuid;
    }

    /** @return array<string, mixed> */
    private function detect(): array
    {
        $egg = $this->server->egg;

        // Only servers whose egg carries the Terraria tag are Terraria Suite's; every other game is left alone.
        $tagged = $egg !== null && $egg->tags->contains(
            static fn ($tag): bool => strcasecmp((string) $tag->name, 'terraria') === 0 || in_array(strtolower((string) $tag->slug), ['terraria', 'tria'], true),
        );
        if (! $tagged) {
            return $this->result(null, 'egg');
        }

        $override = Settings::eggType($egg);
        if ($override === 'off') {
            return $this->result(null, 'override');
        }

        if ($override !== 'auto') {
            return $this->result($override, 'override');
        }

        $record = Settings::server($this->server)->get('software');
        if (is_array($record) && in_array($record['kind'] ?? null, ['vanilla', 'tshock', 'tmodloader'], true)) {
            return $this->result($record['kind'], 'record', $record);
        }

        $kind = $this->detectFromFiles() ?? $this->detectFromEgg();

        return $this->result($kind, $kind === null ? 'egg' : 'files');
    }

    private function detectFromFiles(): ?string
    {
        try {
            $root = ServerFiles::for($this->server)->list('');
        } catch (Throwable) {
            return null;
        }

        $has = static fn (string $name): bool => array_key_exists($name, $root);

        if ($has('TShock.Server') || $has('TShock.Server.dll') || $has('ServerPlugins')) {
            return 'tshock';
        }

        if ($has('tModLoader.dll') || $has('tModLoaderServer')) {
            return 'tmodloader';
        }

        if ($has('TerrariaServer.bin.x86_64') || $has('TerrariaServer.exe') || $has('TerrariaServer')) {
            return 'vanilla';
        }

        return null;
    }

    private function detectFromEgg(): ?string
    {
        $text = strtolower(($this->server->egg->name ?? '').' '.($this->server->startup ?? ''));

        return match (true) {
            str_contains($text, 'tshock') => 'tshock',
            str_contains($text, 'tmodloader') => 'tmodloader',
            str_contains($text, 'terraria') => 'vanilla',
            default => null,
        };
    }

    /**
     * @param  array<string, mixed>|null  $record
     * @return array<string, mixed>
     */
    private function result(?string $kind, string $source, ?array $record = null): array
    {
        if ($kind === null) {
            return [
                'terraria' => false,
                'kind' => null,
                'version' => null,
                'build' => null,
                'features' => array_fill_keys(['players', 'properties', 'versions', 'world', 'mods', 'plugins'], false),
                'source' => $source,
            ];
        }

        $versions = $this->detectVersions($kind);

        return [
            'terraria' => true,
            'kind' => $kind,
            // The Terraria version the server speaks, such as 1.4.4.9.
            'version' => $record['version'] ?? $versions['terraria'],
            // The TShock or tModLoader build, or the vanilla release.
            'build' => $record['build'] ?? $versions['build'] ?? $this->variable(self::VERSION_VARIABLES[$kind]),
            'features' => [
                'players' => true,
                'properties' => true,
                'versions' => true,
                'world' => true,
                'mods' => $kind === 'tmodloader',
                'plugins' => $kind === 'tshock',
            ],
            'source' => $source,
        ];
    }

    /**
     * Versions read from the start-up output: "Terraria Server v1.4.4.9", "TShock for Terraria
     * v5.2.0", "tModLoader v2025.x".
     *
     * @return array{terraria: string|null, build: string|null}
     */
    private function detectVersions(string $kind): array
    {
        try {
            $log = implode("\n", Daemon::server($this->server)->logs(200));
        } catch (Throwable) {
            $log = '';
        }

        $log = (string) preg_replace('/\e\[[0-9;]*[A-Za-z]/', '', $log);
        $terraria = preg_match('/Terraria Server v?(\d+\.\d+\.\d+(?:\.\d+)?)/i', $log, $match) ? $match[1] : null;
        $build = match ($kind) {
            'tshock' => preg_match('/TShock (?:for Terraria )?v?(\d+\.\d+\.\d+(?:\.\d+)?)/i', $log, $match) ? $match[1] : null,
            'tmodloader' => $this->tModLoaderBuild($log, $terraria),
            default => $terraria,
        };

        return ['terraria' => $terraria, 'build' => $build];
    }

    /**
     * tModLoader's build, from its own log: "Starting tModLoader server 1.4.4.9+2026.09.2.1|2026.08|preview|…".
     * Its console output scrolls away, so the log file is read when the console has no version.
     */
    private function tModLoaderBuild(string $console, ?string &$terraria): ?string
    {
        $pattern = '/Starting tModLoader (?:server )?v?(\d+\.\d+\.\d+(?:\.\d+)?)\+(\d{4}\.\d+(?:\.\d+)*)/i';
        if (! preg_match($pattern, $console, $match)) {
            try {
                $files = ServerFiles::for($this->server);
                $size = $files->size('tModLoader-Logs/server.log');
                $log = $size !== null && $size < 8_000_000 ? ($files->read('tModLoader-Logs/server.log', 8_000_000) ?? '') : '';
            } catch (Throwable) {
                $log = '';
            }

            if (! preg_match($pattern, substr($log, 0, 4096), $match)) {
                return null;
            }
        }

        $terraria ??= $match[1];

        return $match[2];
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
}
