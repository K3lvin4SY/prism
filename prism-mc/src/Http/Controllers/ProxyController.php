<?php

declare(strict_types=1);

namespace PrismMc\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use PrismMc\Support\Detector;
use PrismMc\Support\McJars;
use PrismMc\Support\ProxyConfig;
use PrismMc\Support\ProxyForwarding;
use PrismMc\Support\ServerFiles;
use PrismMc\Support\Settings;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use RuntimeException;
use Throwable;

/**
 * Links game servers to a Velocity, BungeeCord or Waterfall proxy. A link changes both sides:
 * the proxy learns the server's address, and the server forwards players from the proxy with
 * its own account check off. Either side can start or change a link, and only servers the user
 * can open and manage show up.
 */
class ProxyController extends Controller
{
    private const array PROXIES = ['velocity', 'bungeecord', 'waterfall'];

    private const string NAME = '/^[a-z0-9][a-z0-9_-]{0,31}$/';

    private const int MAX_CANDIDATES = 60;

    // ---- Overview -------------------------------------------------------------------------

    public function show(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeProxyAccess($request, $server);

        if (in_array($info['software'], self::PROXIES, true)) {
            return new JsonResponse($this->proxyOverview($request, $server, $info));
        }

        $parent = Settings::server($server)->get('proxy.parent');
        $link = null;
        if (is_array($parent) && ($proxy = Server::query()->where('uuid', $parent['proxy'] ?? '')->first())) {
            $config = $this->config($proxy, $this->detect($proxy));
            $entry = $config?->read();
            $name = (string) ($parent['name'] ?? '');
            if ($entry !== null && isset($entry['servers'][$name])) {
                $link = [
                    'proxy' => $this->describe($request->user(), $proxy),
                    ...$this->entry($name, $entry, $config->type),
                    'mode' => $this->proxyMode($config),
                ];
            }
        }

        return new JsonResponse([
            'role' => ProxyForwarding::modes($info['software']) === [] ? 'unsupported' : 'backend',
            'software' => $info['software'],
            'modes' => ProxyForwarding::modes($info['software']),
            'address' => $this->address($server),
            'link' => $link,
        ]);
    }

    /** @return array<string, mixed> */
    private function proxyOverview(Request $request, Server $server, array $info): array
    {
        $config = $this->config($server, $info);
        if ($config === null) {
            return ['role' => 'proxy', 'type' => $info['software'], 'ready' => false, 'entries' => []];
        }

        $read = $config->read();
        $links = Settings::server($server)->getByPrefix('proxy.link.');
        $byUuid = Server::query()->whereIn('uuid', array_filter(array_column($links, 'server')))->get()->keyBy('uuid');

        $entries = [];
        foreach (array_keys($read['servers']) as $name) {
            $linked = isset($links[$name]['server']) ? $byUuid->get($links[$name]['server']) : null;
            $entries[] = [...$this->entry($name, $read, $config->type), 'server' => $linked ? $this->describe($request->user(), $linked) : null];
        }

        return [
            'role' => 'proxy',
            'type' => $config->type,
            'ready' => true,
            'mode' => $this->proxyMode($config),
            'onlineMode' => $config->type === 'velocity' ? $config->velocityValue('online-mode') !== 'false' : $config->bungeeValue('online_mode') !== 'false',
            'examples' => $config->hasOnlyExamples(),
            'bind' => $this->bindPort($config),
            'port' => $server->allocation?->port,
            'entries' => $entries,
            'address' => $this->address($server),
        ];
    }

    /**
     * Servers this one can be linked with: the user's game servers when this is a proxy, the
     * user's proxies when it is a game server. Servers they cannot manage are left out.
     */
    public function candidates(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeProxyAccess($request, $server);
        $wantProxies = ! in_array($info['software'], self::PROXIES, true);
        $user = $request->user();
        $types = McJars::types();

        $servers = $user->accessibleServers()->where('servers.id', '!=', $server->id)->with('allocation', 'node', 'egg')->limit(self::MAX_CANDIDATES)->get();
        $result = [];
        foreach ($servers as $candidate) {
            if (! $user->can('ext.prism-mc.properties', $candidate)) {
                continue;
            }

            try {
                $candidateInfo = Detector::for($candidate)->info();
            } catch (Throwable) {
                continue;
            }

            if ($candidateInfo['edition'] !== 'java') {
                continue;
            }

            $isProxy = in_array($candidateInfo['software'], self::PROXIES, true);
            if ($isProxy !== $wantProxies || (! $isProxy && ProxyForwarding::modes($candidateInfo['software']) === [])) {
                continue;
            }

            $parent = Settings::server($candidate)->get('proxy.parent');
            $result[] = [
                ...$this->describe($user, $candidate, $candidateInfo, $types),
                'modes' => ProxyForwarding::modes($candidateInfo['software']),
                'linkedTo' => is_array($parent) ? ($parent['proxy'] ?? null) : null,
            ];
        }

        return new JsonResponse(['servers' => $result]);
    }

    // ---- Linking --------------------------------------------------------------------------

    public function link(Request $request, Server $server): JsonResponse
    {
        $data = $request->validate([
            'server' => ['required', 'string', 'max:36'],
            'name' => ['required', 'string', 'regex:'.self::NAME],
            'address' => ['nullable', 'string', 'max:255', 'regex:/^[A-Za-z0-9.\-\[\]:]+:\d{1,5}$/'],
            'fallback' => ['sometimes', 'boolean'],
            'forcedHost' => ['nullable', 'string', 'max:253', 'regex:/^[A-Za-z0-9.-]+$/'],
            'restricted' => ['sometimes', 'boolean'],
        ]);

        $this->authorizeProxyAccess($request, $server);
        $other = $this->accessibleServer($request->user(), $data['server']);
        [$proxy, $backend] = $this->pair($request, $server, $other);
        $proxyInfo = $this->detect($proxy);
        $backendInfo = $this->detect($backend);

        $config = $this->config($proxy, $proxyInfo);
        abort_if($config === null, 409, 'Start the proxy once so it writes its config, then link servers.');
        $read = $config->read();

        // The proxy's own examples go on the first link.
        if ($config->hasOnlyExamples()) {
            $read = ['servers' => [], 'order' => [], 'forcedHosts' => []];
        }

        $name = $data['name'];
        abort_if(isset($read['servers'][$name]), 422, "The proxy already has a server called $name.");
        $previous = Settings::server($backend)->get('proxy.parent');
        abort_if(is_array($previous) && ($previous['proxy'] ?? null) !== $proxy->uuid && Server::query()->where('uuid', $previous['proxy'] ?? '')->exists(), 409, 'This server is linked to another proxy. Unlink it there first.');

        // Work out the forwarding mode both sides can use.
        $mode = $this->proxyMode($config);
        $supported = ProxyForwarding::modes($backendInfo['software']);
        if ($mode === 'none' || ($mode === 'modern' && count($read['servers']) === 0 && ! in_array('modern', $supported, true))) {
            $mode = $config->type === 'velocity' && in_array('modern', $supported, true) ? 'modern' : 'legacy';
        }

        abort_unless(in_array($mode, $supported, true), 422, sprintf(
            '%s cannot use the %s forwarding this proxy uses for its other servers. %s',
            ucfirst((string) $backendInfo['software']),
            $mode,
            $mode === 'modern' ? 'Switch the proxy to legacy forwarding, or use Paper instead of Spigot.' : 'Switch the proxy to modern forwarding.',
        ));

        $address = $data['address'] ?? $this->address($backend);
        abort_if($address === null, 422, 'The server has no allocation to link to.');

        $read['servers'][$name] = ['address' => $address, 'motd' => $backend->name, 'restricted' => (bool) ($data['restricted'] ?? false)];
        if (($data['fallback'] ?? false) || $read['order'] === []) {
            $read['order'][] = $name;
        }

        if (! empty($data['forcedHost'])) {
            $read['forcedHosts'][$data['forcedHost']] = [$name];
        }

        $secret = $this->applyProxyMode($proxy, $config, $mode);
        $this->fixBind($proxy, $config);
        $config->write($read);
        ServerFiles::for($proxy)->write(ProxyConfig::file($config->type), $config->text());

        try {
            (new ProxyForwarding($backend, $backendInfo))->apply($mode, $secret);
        } catch (RuntimeException $exception) {
            abort(422, $exception->getMessage());
        }

        Settings::server($proxy)->set("proxy.link.$name", ['server' => $backend->uuid]);
        Settings::server($backend)->set('proxy.parent', ['proxy' => $proxy->uuid, 'name' => $name]);
        Detector::forget($backend);

        Activity::event('server:prism-mc.proxy.link')->subject($proxy, $backend)->property(['proxy' => $proxy->name, 'server' => $backend->name, 'name' => $name, 'mode' => $mode])->log();

        return new JsonResponse(['linked' => $name, 'mode' => $mode, 'restart' => [$this->describe($request->user(), $proxy), $this->describe($request->user(), $backend)]]);
    }

    public function update(Request $request, Server $server, string $name): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'regex:'.self::NAME],
            'address' => ['sometimes', 'string', 'max:255', 'regex:/^[A-Za-z0-9.\-\[\]:]+:\d{1,5}$/'],
            'fallback' => ['sometimes', 'boolean'],
            'forcedHost' => ['sometimes', 'nullable', 'string', 'max:253', 'regex:/^[A-Za-z0-9.-]*$/'],
            'restricted' => ['sometimes', 'boolean'],
            'motd' => ['sometimes', 'string', 'max:128'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:100'],
        ]);

        [$proxy, $config, $name] = $this->resolveEntry($request, $server, $name);
        $read = $config->read();
        abort_unless(isset($read['servers'][$name]), 404, 'That server is not on the proxy.');

        $newName = $data['name'] ?? $name;
        if ($newName !== $name) {
            abort_if(isset($read['servers'][$newName]), 422, "The proxy already has a server called $newName.");
            $read['servers'] = self::renameKey($read['servers'], $name, $newName);
            $read['order'] = array_map(static fn (string $entry): string => $entry === $name ? $newName : $entry, $read['order']);
            $read['forcedHosts'] = array_map(static fn (array $names): array => array_map(static fn (string $entry): string => $entry === $name ? $newName : $entry, $names), $read['forcedHosts']);
        }

        foreach (['address', 'restricted', 'motd'] as $field) {
            if (array_key_exists($field, $data)) {
                $read['servers'][$newName][$field] = $data[$field];
            }
        }

        if (array_key_exists('fallback', $data) || array_key_exists('position', $data)) {
            $order = array_values(array_diff($read['order'], [$newName]));
            $inOrder = $data['fallback'] ?? in_array($newName, $read['order'], true);
            if ($inOrder) {
                array_splice($order, min((int) ($data['position'] ?? count($order)), count($order)), 0, [$newName]);
            }

            $read['order'] = $order;
        }

        if (array_key_exists('forcedHost', $data)) {
            foreach ($read['forcedHosts'] as $host => $names) {
                $read['forcedHosts'][$host] = array_values(array_diff($names, [$newName]));
            }

            if (! empty($data['forcedHost'])) {
                $read['forcedHosts'][$data['forcedHost']] = [$newName];
            }
        }

        $config->write($read);
        ServerFiles::for($proxy)->write(ProxyConfig::file($config->type), $config->text());

        if ($newName !== $name) {
            $link = Settings::server($proxy)->get("proxy.link.$name");
            Settings::server($proxy)->forget("proxy.link.$name");
            if (is_array($link)) {
                Settings::server($proxy)->set("proxy.link.$newName", $link);
                if ($backend = Server::query()->where('uuid', $link['server'] ?? '')->first()) {
                    Settings::server($backend)->set('proxy.parent', ['proxy' => $proxy->uuid, 'name' => $newName]);
                }
            }
        }

        Activity::event('server:prism-mc.proxy.update')->subject($proxy)->property(['name' => $newName, 'changed' => array_keys($data)])->log();

        return new JsonResponse(['name' => $newName]);
    }

    public function unlink(Request $request, Server $server, string $name): JsonResponse
    {
        [$proxy, $config, $name] = $this->resolveEntry($request, $server, $name);
        $read = $config->read();
        unset($read['servers'][$name]);
        $read['order'] = array_values(array_diff($read['order'], [$name]));
        $config->write($read);
        ServerFiles::for($proxy)->write(ProxyConfig::file($config->type), $config->text());

        $link = Settings::server($proxy)->get("proxy.link.$name");
        Settings::server($proxy)->forget("proxy.link.$name");

        $backend = is_array($link) ? Server::query()->where('uuid', $link['server'] ?? '')->first() : null;
        if ($backend !== null && $request->user()->can('ext.prism-mc.properties', $backend)) {
            Settings::server($backend)->forget('proxy.parent');
            if ($request->boolean('restore', true)) {
                (new ProxyForwarding($backend, $this->detect($backend)))->remove();
            }
        }

        Activity::event('server:prism-mc.proxy.unlink')->subject($proxy)->property(['name' => $name])->log();

        // Both sides keep running on the old config until they restart.
        $restart = [$this->describe($request->user(), $proxy)];
        if ($backend !== null) {
            $restart[] = $this->describe($request->user(), $backend);
        }

        return new JsonResponse(['unlinked' => $name, 'restart' => $restart]);
    }

    /** Proxy-wide settings: forwarding mode and account checks. */
    public function settings(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeProxyAccess($request, $server);
        abort_unless(in_array($info['software'], self::PROXIES, true), 404);
        $data = $request->validate([
            'mode' => ['sometimes', 'string', 'in:modern,legacy'],
            'onlineMode' => ['sometimes', 'boolean'],
            'fixBind' => ['sometimes', 'boolean'],
        ]);

        $config = $this->config($server, $info);
        abort_if($config === null, 409, 'Start the proxy once so it writes its config.');
        abort_if(($data['mode'] ?? null) === 'modern' && $config->type !== 'velocity', 422, 'Only Velocity has modern forwarding.');

        if (isset($data['onlineMode'])) {
            $config->type === 'velocity'
                ? $config->setVelocityValue('online-mode', $data['onlineMode'] ? 'true' : 'false')
                : $config->setBungeeValue('online_mode', $data['onlineMode'] ? 'true' : 'false');
        }

        if ($data['fixBind'] ?? false) {
            $this->fixBind($server, $config);
        }

        $secret = isset($data['mode']) ? $this->applyProxyMode($server, $config, $data['mode']) : null;
        ServerFiles::for($server)->write(ProxyConfig::file($config->type), $config->text());

        // Linked servers follow a mode change.
        $failed = [];
        if (isset($data['mode'])) {
            foreach (Settings::server($server)->getByPrefix('proxy.link.') as $name => $link) {
                $backend = Server::query()->where('uuid', $link['server'] ?? '')->first();
                if ($backend === null || ! $request->user()->can('ext.prism-mc.properties', $backend)) {
                    continue;
                }

                try {
                    (new ProxyForwarding($backend, $this->detect($backend)))->apply($data['mode'], $secret);
                } catch (RuntimeException $exception) {
                    $failed[] = "$name: ".$exception->getMessage();
                }
            }
        }

        Activity::event('server:prism-mc.proxy.settings')->property($data)->log();

        return new JsonResponse(['failed' => $failed]);
    }

    /** Restarts the proxy and the servers named, for which the user may restart. */
    public function restart(Request $request, Server $server): JsonResponse
    {
        $this->authorizeProxyAccess($request, $server);
        $data = $request->validate(['servers' => ['required', 'array', 'max:20'], 'servers.*' => ['string', 'max:36']]);

        $restarted = [];
        foreach ($data['servers'] as $identifier) {
            $target = $this->accessibleServer($request->user(), $identifier, allowSelf: $server);
            if (! $request->user()->can('control.restart', $target)) {
                continue;
            }

            try {
                Daemon::server($target)->power('restart');
                $restarted[] = $target->name;
            } catch (Throwable) {
                // A stopped or unreachable server is left as it is.
            }
        }

        return new JsonResponse(['restarted' => $restarted]);
    }

    // ---- Helpers --------------------------------------------------------------------------

    /** @return array<string, mixed> */
    private function authorizeProxyAccess(Request $request, Server $server): array
    {
        abort_unless($request->user()->can('ext.prism-mc.properties', $server), 403, 'You do not have permission to do this.');
        $info = Detector::for($server)->info();
        abort_unless($info['edition'] === 'java', 404, 'Proxies are for Java servers.');

        return $info;
    }

    /** A server the user owns or is a subuser of, and may manage with Prism MC. */
    private function accessibleServer(User $user, string $identifier, ?Server $allowSelf = null): Server
    {
        if ($allowSelf !== null && in_array($identifier, [$allowSelf->uuid, $allowSelf->uuidShort], true)) {
            return $allowSelf;
        }

        $server = $user->accessibleServers()
            ->where(fn ($query) => $query->where('servers.uuidShort', $identifier)->orWhere('servers.uuid', $identifier))
            ->first();

        abort_if($server === null || ! $user->can('ext.prism-mc.properties', $server), 404, 'That server was not found.');

        return $server;
    }

    /** @return array{0: Server, 1: Server} proxy and game server, in that order */
    private function pair(Request $request, Server $a, Server $b): array
    {
        $aProxy = in_array($this->detect($a)['software'], self::PROXIES, true);
        $bProxy = in_array($this->detect($b)['software'], self::PROXIES, true);
        abort_if($aProxy === $bProxy, 422, $aProxy ? 'Two proxies cannot be linked to each other.' : 'Pick a proxy to link this server to.');

        return $aProxy ? [$a, $b] : [$b, $a];
    }

    /** @return array{0: Server, 1: ProxyConfig, 2: string} the proxy, its config and the entry name */
    private function resolveEntry(Request $request, Server $server, string $name): array
    {
        abort_unless(preg_match(self::NAME, $name) === 1, 404);
        $info = $this->authorizeProxyAccess($request, $server);

        if (in_array($info['software'], self::PROXIES, true)) {
            $proxy = $server;
        } else {
            // From the game server's side, the link it belongs to.
            $parent = Settings::server($server)->get('proxy.parent');
            abort_unless(is_array($parent) && ($parent['name'] ?? null) === $name, 404, 'This server is not linked under that name.');
            $proxy = $this->accessibleServer($request->user(), (string) $parent['proxy']);
        }

        $config = $this->config($proxy, $this->detect($proxy));
        abort_if($config === null, 409, 'The proxy config could not be read.');

        return [$proxy, $config, $name];
    }

    /** @return array<string, mixed> */
    private function detect(Server $server): array
    {
        return Detector::for($server)->info();
    }

    private function config(Server $proxy, array $info): ?ProxyConfig
    {
        $type = $info['software'] === 'velocity' ? 'velocity' : 'bungee';
        $text = ServerFiles::for($proxy)->read(ProxyConfig::file($type), 1_000_000);

        return $text === null ? null : new ProxyConfig($type, $text);
    }

    private function proxyMode(ProxyConfig $config): string
    {
        if ($config->type !== 'velocity') {
            return $config->bungeeValue('ip_forward') === 'true' ? 'legacy' : 'none';
        }

        return match (strtolower((string) $config->velocityValue('player-info-forwarding-mode'))) {
            'modern' => 'modern',
            'legacy', 'bungeeguard' => 'legacy',
            default => 'none',
        };
    }

    /** The port the proxy listens on, from its own config. */
    private function bindPort(ProxyConfig $config): ?int
    {
        $bind = $config->type === 'velocity' ? $config->velocityValue('bind') : (preg_match('/^\s*host:\s*\S*:(\d+)/m', $config->text(), $match) ? 'x:'.$match[1] : null);

        return $bind !== null && preg_match('/:(\d+)$/', $bind, $port) ? (int) $port[1] : null;
    }

    /** Makes the proxy listen on its allocation port, where players can reach it. */
    private function fixBind(Server $proxy, ProxyConfig $config): void
    {
        $port = $proxy->allocation?->port;
        if ($port === null || $this->bindPort($config) === $port) {
            return;
        }

        if ($config->type === 'velocity') {
            $config->setVelocityValue('bind', '"0.0.0.0:'.$port.'"');
        } else {
            $config->setText((string) preg_replace('/^(\s*host:\s*)\S*$/m', '${1}0.0.0.0:'.$port, $config->text(), 1));
        }
    }

    /** Switches the proxy's forwarding on in the given mode and returns its secret, if it uses one. */
    private function applyProxyMode(Server $proxy, ProxyConfig $config, string $mode): ?string
    {
        if ($config->type !== 'velocity') {
            $config->setBungeeValue('ip_forward', 'true');

            return null;
        }

        $config->setVelocityValue('player-info-forwarding-mode', '"'.$mode.'"');
        if ($mode !== 'modern') {
            return null;
        }

        $file = ServerFiles::normalize($config->velocityValue('forwarding-secret-file') ?: 'forwarding.secret');
        $files = ServerFiles::for($proxy);
        $secret = trim((string) $files->read($file, 4096));
        if ($secret === '') {
            $secret = Str::random(24);
            $files->write($file, $secret);
            $config->setVelocityValue('forwarding-secret-file', '"'.$file.'"');
        }

        return $secret;
    }


    /** @return array<string, mixed> one entry as the UI shows it */
    private function entry(string $name, array $read, string $type): array
    {
        $server = $read['servers'][$name];

        return [
            'name' => $name,
            'address' => $server['address'],
            'fallback' => in_array($name, $read['order'], true),
            'position' => ($index = array_search($name, $read['order'], true)) === false ? null : $index,
            'forcedHost' => collect($read['forcedHosts'])->filter(static fn (array $names): bool => in_array($name, $names, true))->keys()->first(),
            'restricted' => (bool) ($server['restricted'] ?? false),
            'motd' => $server['motd'] ?? null,
            'type' => $type,
        ];
    }

    /** @return array<string, mixed> */
    private function describe(User $user, Server $server, ?array $info = null, ?array $types = null): array
    {
        $info ??= $this->detect($server);
        $types ??= McJars::types();
        $icon = null;
        foreach ($types as $group) {
            if (isset($group[$info['mcjarsType'] ?? ''])) {
                $icon = $group[$info['mcjarsType']]['icon'] ?? null;
            }
        }

        return [
            'identifier' => $server->uuidShort,
            'uuid' => $server->uuid,
            'name' => $server->name,
            'software' => $info['software'],
            'version' => $info['version'],
            'icon' => $icon,
            'address' => $this->address($server),
            'canRestart' => $user->can('control.restart', $server),
        ];
    }

    /** The address a proxy reaches the server at: its allocation, or the node when it listens on all addresses. */
    private function address(Server $server): ?string
    {
        $allocation = $server->allocation;
        if ($allocation === null) {
            return null;
        }

        $host = in_array($allocation->ip, ['0.0.0.0', '::', ''], true) ? $server->node->fqdn : $allocation->ip;

        return (str_contains($host, ':') ? "[$host]" : $host).':'.$allocation->port;
    }

    /** @param array<string, mixed> $map */
    private static function renameKey(array $map, string $from, string $to): array
    {
        $result = [];
        foreach ($map as $key => $value) {
            $result[$key === $from ? $to : $key] = $value;
        }

        return $result;
    }
}
