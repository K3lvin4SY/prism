<?php

declare(strict_types=1);

namespace McSuite\Support;

use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * Works out what a server runs: its edition, its software, and its Minecraft version.
 * The answer decides which tabs a server gets, so it is cached for a few minutes.
 */
final class Detector
{
    /** Kinds an egg override may force. */
    public const array KINDS = ['auto', 'off', 'vanilla', 'plugins', 'modded', 'hybrid', 'proxy', 'bedrock'];

    /** Software name → [kind, mcjars type, plugin loaders, mod loaders]. */
    private const array SOFTWARE = [
        'vanilla' => ['vanilla', 'VANILLA', [], []],
        'paper' => ['plugins', 'PAPER', ['paper', 'spigot', 'bukkit'], []],
        'purpur' => ['plugins', 'PURPUR', ['purpur', 'paper', 'spigot', 'bukkit'], []],
        'pufferfish' => ['plugins', 'PUFFERFISH', ['paper', 'spigot', 'bukkit'], []],
        'leaf' => ['plugins', 'LEAF', ['paper', 'spigot', 'bukkit'], []],
        'folia' => ['plugins', 'FOLIA', ['folia'], []],
        'spigot' => ['plugins', 'SPIGOT', ['spigot', 'bukkit'], []],
        'fabric' => ['modded', 'FABRIC', [], ['fabric']],
        'quilt' => ['modded', 'QUILT', [], ['quilt', 'fabric']],
        'forge' => ['modded', 'FORGE', [], ['forge']],
        'neoforge' => ['modded', 'NEOFORGE', [], ['neoforge']],
        'mohist' => ['hybrid', 'MOHIST', ['spigot', 'bukkit'], ['forge']],
        'arclight' => ['hybrid', 'ARCLIGHT', ['spigot', 'bukkit'], ['forge', 'neoforge', 'fabric']],
        'velocity' => ['proxy', 'VELOCITY', ['velocity'], []],
        'waterfall' => ['proxy', 'WATERFALL', ['waterfall', 'bungeecord'], []],
        'bungeecord' => ['proxy', 'BUNGEECORD', ['bungeecord'], []],
        'bedrock' => ['bedrock', null, [], []],
    ];

    /** Fallback software when only a kind is known. */
    private const array KIND_DEFAULTS = [
        'vanilla' => 'vanilla',
        'plugins' => 'paper',
        'modded' => 'fabric',
        'hybrid' => 'mohist',
        'proxy' => 'velocity',
        'bedrock' => 'bedrock',
    ];

    /** Egg tags of other games: a server tagged only with these is never Minecraft. */
    private const array OTHER_GAMES = ['srcds', 'rust', 'garrysmod', 'fivem', 'voice'];

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
        return 'ext:mc-suite:info:'.$server->uuid;
    }

    /** @return array<string, mixed> */
    private function detect(): array
    {
        $egg = $this->server->egg;
        $tags = $egg ? array_map('strtolower', $egg->tagSlugs()) : [];
        $override = Settings::eggType($egg);
        $record = Settings::server($this->server)->get('software');
        $record = is_array($record) ? $record : null;

        if ($override === 'off') {
            return $this->result(null, 'override');
        }

        if ($override !== 'auto') {
            $software = $this->detectFromFiles() ?? self::KIND_DEFAULTS[$override];
            if (self::SOFTWARE[$software][0] !== $override) {
                $software = self::KIND_DEFAULTS[$override];
            }

            return $this->result($software, 'override', $record);
        }

        if (in_array('bedrock', $tags, true)) {
            return $this->result('bedrock', 'egg', $record);
        }

        if (! in_array('minecraft', $tags, true) && array_intersect($tags, self::OTHER_GAMES) !== []) {
            return $this->result(null, 'egg');
        }

        if (is_string($record['software'] ?? null) && isset(self::SOFTWARE[$record['software']])) {
            return $this->result($record['software'], 'record', $record);
        }

        $software = $this->detectFromFiles();
        $fromEgg = $this->detectFromEgg();

        // A server that has not started yet looks like vanilla on disk; the egg knows better.
        if ($software === 'vanilla' && $fromEgg !== null && $fromEgg !== 'bedrock') {
            return $this->result($fromEgg, 'egg', $record);
        }

        if ($software !== null) {
            return $this->result($software, 'files', $record);
        }

        $software = $fromEgg;
        if ($software !== null) {
            return $this->result($software, 'egg', $record);
        }

        return $this->result(in_array('minecraft', $tags, true) ? 'vanilla' : null, 'egg', $record);
    }

    private function detectFromFiles(): ?string
    {
        try {
            $files = ServerFiles::for($this->server);
            $root = $files->list('');
        } catch (Throwable) {
            return null;
        }

        $has = static fn (string $name): bool => array_key_exists($name, $root);

        if ($has('bedrock_server') || $has('bedrock_server.exe')) {
            return 'bedrock';
        }

        if ($has('velocity.toml')) {
            return 'velocity';
        }

        if ($has('waterfall.yml')) {
            return 'waterfall';
        }

        if ($has('modules.yml') && $has('config.yml') && ! $has('server.properties')) {
            return 'bungeecord';
        }

        if ($has('arclight.conf')) {
            return 'arclight';
        }

        if ($has('mohist-config')) {
            return 'mohist';
        }

        if ($has('libraries')) {
            $net = $files->list('libraries/net');
            if (array_key_exists('neoforged', $net)) {
                return 'neoforge';
            }

            if (array_key_exists('minecraftforge', $net)) {
                return 'forge';
            }
        }

        if ($has('.fabric') || $has('fabric-server-launch.jar') || $has('fabric-server-launcher.properties')) {
            return 'fabric';
        }

        if ($has('.quilt') || $has('quilt-server-launcher.jar')) {
            return 'quilt';
        }

        if ($has('purpur.yml')) {
            return 'purpur';
        }

        if ($has('pufferfish.yml')) {
            return 'pufferfish';
        }

        if ($has('leaf.yml') || ($has('config') && array_key_exists('leaf-global.yml', $files->list('config')))) {
            return 'leaf';
        }

        if ($has('config') && array_key_exists('paper-global.yml', $files->list('config'))) {
            return 'paper';
        }

        if ($has('paper.yml')) {
            return 'paper';
        }

        if ($has('spigot.yml')) {
            return 'spigot';
        }

        if ($has('mods')) {
            return 'fabric';
        }

        if ($has('plugins')) {
            return 'paper';
        }

        if ($has('server.properties') || $has('eula.txt')) {
            return 'vanilla';
        }

        return null;
    }

    private function detectFromEgg(): ?string
    {
        $name = strtolower(($this->server->egg->name ?? '').' '.($this->server->startup ?? ''));
        foreach (['neoforge', 'forge', 'fabric', 'quilt', 'purpur', 'folia', 'paper', 'spigot', 'velocity', 'waterfall', 'bungee', 'bedrock', 'vanilla'] as $needle) {
            if (str_contains($name, $needle)) {
                return $needle === 'bungee' ? 'bungeecord' : $needle;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>|null  $record
     * @return array<string, mixed>
     */
    private function result(?string $software, string $source, ?array $record = null): array
    {
        if ($software === null) {
            return [
                'minecraft' => false,
                'edition' => null,
                'software' => null,
                'kind' => null,
                'mcjarsType' => null,
                'version' => null,
                'build' => null,
                'pluginLoaders' => [],
                'modLoaders' => [],
                'features' => array_fill_keys(['players', 'versions', 'properties', 'plugins', 'mods', 'modpacks'], false),
                'jarFile' => null,
                'source' => $source,
            ];
        }

        [$kind, $mcjarsType, $pluginLoaders, $modLoaders] = self::SOFTWARE[$software];
        $matchesRecord = ($record['software'] ?? null) === $software;
        $version = $matchesRecord && is_string($record['version'] ?? null) ? $record['version'] : $this->detectVersion($software);

        return [
            'minecraft' => true,
            'edition' => $kind === 'bedrock' ? 'bedrock' : 'java',
            'software' => $software,
            'kind' => $kind,
            'mcjarsType' => $mcjarsType,
            'version' => $version,
            'build' => $matchesRecord ? ($record['build'] ?? null) : null,
            'buildId' => $matchesRecord ? ($record['buildId'] ?? null) : null,
            'pluginLoaders' => $pluginLoaders,
            'modLoaders' => $modLoaders,
            'features' => [
                'players' => $kind !== 'proxy',
                'versions' => true,
                'properties' => $kind !== 'proxy',
                'plugins' => in_array($kind, ['plugins', 'hybrid', 'proxy'], true),
                'mods' => in_array($kind, ['modded', 'hybrid'], true),
                'modpacks' => in_array($kind, ['modded', 'hybrid'], true),
            ],
            'jarFile' => $kind === 'bedrock' ? null : $this->jarFile(),
            'source' => $source,
        ];
    }

    /**
     * The software name for an mcjars type. Forks MC Suite has no name for are grouped with
     * the software they are compatible with, using mcjars' own compatibility list.
     */
    public static function softwareForMcJars(string $type): ?string
    {
        $type = strtoupper($type);
        foreach (self::SOFTWARE as $software => [, $mcjarsType]) {
            if ($mcjarsType === $type) {
                return $software;
            }
        }

        foreach (McJars::types() as $group) {
            $definition = $group[$type] ?? null;
            if (! is_array($definition)) {
                continue;
            }

            $compatibility = $definition['compatibility'] ?? [];
            $categories = $definition['categories'] ?? [];
            foreach (['folia', 'purpur', 'paper', 'spigot', 'neoforge', 'forge', 'quilt', 'fabric', 'velocity', 'bungeecord'] as $candidate) {
                if (in_array($candidate, $compatibility, true)) {
                    if (in_array('modded', $categories, true) && in_array('plugins', $categories, true)) {
                        return 'mohist';
                    }

                    return $candidate;
                }
            }

            return in_array('modded', $categories, true) ? 'fabric' : 'vanilla';
        }

        return null;
    }

    public function jarFile(): string
    {
        foreach ($this->server->variables as $variable) {
            if ($variable->env_variable === 'SERVER_JARFILE') {
                $value = $variable->server_value ?? $variable->default_value;

                return is_string($value) && $value !== '' ? ServerFiles::normalize($value) : 'server.jar';
            }
        }

        return 'server.jar';
    }

    private function detectVersion(string $software): ?string
    {
        try {
            $files = ServerFiles::for($this->server);

            if ($software !== 'bedrock') {
                $history = $files->readJson('version_history.json', 64_000);
                if (is_string($history['currentVersion'] ?? null) && preg_match('/MC: ([0-9][^)\s]*)/', $history['currentVersion'], $match)) {
                    return $match[1];
                }

                $server = $files->list('libraries/net/minecraft/server');
                foreach (array_keys($server) as $name) {
                    if (preg_match('/^\d+\.\d+(\.\d+)?$/', $name)) {
                        return $name;
                    }
                }

                foreach (array_keys($files->list('.fabric/server')) as $name) {
                    if (preg_match('/^(\d+\.\d+(?:\.\d+)?)-server\.jar$/', $name, $match)) {
                        return $match[1];
                    }
                }
            }

            $size = $files->size('logs/latest.log');
            $log = $size !== null && $size < 4_000_000 ? ($files->read('logs/latest.log') ?? '') : '';
            $log .= "\n".implode("\n", \Pterodactyl\Facades\Daemon::server($this->server)->logs(100));

            $pattern = $software === 'bedrock'
                ? '/Version:?\s+(\d+\.\d+\.\d+(?:\.\d+)?)/'
                : '/Starting minecraft server version ([^\s]+)/i';
            if (preg_match($pattern, $log, $match)) {
                return $match[1];
            }

            foreach ($this->server->variables as $variable) {
                if (in_array($variable->env_variable, ['MINECRAFT_VERSION', 'MC_VERSION', 'VANILLA_VERSION', 'BEDROCK_VERSION'], true)) {
                    $value = (string) ($variable->server_value ?? $variable->default_value ?? '');
                    if (preg_match('/^\d+\.\d+(\.\d+){0,2}$/', $value)) {
                        return $value;
                    }
                }
            }
        } catch (Throwable) {
            // Version stays unknown; the Versions tab lets the user pick one.
        }

        return null;
    }
}
