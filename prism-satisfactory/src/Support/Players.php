<?php

declare(strict_types=1);

namespace PrismSatisfactory\Support;

use Pterodactyl\Models\Server;
use Throwable;

/**
 * Who is on the server now and everyone seen before. The log starts afresh each run, so the
 * Panel keeps the history itself, by name, with when it first and last saw each player. The
 * API says how many are connected; the log says who joined.
 */
final class Players
{
    /** How many players the history keeps. */
    private const int HISTORY = 200;

    /**
     * @return array{running: bool, count: int|null, online: list<string>, history: array<string, array<string, mixed>>, state: array<string, mixed>|null}
     */
    public static function observe(Server $server): array
    {
        $running = ServerConsole::for($server)->isRunning();
        $state = null;
        if ($running) {
            try {
                $state = ServerApi::for($server)->request('QueryServerState')['serverGameState'] ?? null;
            } catch (Throwable) {
                $state = null;
            }
        }
        $count = is_array($state) ? (int) ($state['numConnectedPlayers'] ?? 0) : null;

        try {
            $log = $running ? (ServerFiles::for($server)->read(Detector::LOG, 8_000_000) ?? '') : '';
        } catch (Throwable) {
            $log = '';
        }
        $joins = PlayerLog::joins(preg_split('/\r?\n/', $log) ?: []);
        $online = $count !== null ? PlayerLog::latest($joins, $count) : [];

        $store = Settings::server($server);
        $history = is_array($store->get('players')) ? $store->get('players') : [];
        $now = time();
        $changed = false;
        foreach ($joins as $join) {
            $known = $history[$join['name']] ?? null;
            $entry = [
                'name' => $join['name'],
                'firstSeen' => min($known['firstSeen'] ?? $join['at'], $join['at']),
                'lastSeen' => max($known['lastSeen'] ?? $join['at'], $join['at']),
                'joins' => $known['joins'] ?? 0,
                // Joins are counted once each, by when they happened.
                'lastJoin' => max($known['lastJoin'] ?? 0, $join['at']),
            ];
            if (($known['lastJoin'] ?? 0) < $join['at']) {
                $entry['joins']++;
            }
            if ($known !== $entry) {
                $history[$join['name']] = $entry;
                $changed = true;
            }
        }
        foreach ($online as $name) {
            if (isset($history[$name]) && $history[$name]['lastSeen'] < $now - 60) {
                $history[$name]['lastSeen'] = $now;
                $changed = true;
            }
        }
        if ($changed) {
            uasort($history, static fn (array $a, array $b): int => $b['lastSeen'] <=> $a['lastSeen']);
            $history = array_slice($history, 0, self::HISTORY, true);
            $store->set('players', $history);
        }

        return ['running' => $running, 'count' => $count, 'online' => $online, 'history' => $history, 'state' => $state];
    }
}
