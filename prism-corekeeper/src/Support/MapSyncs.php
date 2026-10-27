<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Support;

use Pterodactyl\Models\Server;

/**
 * The shared map of the Cartography Table: the server keeps it in servermaps/<slot>.mapparts.gzip
 * (ShareMapServerSystem) and saves it half a second after someone adds their map at a table. The file says nothing of
 * who did, so each time the Panel notices it changed it logs a sync: with the Prism server mod
 * the mod saw who used a table (exact), without it the players here since the previous change
 * are the likely ones.
 *
 * Kept per server: map.lastSeen (the file as last seen), map.syncs (the log, newest last, for
 * later use; nothing shows it whole) and map.latest (each player's newest sync).
 */
final class MapSyncs
{
    private const int LOG = 500;

    public function __construct(private readonly Server $server) {}

    public static function for(Server $server): self
    {
        return new self($server);
    }

    public function slot(): int
    {
        return max(0, (int) (Detector::for($this->server)->variable('WORLD_INDEX') ?? 0));
    }

    public function path(): string
    {
        return StartHook::DATA.'/servermaps/'.$this->slot().'.mapparts.gzip';
    }

    /** @return array{size: int, modified: string|null}|null */
    public function file(): ?array
    {
        $entry = ServerFiles::for($this->server)->list(StartHook::DATA.'/servermaps')[basename($this->path())] ?? null;

        return $entry !== null && $entry['file'] ? ['size' => $entry['size'], 'modified' => $entry['modified']] : null;
    }

    /**
     * Notices a changed map file and logs it, crediting the players online now and those seen
     * since the previous change, unless the server mod already logged who synced.
     *
     * @param  array<string, array{id: string, name: string, steamId: string|null}>  $online
     * @param  array<string, array<string, mixed>>  $history
     */
    public function observe(array $online, array $history): void
    {
        $file = $this->file();
        if ($file === null) {
            return;
        }

        $map = $this->state();
        $seen = $map['lastSeen'] ?? null;
        $key = ['slot' => $this->slot(), 'size' => $file['size'], 'modified' => $file['modified']];
        if ($seen === $key) {
            return;
        }

        $at = $file['modified'] !== null ? (strtotime($file['modified']) ?: time()) : time();
        $since = is_array($seen) && isset($seen['modified']) ? (strtotime((string) $seen['modified']) ?: 0) : 0;
        $map['lastSeen'] = $key;

        // A sync the mod logged since the previous change already says who it was.
        $exact = array_filter($map['syncs'] ?? [], static fn (array $sync): bool => $sync['exact'] && $sync['at'] > $since && $sync['at'] <= $at + 60);
        if ($exact === []) {
            $players = [];
            foreach ($history as $id => $player) {
                if (isset($online[$id]) || (int) ($player['lastSeen'] ?? 0) >= $since) {
                    $players[] = ['id' => (string) $id, 'name' => (string) $player['name']];
                }
            }
            $map = $this->append($map, ['at' => $at, 'size' => $file['size'], 'slot' => $key['slot'], 'players' => $players, 'exact' => false]);
        }

        $this->save($map);
    }

    /**
     * A sync the server mod saw: a player adding their map at a Cartography Table.
     *
     * @param  list<array{id: string, name: string}>  $players
     */
    public function record(int $at, array $players): void
    {
        $this->save($this->append($this->state(), ['at' => $at, 'size' => null, 'slot' => $this->slot(), 'players' => $players, 'exact' => true]));
    }

    /** @return array<string, array{at: int, exact: bool, name: string}> each player's newest sync */
    public function latest(): array
    {
        return $this->state()['latest'] ?? [];
    }

    /** @return array<string, mixed> */
    private function state(): array
    {
        $map = Settings::server($this->server)->get('map');

        return is_array($map) ? $map : [];
    }

    /**
     * @param  array<string, mixed>  $map
     * @param  array<string, mixed>  $sync
     * @return array<string, mixed>
     */
    private function append(array $map, array $sync): array
    {
        $map['syncs'] = array_slice([...($map['syncs'] ?? []), $sync], -self::LOG);
        foreach ($sync['players'] as $player) {
            $known = $map['latest'][$player['id']] ?? null;
            // A guess never replaces a newer exact sync.
            if ($known === null || ($sync['at'] > $known['at'] && ($sync['exact'] || ! $known['exact']))) {
                $map['latest'][$player['id']] = ['at' => $sync['at'], 'exact' => $sync['exact'], 'name' => $player['name']];
            }
        }

        return $map;
    }

    /** @param array<string, mixed> $map */
    private function save(array $map): void
    {
        Settings::server($this->server)->set('map', $map);
    }
}
