<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PrismCoreKeeper\Support\PlayerLog;
use PrismCoreKeeper\Support\ServerConsole;
use PrismCoreKeeper\Support\ServerFiles;
use PrismCoreKeeper\Support\Settings;
use PrismCoreKeeper\Support\StartHook;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;

class PlayersController extends Controller
{
    public const string ADMINS = StartHook::DATA.'/Admins.json';

    /** How many players the history keeps. */
    private const int HISTORY = 100;

    /**
     * Who is online now (from this session's log), everyone seen before (kept by the Panel, as
     * the log starts empty each start), the admin list and how to join.
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'players', 'players-view');
        $files = ServerFiles::for($server);
        $running = ServerConsole::for($server)->isRunning();

        $log = $files->read('CoreKeeperServerLog.txt', 8_000_000) ?? '';
        $session = PlayerLog::parse(preg_split('/\r?\n/', $log) ?: []);

        // Seen players, by SteamID (the connection id changes each join), with when the Panel
        // first and last saw them.
        $store = Settings::server($server);
        $history = is_array($store->get('players')) ? $store->get('players') : [];
        // Entries from 0.1.0 were keyed by the connection id, which changes every join.
        $history = array_filter($history, static fn ($entry, $key): bool => is_array($entry) && array_key_exists('steamId', $entry), ARRAY_FILTER_USE_BOTH);
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

        $admins = $files->readJson(self::ADMINS);

        return new JsonResponse([
            'running' => $running,
            'online' => array_values($online),
            'history' => array_values(array_map(static fn (array $player): array => $player + ['steamId' => null] + ['online' => isset($online[$player['id']])], $history)),
            'admins' => array_values(array_map(self::presentAdmin(...), $admins['adminList'] ?? [])),
            'adminsFile' => $admins !== null,
            'join' => $this->join($files, $request, $server),
        ]);
    }

    /**
     * Admins.json lists each admin as {index, privileges, name, steamId, crossPlatformId}; the
     * server adds the first player itself. The SteamID goes to the browser as a string, as it
     * is too big for a JavaScript number.
     *
     * @return array{steamId: string, name: string, privileges: int|null}
     */
    private static function presentAdmin(mixed $entry): array
    {
        if (! is_array($entry)) {
            return ['steamId' => (string) (is_scalar($entry) ? $entry : ''), 'name' => '', 'privileges' => null];
        }

        return ['steamId' => (string) ($entry['steamId'] ?? ''), 'name' => (string) ($entry['name'] ?? ''), 'privileges' => isset($entry['privileges']) ? (int) $entry['privileges'] : null];
    }

    /**
     * Sets who is an admin, by SteamID64. Admins already in the list keep their entry as the
     * server wrote it; new ones are added the way the server adds them. The server reads the
     * list when it starts.
     */
    public function admins(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'players', 'players-manage');
        $data = $request->validate([
            'admins' => ['present', 'array', 'max:100'],
            'admins.*' => ['string', 'regex:/^\d{17}$/'],
        ], ['admins.*.regex' => 'An admin is added by their SteamID64: 17 digits, such as 76561198000000000.']);

        $files = ServerFiles::for($server);
        $current = $files->readJson(self::ADMINS);
        abort_if($current === null, 409, 'Start the server once so it writes Admins.json, then add admins here.');

        $existing = [];
        foreach ($current['adminList'] ?? [] as $entry) {
            $existing[self::presentAdmin($entry)['steamId']] = $entry;
        }
        $names = [];
        foreach ((array) Settings::server($server)->get('players', []) as $player) {
            if (is_array($player) && isset($player['steamId'])) {
                $names[(string) $player['steamId']] = (string) $player['name'];
            }
        }

        $list = [];
        $index = max([0, ...array_map(static fn ($entry): int => is_array($entry) ? (int) ($entry['index'] ?? 0) : 0, $current['adminList'] ?? [])]);
        foreach (array_values(array_unique($data['admins'])) as $steamId) {
            $list[] = $existing[$steamId] ?? ['index' => ++$index, 'privileges' => 2, 'name' => $names[$steamId] ?? '', 'steamId' => (int) $steamId, 'crossPlatformId' => 0];
        }

        $current['adminList'] = $list;
        $files->writeJson(self::ADMINS, $current);
        Activity::event('server:prism-corekeeper.players.admins')->property('admins', $data['admins'])->log();

        return new JsonResponse(['admins' => array_map(self::presentAdmin(...), $list)]);
    }

    /**
     * How to join: the Game ID for Steam players, and for direct connections the address
     * and password from GameInfo.txt (only for people who may see the server's startup).
     *
     * @return array<string, mixed>
     */
    private function join(ServerFiles $files, Request $request, Server $server): array
    {
        // GameID.txt holds the Game ID on its first line, then the addresses, port and password.
        $gameId = trim(strtok((string) ($files->read('GameID.txt', 2000) ?? ''), "\r\n") ?: '');
        $info = $files->read('GameInfo.txt', 20_000) ?? '';
        $direct = null;
        if (preg_match('/^(\S+);(\d+);;(\S*)$/m', $info, $match) && $this->can($request, $server, 'startup.read')) {
            $direct = ['address' => $match[1], 'port' => (int) $match[2], 'password' => $match[3], 'paste' => $match[0]];
        }

        return ['gameId' => $gameId !== '' ? $gameId : null, 'direct' => $direct];
    }
}
