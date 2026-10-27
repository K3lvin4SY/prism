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

        // Seen players, with when the Panel first and last saw them.
        $store = Settings::server($server);
        $history = is_array($store->get('players')) ? $store->get('players') : [];
        $now = time();
        $changed = false;
        foreach ($session as $id => $player) {
            $known = $history[$id] ?? null;
            $entry = ['id' => (string) $id, 'name' => $player['name'], 'firstSeen' => $known['firstSeen'] ?? $now, 'lastSeen' => $player['online'] && $running ? $now : ($known['lastSeen'] ?? $now)];
            if ($known !== $entry) {
                $history[$id] = $entry;
                $changed = true;
            }
        }
        if ($changed) {
            uasort($history, static fn (array $a, array $b): int => $b['lastSeen'] <=> $a['lastSeen']);
            $store->set('players', array_slice($history, 0, self::HISTORY, true));
        }

        $online = $running ? array_values(array_filter($session, static fn (array $player): bool => $player['online'])) : [];
        $admins = $files->readJson(self::ADMINS);

        return new JsonResponse([
            'running' => $running,
            'online' => $online,
            'history' => array_values(array_map(static fn (array $player): array => $player + ['online' => (bool) ($session[$player['id']]['online'] ?? false) && $running], $history)),
            'admins' => array_values(array_map('strval', $admins['adminList'] ?? [])),
            'adminsFile' => $admins !== null,
            'join' => $this->join($files, $request, $server),
        ]);
    }

    /** Replaces the admin list. The server reads it when it starts. */
    public function admins(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'players', 'players-manage');
        $data = $request->validate([
            'admins' => ['present', 'array', 'max:100'],
            'admins.*' => ['string', 'max:64', 'regex:/^[A-Za-z0-9:_.-]+$/'],
        ], ['admins.*.regex' => 'An admin is a player ID such as a SteamID64.']);

        $files = ServerFiles::for($server);
        $current = $files->readJson(self::ADMINS);
        abort_if($current === null, 409, 'Start the server once so it writes Admins.json, then add admins here.');
        $current['adminList'] = array_values(array_unique($data['admins']));
        $files->writeJson(self::ADMINS, $current);
        Activity::event('server:prism-corekeeper.players.admins')->property('admins', $current['adminList'])->log();

        return new JsonResponse(['admins' => $current['adminList']]);
    }

    /**
     * How to join: the Game ID for Steam players, and for direct connections the address
     * and password from GameInfo.txt (only for people who may see the server's startup).
     *
     * @return array<string, mixed>
     */
    private function join(ServerFiles $files, Request $request, Server $server): array
    {
        $gameId = trim((string) ($files->read('GameID.txt', 200) ?? ''));
        $info = $files->read('GameInfo.txt', 20_000) ?? '';
        $direct = null;
        if (preg_match('/^(\S+);(\d+);;(\S*)$/m', $info, $match) && $this->can($request, $server, 'startup.read')) {
            $direct = ['address' => $match[1], 'port' => (int) $match[2], 'password' => $match[3], 'paste' => $match[0]];
        }

        return ['gameId' => $gameId !== '' ? $gameId : null, 'direct' => $direct];
    }
}
