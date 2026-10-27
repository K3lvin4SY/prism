<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PrismCoreKeeper\Support\MapSyncs;
use PrismCoreKeeper\Support\Players;
use PrismCoreKeeper\Support\ServerFiles;
use PrismCoreKeeper\Support\ServerMod;
use PrismCoreKeeper\Support\Settings;
use PrismCoreKeeper\Support\StartHook;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;

class PlayersController extends Controller
{
    public const string ADMINS = StartHook::DATA.'/Admins.json';

    /**
     * Who is online now (from this session's log), everyone seen before (kept by the Panel, as
     * the log starts empty each start), the admin list and how to join.
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'players', 'players-view');
        $files = ServerFiles::for($server);
        ['running' => $running, 'online' => $online, 'history' => $history] = Players::observe($server);
        ServerMod::for($server)->collect();
        MapSyncs::for($server)->observe($online, $history);

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
     * One player: what the Panel saw of them, their latest map sync and, when the Prism server
     * mod is on, what the game knew about them on their last visit (kept until they come back).
     */
    public function show(Request $request, Server $server, string $player): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'players', 'players-view');
        ['online' => $online, 'history' => $history] = Players::observe($server);
        $mod = ServerMod::for($server);
        $mod->collect();
        $syncs = MapSyncs::for($server);
        $syncs->observe($online, $history);

        $entry = $history[$player] ?? null;
        abort_if($entry === null, 404, 'This player has not been seen on this server.');

        $admins = ServerFiles::for($server)->readJson(self::ADMINS);
        $isAdmin = $entry['steamId'] !== null && in_array((string) $entry['steamId'], array_map(static fn ($admin): string => self::presentAdmin($admin)['steamId'], $admins['adminList'] ?? []), true);

        return new JsonResponse([
            'player' => $entry + ['online' => isset($online[$player])],
            'admin' => $isAdmin,
            'latestSync' => $syncs->latest()[$player] ?? null,
            'details' => $mod->details($player),
            'serverMod' => $mod->enabled(),
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
