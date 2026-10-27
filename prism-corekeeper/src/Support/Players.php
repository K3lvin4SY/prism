<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Support;

use Pterodactyl\Models\Server;

/**
 * Who is on the server now and everyone seen before. The log starts empty each start, so the
 * Panel keeps the history itself, by SteamID (the connection id changes every join), with when
 * it first and last saw each player.
 */
final class Players
{
    /** How many players the history keeps. */
    private const int HISTORY = 100;

    /**
     * @return array{running: bool, online: array<string, array{id: string, name: string, steamId: string|null}>, history: array<string, array<string, mixed>>}
     */
    public static function observe(Server $server): array
    {
        $files = ServerFiles::for($server);
        $running = ServerConsole::for($server)->isRunning();

        $log = $files->read('CoreKeeperServerLog.txt', 8_000_000) ?? '';
        $session = PlayerLog::parse(preg_split('/\r?\n/', $log) ?: []);

        $store = Settings::server($server);
        $history = is_array($store->get('players')) ? $store->get('players') : [];
        // Entries from 0.1.0 were keyed by the connection id, which changes every join.
        $history = array_filter($history, static fn ($entry): bool => is_array($entry) && array_key_exists('steamId', $entry));
        $online = [];
        $now = time();
        $changed = false;
        foreach ($session as $player) {
            $key = $player['steamId'] ?? 'name:'.$player['name'];
            $isOnline = $player['online'] && $running;
            if ($isOnline) {
                $online[$key] = ['id' => $key, 'name' => $player['name'], 'steamId' => $player['steamId']];
            }
            $known = $history[$key] ?? null;
            $entry = ['id' => $key, 'name' => $player['name'], 'steamId' => $player['steamId'], 'firstSeen' => $known['firstSeen'] ?? $now, 'lastSeen' => $isOnline ? $now : ($known['lastSeen'] ?? $now)];
            if ($known !== $entry) {
                $history[$key] = $entry;
                $changed = true;
            }
        }
        if ($changed) {
            uasort($history, static fn (array $a, array $b): int => $b['lastSeen'] <=> $a['lastSeen']);
            $history = array_slice($history, 0, self::HISTORY, true);
            $store->set('players', $history);
        }

        return ['running' => $running, 'online' => $online, 'history' => $history];
    }

    /** A player's name from the history, by SteamID. */
    public static function nameOf(Server $server, string $steamId): ?string
    {
        $history = Settings::server($server)->get('players');
        $entry = is_array($history) ? ($history[$steamId] ?? null) : null;

        return is_array($entry) ? (string) $entry['name'] : null;
    }
}
