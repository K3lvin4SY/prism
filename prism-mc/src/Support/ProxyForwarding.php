<?php

declare(strict_types=1);

namespace PrismMc\Support;

use PrismMc\Support\Providers\ModrinthProvider;
use Pterodactyl\Models\Server;
use RuntimeException;

/**
 * The game-server half of a proxy link: player forwarding switched on with the proxy's secret,
 * and the server's own account check switched off, since the proxy does it.
 *
 *  modern  Velocity's own forwarding (1.13+): Paper's proxies.velocity, or FabricProxy-Lite.
 *  legacy  BungeeCord-style forwarding: spigot.yml bungeecord. Used by BungeeCord, Waterfall,
 *          and Velocity's legacy mode.
 *
 * Pumpkin does both natively, in the [networking.proxy] tables of pumpkin.toml.
 */
final class ProxyForwarding
{
    private const array PAPER = ['paper', 'purpur', 'pufferfish', 'leaf', 'folia'];

    private const array SPIGOT = ['spigot', 'mohist', 'arclight'];

    private const array FABRIC = ['fabric', 'quilt'];

    private const string FABRIC_PROXY_LITE = '8dI2tmqs';

    public function __construct(private readonly Server $server, private readonly array $info) {}

    /** The forwarding modes this server software supports. */
    public static function modes(?string $software): array
    {
        return match (true) {
            in_array($software, self::PAPER, true) => ['modern', 'legacy'],
            in_array($software, self::SPIGOT, true) => ['legacy'],
            in_array($software, self::FABRIC, true) => ['modern'],
            $software === 'pumpkin' => ['modern', 'legacy'],
            default => [],
        };
    }

    public function apply(string $mode, ?string $secret): void
    {
        $software = $this->info['software'];
        throw_unless(in_array($mode, self::modes($software), true), RuntimeException::class, sprintf('%s cannot use %s forwarding.', ucfirst((string) $software), $mode));
        throw_if($mode === 'modern' && ($secret === null || $secret === ''), RuntimeException::class, 'The proxy has no forwarding secret.');

        $files = ServerFiles::for($this->server);

        if ($software === 'pumpkin') {
            $this->setPumpkin($mode, $secret);

            return;
        }

        if (in_array($software, self::FABRIC, true)) {
            $this->installFabricProxyLite();
            $config = $files->read('config/FabricProxy-Lite.toml', 64_000);
            $config = $config === null
                ? "hackOnlineMode = true\nhackEarlySend = false\nhackMessageChain = true\ndisconnectMessage = \"This server can only be joined through its proxy.\"\nsecret = \"$secret\"\n"
                : (string) preg_replace('/^secret\s*=.*$/m', 'secret = "'.addcslashes((string) $secret, '"\\').'"', $config);
            $files->makeDirectory('config');
            $files->write('config/FabricProxy-Lite.toml', $config);
        } else {
            $velocity = $mode === 'modern';
            $this->setPaperVelocity($files, $velocity, $velocity ? (string) $secret : null);
            $this->setSpigotBungee($files, ! $velocity);
        }

        $this->setProperties($files, ['online-mode' => 'false'] + ($mode === 'legacy' ? ['enforce-secure-profile' => 'false'] : []));
    }

    /** Puts the server back to standing on its own: forwarding off, account checks on. */
    public function remove(): void
    {
        $files = ServerFiles::for($this->server);
        $software = $this->info['software'];

        if ($software === 'pumpkin') {
            $this->setPumpkin(null, null);

            return;
        }

        if (in_array($software, self::FABRIC, true)) {
            $mods = $files->list('mods');
            $jars = array_values(array_filter(array_keys($mods), static fn (string $name): bool => (bool) preg_match('/^fabricproxy-lite.*\.jar$/i', $name)));
            $files->delete('mods', $jars);
            foreach ($jars as $jar) {
                Settings::server($this->server)->forget("content.mods.$jar");
            }
        } elseif (in_array($software, [...self::PAPER, ...self::SPIGOT], true)) {
            $this->setPaperVelocity($files, false, null);
            $this->setSpigotBungee($files, false);
        }

        $this->setProperties($files, ['online-mode' => 'true']);
    }

    /** Pumpkin: one forwarding table on, or with a null mode all off and account checks back on. */
    private function setPumpkin(?string $mode, ?string $secret): void
    {
        $properties = ServerProperties::load($this->server, $this->info);
        $config = $properties->pumpkin();
        throw_if($config === null, RuntimeException::class, 'pumpkin.toml was not found. Start the server once first.');

        $config->setRaw('networking.proxy', 'enabled', $mode !== null ? 'true' : 'false');
        $config->setRaw('networking.proxy.velocity', 'enabled', $mode === 'modern' ? 'true' : 'false');
        $config->setRaw('networking.proxy.bungeecord', 'enabled', $mode === 'legacy' ? 'true' : 'false');
        if ($mode === 'modern') {
            $config->setRaw('networking.proxy.velocity', 'secret', TomlLines::string((string) $secret));
        }

        $properties->set('online-mode', $mode !== null ? 'false' : 'true')->save();
    }

    private function setPaperVelocity(ServerFiles $files, bool $enabled, ?string $secret): void
    {
        if (! in_array($this->info['software'], self::PAPER, true)) {
            return;
        }

        // Paper 1.19+ keeps it in config/paper-global.yml; older Paper in paper.yml.
        $global = $files->read('config/paper-global.yml', 512_000);
        $legacy = $global === null ? $files->read('paper.yml', 512_000) : null;

        if ($legacy !== null) {
            $legacy = YamlLines::set($legacy, ['settings', 'velocity-support', 'enabled'], $enabled ? 'true' : 'false');
            $legacy = YamlLines::set($legacy, ['settings', 'velocity-support', 'online-mode'], 'true');
            if ($secret !== null) {
                $legacy = YamlLines::set($legacy, ['settings', 'velocity-support', 'secret'], YamlLines::quote($secret));
            }

            $files->write('paper.yml', $legacy);

            return;
        }

        if ($global === null && ! $enabled) {
            return;
        }

        // A file Paper has not written yet gets just these keys; Paper adds its defaults around them.
        $yaml = $global ?? '';
        $yaml = YamlLines::set($yaml, ['proxies', 'velocity', 'enabled'], $enabled ? 'true' : 'false');
        $yaml = YamlLines::set($yaml, ['proxies', 'velocity', 'online-mode'], 'true');
        if ($secret !== null) {
            $yaml = YamlLines::set($yaml, ['proxies', 'velocity', 'secret'], YamlLines::quote($secret));
        }

        $files->makeDirectory('config');
        $files->write('config/paper-global.yml', $yaml);
    }

    private function setSpigotBungee(ServerFiles $files, bool $enabled): void
    {
        $yaml = $files->read('spigot.yml', 512_000);
        if ($yaml === null && ! $enabled) {
            return;
        }

        $files->write('spigot.yml', YamlLines::set($yaml ?? '', ['settings', 'bungeecord'], $enabled ? 'true' : 'false'));
    }

    /** @param array<string, string> $values */
    private function setProperties(ServerFiles $files, array $values): void
    {
        $properties = new PropertiesFile($files->read('server.properties', 256_000) ?? '', true);
        foreach ($values as $key => $value) {
            $properties->set($key, $value);
        }

        $files->write('server.properties', $properties->toString());
    }

    private function installFabricProxyLite(): void
    {
        $files = ServerFiles::for($this->server);
        foreach (array_keys($files->list('mods')) as $name) {
            if (preg_match('/^fabricproxy-lite.*\.jar$/i', $name)) {
                return;
            }
        }

        $modrinth = app(ModrinthProvider::class);
        $version = $modrinth->versions(self::FABRIC_PROXY_LITE, ['fabric'], $this->info['version'] ? [$this->info['version']] : [])[0] ?? null;
        throw_if($version === null, RuntimeException::class, 'FabricProxy-Lite has no build for Minecraft '.$this->info['version'].'.');

        $file = collect($version['files'])->sortByDesc('primary')->first();
        throw_unless($file && parse_url($file['url'], PHP_URL_HOST) === 'cdn.modrinth.com', RuntimeException::class, 'FabricProxy-Lite could not be downloaded.');

        $files->makeDirectory('mods');
        $files->pull($file['url'], 'mods', basename($file['filename']));
        Settings::server($this->server)->set('content.mods.'.basename($file['filename']), [
            'provider' => 'modrinth',
            'project' => self::FABRIC_PROXY_LITE,
            'version' => $version['id'],
            'versionNumber' => $version['number'],
            'title' => 'FabricProxy-Lite',
            'icon' => $modrinth->projects([self::FABRIC_PROXY_LITE])[self::FABRIC_PROXY_LITE]['icon'] ?? null,
            'url' => null,
            'sha1' => $file['sha1'],
            'size' => $file['size'],
            'loaders' => ['fabric'],
            'gameVersions' => [],
            'installedAt' => time(),
        ]);
    }
}
