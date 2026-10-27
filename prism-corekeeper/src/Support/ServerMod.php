<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Support;

use Pterodactyl\Models\Server;
use Throwable;

/**
 * The Prism server mod: a small server-only Core Keeper mod (C# the game compiles when it starts,
 * players do not need it) that reports what only the running game knows. Off unless turned on in
 * the server's Properties tab. It writes, under the server's data folder:
 *
 *  mods/PrismCoreKeeper/players.json   the players online now, rewritten every few seconds
 *  mods/PrismCoreKeeper/events.json    this run's joins, leaves and Cartography Table syncs, numbered
 *
 * The Panel reads both whenever a Prism Core Keeper page asks, keeps each player's details until
 * their next visit replaces them (players.details) and turns syncs into the map's sync log.
 */
final class ServerMod
{
    /** Bump with every change to resources/servermod, so servers are offered the update. */
    public const string VERSION = '1.0.0';

    public const string GUID = 'f3b1c2a4e5d64f7a8b9c0d1e2f3a4b5c';

    public const string FOLDER = StartHook::MODS.'/PrismCoreKeeper';

    public const string OUTPUT = StartHook::DATA.'/mods/PrismCoreKeeper';

    /** The files of the mod, from resources/servermod, by their path in the mod folder. */
    private const array FILES = ['ModManifest.json', 'Scripts/PrismCoreKeeperMod.cs'];

    public function __construct(private readonly Server $server) {}

    public static function for(Server $server): self
    {
        return new self($server);
    }

    public function enabled(): bool
    {
        return Settings::server($this->server)->get('servermod.enabled') === true;
    }

    /** The version of the mod on the server, or null when it is not there. */
    public function installedVersion(): ?string
    {
        $manifest = ServerFiles::for($this->server)->readJson(self::FOLDER.'/ModManifest.json');

        return isset($manifest['version']) ? (string) $manifest['version'] : (is_array($manifest) ? '0' : null);
    }

    /** Writes the mod into the server's mods folder; it loads on the next start. */
    public function install(): void
    {
        $files = ServerFiles::for($this->server);
        $files->makeDirectory(self::FOLDER.'/Scripts');
        foreach (self::FILES as $file) {
            $content = (string) file_get_contents(dirname(__DIR__, 2).'/resources/servermod/'.$file);
            $files->write(self::FOLDER.'/'.$file, str_replace('{{VERSION}}', self::VERSION, $content));
        }
        Settings::server($this->server)->set('servermod.enabled', true);
    }

    /** Takes the mod off the server; what it already reported stays with the Panel. */
    public function remove(): void
    {
        ServerFiles::for($this->server)->delete(StartHook::MODS, ['PrismCoreKeeper']);
        Settings::server($this->server)->set('servermod.enabled', false);
    }

    /**
     * Reads what the mod reported since last time: caches each online player's details and logs
     * their Cartography Table syncs. Does nothing while the mod is off.
     */
    public function collect(): void
    {
        if (! $this->enabled()) {
            return;
        }

        $files = ServerFiles::for($this->server);
        $store = Settings::server($this->server);
        try {
            $report = $files->readJson(self::OUTPUT.'/players.json', 4_000_000);
            $events = $files->readJson(self::OUTPUT.'/events.json', 4_000_000);
        } catch (Throwable) {
            return;
        }

        $details = is_array($store->get('players.details')) ? $store->get('players.details') : [];
        $changed = false;
        foreach (is_array($report['players'] ?? null) ? $report['players'] : [] as $player) {
            $id = self::idOf($player);
            if ($id === null) {
                continue;
            }
            $details[$id] = self::present($player) + ['capturedAt' => (int) ($report['utc'] ?? time())];
            $changed = true;
        }
        if ($changed) {
            $store->set('players.details', $details);
        }

        // Events are numbered from 1 on each start of the server (`started`); the Panel keeps the
        // last one it read, so each sync is logged once.
        if (is_array($events) && is_array($events['events'] ?? null)) {
            $cursor = $store->get('servermod.cursor');
            $started = (int) ($events['started'] ?? 0);
            $read = is_array($cursor) && (int) ($cursor['started'] ?? -1) === $started ? (int) ($cursor['seq'] ?? 0) : 0;
            $syncs = MapSyncs::for($this->server);
            $last = $read;
            foreach ($events['events'] as $event) {
                $seq = is_array($event) ? (int) ($event['seq'] ?? 0) : 0;
                if ($seq <= $read) {
                    continue;
                }
                $last = max($last, $seq);
                if (($event['type'] ?? null) === 'cartography' && ($id = self::idOf($event)) !== null) {
                    $syncs->record((int) ($event['utc'] ?? time()), [['id' => $id, 'name' => (string) ($event['name'] ?? '')]]);
                }
            }
            if ($last !== $read || ! is_array($cursor)) {
                $store->set('servermod.cursor', ['started' => $started, 'seq' => $last]);
            }
        }
    }

    /** @return array<string, mixed>|null a player's details from their last visit */
    public function details(string $id): ?array
    {
        $details = Settings::server($this->server)->get('players.details');

        return is_array($details) && is_array($details[$id] ?? null) ? $details[$id] : null;
    }

    /**
     * The player's key in the history: their SteamID, as the log gives it, or "name:<name>".
     *
     * @param  array<string, mixed>  $player
     */
    private static function idOf(array $player): ?string
    {
        $steamId = (string) ($player['steamId'] ?? '');
        if (preg_match('/^\d{17}$/', $steamId)) {
            return $steamId;
        }
        $name = trim((string) ($player['name'] ?? ''));

        return $name === '' ? null : 'name:'.$name;
    }

    /**
     * Only the fields the player page knows, with their types checked.
     *
     * @param  array<string, mixed>  $player
     * @return array<string, mixed>
     */
    private static function present(array $player): array
    {
        $list = static fn (string $key): array => is_array($player[$key] ?? null) ? array_values(array_filter($player[$key], 'is_array')) : [];
        $number = static fn (string $key): ?float => is_numeric($player[$key] ?? null) ? (float) $player[$key] : null;

        return [
            'name' => (string) ($player['name'] ?? ''),
            'health' => $number('health'),
            'maxHealth' => $number('maxHealth'),
            'hunger' => $number('hunger'),
            'x' => $number('x'),
            'y' => $number('y'),
            'dead' => (bool) ($player['dead'] ?? false),
            'skills' => array_map(static fn (array $skill): array => ['name' => (string) ($skill['name'] ?? ''), 'level' => (int) ($skill['level'] ?? 0)], $list('skills')),
            'equipment' => array_map(static fn (array $item): array => ['slot' => (string) ($item['slot'] ?? ''), 'name' => (string) ($item['name'] ?? ''), 'id' => (int) ($item['id'] ?? 0), 'amount' => (int) ($item['amount'] ?? 1)], $list('equipment')),
            'customization' => array_map(static fn ($value): string => is_scalar($value) ? (string) $value : '', is_array($player['customization'] ?? null) ? $player['customization'] : []),
        ];
    }
}
