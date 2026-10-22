<?php

declare(strict_types=1);

namespace McSuite\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use McSuite\Support\BedrockNbt;
use McSuite\Support\LevelDb;
use McSuite\Support\MinecraftPing;
use McSuite\Support\PlayerData;
use McSuite\Support\ServerProperties;
use McSuite\Support\ServerFiles;
use McSuite\Support\Skins;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use Throwable;

class PlayersController extends Controller
{
    private const int MAX_PLAYER_FILE = 4_000_000;

    /** Java names, with the optional Floodgate prefix for Bedrock players. */
    private const string JAVA_NAME = '/^[.*]?[A-Za-z0-9_]{1,32}$/';

    /** Xbox gamertags may contain spaces. */
    private const string BEDROCK_NAME = '/^[A-Za-z0-9_ ]{1,32}$/';

    private const array GAME_MODES = ['survival', 'creative', 'adventure', 'spectator'];

    /** Actions that only work while the player is online. */
    private const array ONLINE_ACTIONS = ['gamemode', 'xp-set', 'xp-add', 'heal', 'feed', 'starve', 'kill', 'clear', 'message', 'kick'];

    /** Actions that also work while the server is stopped, by editing the list files. */
    private const array ACCESS_ACTIONS = ['op', 'deop', 'whitelist-add', 'whitelist-remove', 'ban', 'pardon'];

    public function index(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'players', 'players-view');
        $data = PlayerData::for($server, $info['edition']);
        $running = $data->isRunning();

        $status = null;
        if ($running) {
            try {
                $status = MinecraftPing::for($server, $info['edition'])->status();
            } catch (Throwable) {
                $status = null;
            }
        }

        $events = $data->events();
        $online = $running ? PlayerData::onlineFrom($events, $status) : [];
        $players = $info['edition'] === 'bedrock' ? $this->bedrockPlayers($data, $events, $online) : $this->javaPlayers($data, $events, $online);
        $properties = $data->properties();

        return new JsonResponse([
            'edition' => $info['edition'],
            'running' => $running,
            'online' => [
                'count' => $status['online'] ?? count($online),
                'max' => $status['max'] ?? (int) ($properties['max-players'] ?? 20),
                'source' => $status !== null ? 'ping' : 'log',
            ],
            'whitelist' => ($properties[$info['edition'] === 'bedrock' ? 'allow-list' : 'white-list'] ?? 'false') === 'true',
            'onlineMode' => ($properties['online-mode'] ?? 'true') === 'true',
            'players' => $players,
            'activity' => array_slice(array_reverse(array_values(array_filter($events, static fn (array $event): bool => $event['event'] !== 'uuid'))), 0, 50),
            'canManage' => $this->can($request, $server, 'players-manage'),
        ]);
    }

    /**
     * @param  list<array<string, mixed>>  $events
     * @param  array<string, string|null>  $online
     * @return list<array<string, mixed>>
     */
    private function javaPlayers(PlayerData $data, array $events, array $online): array
    {
        $players = [];
        $byName = [];
        $add = static function (string $uuid, ?string $name) use (&$players, &$byName): void {
            $uuid = strtolower($uuid);
            if (! preg_match(PlayerData::UUID, $uuid)) {
                return;
            }

            $players[$uuid] ??= ['uuid' => $uuid, 'name' => null, 'online' => false, 'op' => null, 'whitelisted' => false, 'banned' => null, 'lastSeen' => null, 'hasData' => false];
            if ($name !== null && $name !== '') {
                $players[$uuid]['name'] = $name;
                $byName[strtolower($name)] = $uuid;
            }
        };

        foreach ($data->jsonList('usercache.json') as $entry) {
            $add((string) ($entry['uuid'] ?? ''), $entry['name'] ?? null);
        }

        foreach ($events as $event) {
            if ($event['event'] === 'uuid') {
                $add((string) $event['id'], $event['name']);
            }
        }

        [$playerFolder] = $data->playerFolders();
        foreach ($data->files()->list($playerFolder) as $file => $entry) {
            if (preg_match('/^([0-9a-f-]{36})\.dat$/', $file, $match)) {
                $add($match[1], null);
                $players[strtolower($match[1])]['hasData'] = true;
                $players[strtolower($match[1])]['lastSeen'] = $entry['modified'];
            }
        }

        foreach ($data->jsonList('ops.json') as $entry) {
            $add((string) ($entry['uuid'] ?? ''), $entry['name'] ?? null);
            if (isset($players[strtolower((string) ($entry['uuid'] ?? ''))])) {
                $players[strtolower($entry['uuid'])]['op'] = (int) ($entry['level'] ?? 4);
            }
        }

        foreach ($data->jsonList('whitelist.json') as $entry) {
            $add((string) ($entry['uuid'] ?? ''), $entry['name'] ?? null);
            if (isset($players[strtolower((string) ($entry['uuid'] ?? ''))])) {
                $players[strtolower($entry['uuid'])]['whitelisted'] = true;
            }
        }

        foreach ($data->jsonList('banned-players.json') as $entry) {
            $add((string) ($entry['uuid'] ?? ''), $entry['name'] ?? null);
            if (isset($players[strtolower((string) ($entry['uuid'] ?? ''))])) {
                $players[strtolower($entry['uuid'])]['banned'] = [
                    'reason' => $entry['reason'] ?? null,
                    'source' => $entry['source'] ?? null,
                    'created' => $entry['created'] ?? null,
                    'expires' => $entry['expires'] ?? null,
                ];
            }
        }

        foreach ($online as $name => $id) {
            $uuid = $id !== null && preg_match(PlayerData::UUID, strtolower($id)) ? strtolower($id) : ($byName[strtolower($name)] ?? null);
            if ($uuid === null) {
                continue;
            }

            $add($uuid, $name);
            $players[$uuid]['online'] = true;
        }

        $list = array_values($players);
        usort($list, static fn (array $a, array $b): int => [$b['online'], $b['op'] !== null, $b['lastSeen'] ?? ''] <=> [$a['online'], $a['op'] !== null, $a['lastSeen'] ?? '']);

        return $list;
    }

    /**
     * Bedrock players are known by xuid, from the allowlist, permissions and the console.
     *
     * @param  list<array<string, mixed>>  $events
     * @param  array<string, string|null>  $online
     * @return list<array<string, mixed>>
     */
    private function bedrockPlayers(PlayerData $data, array $events, array $online): array
    {
        $players = [];
        $key = static fn (?string $xuid, string $name): string => $xuid !== null && $xuid !== '' ? $xuid : 'name:'.strtolower($name);
        $add = static function (?string $xuid, string $name) use (&$players, $key): string {
            $id = $key($xuid, $name);
            $players[$id] ??= ['uuid' => $xuid ?: null, 'name' => $name, 'online' => false, 'op' => null, 'whitelisted' => false, 'banned' => null, 'lastSeen' => null, 'hasData' => false];

            return $id;
        };

        foreach ($events as $event) {
            if ($event['event'] === 'joined') {
                $players[$add($event['id'], $event['name'])]['lastSeen'] = $event['time'];
            }
        }

        foreach ($data->jsonList('allowlist.json') as $entry) {
            if (is_string($entry['name'] ?? null)) {
                $id = $add(isset($entry['xuid']) ? (string) $entry['xuid'] : null, $entry['name']);
                $players[$id]['whitelisted'] = true;
            }
        }

        $xuids = array_column(array_filter($players, static fn (array $player): bool => $player['uuid'] !== null), null, 'uuid');
        foreach ($data->jsonList('permissions.json') as $entry) {
            $xuid = (string) ($entry['xuid'] ?? '');
            if (($entry['permission'] ?? null) === 'operator' && isset($xuids[$xuid])) {
                $players[$xuid]['op'] = 4;
            }
        }

        foreach ($online as $name => $xuid) {
            $players[$add($xuid, $name)]['online'] = true;
        }

        $list = array_values($players);
        usort($list, static fn (array $a, array $b): int => [$b['online'], $b['op'] !== null] <=> [$a['online'], $a['op'] !== null]);

        return $list;
    }

    /**
     * One Java player's saved data: the raw player file (decoded in the browser), stats and advancements.
     */
    public function show(Request $request, Server $server, string $player): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'players', 'players-view');
        abort_unless($info['edition'] === 'java', 404, 'Player data is only read on Java servers.');
        $player = strtolower($player);
        abort_unless(preg_match(PlayerData::UUID, $player) === 1, 422, 'Invalid player.');

        $data = PlayerData::for($server, 'java');
        [$playerFolder, $statsFolder, $advancementsFolder] = $data->playerFolders();
        $dat = $data->files()->read("$playerFolder/$player.dat", self::MAX_PLAYER_FILE);
        $stats = $data->files()->readJson("$statsFolder/$player.json", 2_000_000);
        $advancements = $data->files()->readJson("$advancementsFolder/$player.json", 2_000_000);

        $done = [];
        foreach ($advancements ?? [] as $id => $progress) {
            if (! is_array($progress) || ! ($progress['done'] ?? false) || str_contains((string) $id, ':recipes/')) {
                continue;
            }

            $dates = array_values(array_filter($progress['criteria'] ?? [], 'is_string'));
            sort($dates);
            $done[] = ['id' => (string) $id, 'date' => end($dates) ?: null];
        }

        usort($done, static fn (array $a, array $b): int => strcmp((string) $b['date'], (string) $a['date']));

        return new JsonResponse([
            'uuid' => $player,
            'dat' => $dat !== null ? base64_encode($dat) : null,
            'stats' => $stats['stats'] ?? null,
            'advancements' => $done,
            'version' => $info['version'],
        ]);
    }

    /**
     * One Bedrock player's saved data, from the world's LevelDB database. A `player_<id>`
     * record names the player's xuid (MsaId) and the `player_server_<uuid>` key of their data.
     */
    public function bedrock(Request $request, Server $server, string $xuid): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'players', 'players-view');
        abort_unless($info['edition'] === 'bedrock', 404);
        abort_unless(preg_match('/^\d{1,20}$/', $xuid) === 1, 422, 'Invalid player.');

        $data = PlayerData::for($server, 'bedrock');
        $database = new LevelDb($data->files(), 'worlds/'.$data->levelName().'/db');
        $records = $database->scan('player_');

        $serverKey = null;
        foreach ($records as $key => $value) {
            if (str_starts_with($key, 'player_server_')) {
                continue;
            }

            try {
                $index = BedrockNbt::topLevelStrings($value);
            } catch (Throwable) {
                continue;
            }

            if (($index['MsaId'] ?? null) === $xuid && isset($index['ServerId'])) {
                $serverKey = $index['ServerId'];
                break;
            }
        }

        $player = $serverKey !== null ? ($records[$serverKey] ?? null) : null;

        return new JsonResponse([
            'xuid' => $xuid,
            'dat' => $player !== null ? base64_encode($player) : null,
            'version' => $info['version'],
        ]);
    }

    /**
     * Runs an action on a player: a console command while the server runs, or, for op,
     * whitelist and ban while it is stopped, an edit of the list file.
     */
    public function action(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'players', 'players-manage');
        $bedrock = $info['edition'] === 'bedrock';
        $data = $request->validate([
            'action' => ['required', 'string', 'in:'.implode(',', [...self::ONLINE_ACTIONS, ...self::ACCESS_ACTIONS, 'save'])],
            'name' => ['required_unless:action,save', 'nullable', 'string', 'regex:'.($bedrock ? self::BEDROCK_NAME : self::JAVA_NAME)],
            'uuid' => ['nullable', 'string', 'max:40'],
            'value' => ['nullable'],
            'reason' => ['nullable', 'string', 'max:200'],
        ]);

        $action = $data['action'];
        $name = (string) ($data['name'] ?? '');
        $target = $bedrock ? '"'.$name.'"' : $name;
        $reason = trim((string) preg_replace('/[\r\n§]+/u', ' ', (string) ($data['reason'] ?? '')));
        $players = PlayerData::for($server, $info['edition']);
        $running = $players->isRunning();

        abort_if($bedrock && in_array($action, ['ban', 'pardon'], true), 422, 'Bedrock servers have no bans.');

        if (! $running) {
            abort_unless(in_array($action, self::ACCESS_ACTIONS, true), 409, 'Start the server to do this.');
            abort_if($bedrock && in_array($action, ['op', 'deop'], true), 409, 'Start the server to change operators on Bedrock.');
            $this->editLists($players, $action, $name, $data['uuid'] ?? null, $reason, $bedrock);
            Activity::event('server:mc-suite.players.'.$action)->property(['player' => $name, 'offline' => true])->log();

            return new JsonResponse(['applied' => 'file']);
        }

        $command = match ($action) {
            'save' => 'save-all flush',
            'gamemode' => sprintf('gamemode %s %s', $this->gameMode($data['value'] ?? null, $bedrock), $target),
            'xp-set' => $bedrock
                ? sprintf('xp -24791L %1$s', $target)."\n".sprintf('xp %dL %s', $this->levels($data['value'] ?? null), $target)
                : sprintf('xp set %s %d levels', $target, $this->levels($data['value'] ?? null)),
            'xp-add' => $bedrock ? sprintf('xp %dL %s', $this->levels($data['value'] ?? null, true), $target) : sprintf('xp add %s %d levels', $target, $this->levels($data['value'] ?? null, true)),
            'heal' => $bedrock ? "effect $target instant_health 1 20 true" : "effect give $target minecraft:instant_health 1 20 true",
            'feed' => $bedrock ? "effect $target saturation 1 20 true" : "effect give $target minecraft:saturation 1 20 true",
            'starve' => $bedrock ? "effect $target hunger 30 255 true" : "effect give $target minecraft:hunger 30 255 true",
            'kill' => "kill $target",
            'clear' => "clear $target",
            'message' => $this->message($target, (string) ($data['value'] ?? '')),
            'kick' => trim("kick $target $reason"),
            'op' => "op $target",
            'deop' => "deop $target",
            'whitelist-add' => ($bedrock ? 'allowlist' : 'whitelist')." add $target",
            'whitelist-remove' => ($bedrock ? 'allowlist' : 'whitelist')." remove $target",
            'ban' => trim("ban $target $reason"),
            'pardon' => "pardon $target",
        };

        Daemon::server($server)->commands(explode("\n", $command));
        Activity::event('server:mc-suite.players.'.$action)->property(array_filter(['player' => $name ?: null, 'value' => is_scalar($data['value'] ?? null) ? $data['value'] : null]))->log();

        return new JsonResponse(['applied' => 'command']);
    }

    /**
     * Turns the whitelist on or off in the settings file, and live when the server runs.
     */
    public function whitelist(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'players', 'players-manage');
        $enabled = (bool) $request->validate(['enabled' => ['required', 'boolean']])['enabled'];
        $bedrock = $info['edition'] === 'bedrock';
        $data = PlayerData::for($server, $info['edition']);

        ServerProperties::load($server, $info)->set($bedrock ? 'allow-list' : 'white-list', $enabled ? 'true' : 'false')->save();

        if ($data->isRunning()) {
            Daemon::server($server)->commands([$bedrock ? 'allowlist reload' : 'whitelist '.($enabled ? 'on' : 'off')]);
        }

        Activity::event('server:mc-suite.players.whitelist')->property('enabled', $enabled)->log();

        return new JsonResponse(['enabled' => $enabled]);
    }

    public function skin(Request $request, Server $server, string $key): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'players', 'players-view');
        abort_unless(preg_match('/^([0-9a-f-]{36}|\d{1,20}|[.*]?[A-Za-z0-9_]{1,32})$/i', $key) === 1, 422, 'Invalid player.');

        return new JsonResponse(Skins::find(strtolower(ltrim($key, '.*'))))
            ->setPublic()->setMaxAge(3600);
    }

    /** Edits ops.json, whitelist.json, banned-players.json or allowlist.json while the server is stopped. */
    private function editLists(PlayerData $data, string $action, string $name, ?string $uuid, string $reason, bool $bedrock): void
    {
        $files = $data->files();

        if ($bedrock) {
            $list = $data->jsonList('allowlist.json');
            $list = array_values(array_filter($list, static fn (array $entry): bool => strcasecmp((string) ($entry['name'] ?? ''), $name) !== 0));
            if ($action === 'whitelist-add') {
                $list[] = ['ignoresPlayerLimit' => false, 'name' => $name];
            }

            $files->writeJson('allowlist.json', $list);

            return;
        }

        $uuid = $uuid !== null && preg_match(PlayerData::UUID, strtolower($uuid)) ? strtolower($uuid) : $this->uuidFor($data, $name);
        [$file, $add] = match ($action) {
            'op' => ['ops.json', ['uuid' => $uuid, 'name' => $name, 'level' => (int) ($data->properties()['op-permission-level'] ?? 4), 'bypassesPlayerLimit' => false]],
            'deop' => ['ops.json', null],
            'whitelist-add' => ['whitelist.json', ['uuid' => $uuid, 'name' => $name]],
            'whitelist-remove' => ['whitelist.json', null],
            'ban' => ['banned-players.json', [
                'uuid' => $uuid,
                'name' => $name,
                'created' => now()->format('Y-m-d H:i:s O'),
                'source' => 'Panel',
                'expires' => 'forever',
                'reason' => $reason !== '' ? $reason : 'Banned by an operator.',
            ]],
            'pardon' => ['banned-players.json', null],
        };

        $list = array_values(array_filter($data->jsonList($file), static fn (array $entry): bool => strtolower((string) ($entry['uuid'] ?? '')) !== $uuid));
        if ($add !== null) {
            $list[] = $add;
        }

        $files->writeJson($data->listPath($file), $list);
    }

    /**
     * The UUID a name has on this server: from its user cache, from Mojang when the server
     * checks accounts, or the offline UUID the server would make up itself.
     */
    private function uuidFor(PlayerData $data, string $name): string
    {
        foreach ($data->jsonList('usercache.json') as $entry) {
            if (strcasecmp((string) ($entry['name'] ?? ''), $name) === 0 && preg_match(PlayerData::UUID, (string) ($entry['uuid'] ?? ''))) {
                return strtolower($entry['uuid']);
            }
        }

        if (($data->properties()['online-mode'] ?? 'true') === 'true' && preg_match('/^[A-Za-z0-9_]{1,16}$/', $name)) {
            try {
                $id = Http::timeout(5)->get('https://api.mojang.com/users/profiles/minecraft/'.$name)->json('id');
                if (is_string($id) && preg_match('/^[0-9a-f]{32}$/', $id)) {
                    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split($id, 4));
                }
            } catch (Throwable) {
                // Fall through to the offline UUID.
            }

            abort(422, 'No Minecraft account is called '.$name.'.');
        }

        // UUID.nameUUIDFromBytes("OfflinePlayer:" + name): MD5 with the version 3 bits set.
        $hash = md5('OfflinePlayer:'.$name, true);
        $hash[6] = chr(ord($hash[6]) & 0x0F | 0x30);
        $hash[8] = chr(ord($hash[8]) & 0x3F | 0x80);

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($hash), 4));
    }

    private function gameMode(mixed $value, bool $bedrock): string
    {
        abort_unless(is_string($value) && in_array($value, self::GAME_MODES, true), 422, 'Pick a game mode.');
        abort_if($bedrock && $value === 'spectator', 422, 'Bedrock servers have no spectator mode.');

        return $value;
    }

    private function levels(mixed $value, bool $signed = false): int
    {
        abort_unless(is_numeric($value) && (int) $value == $value, 422, 'Use a whole number of levels.');
        $levels = (int) $value;
        abort_if($levels < ($signed ? -24791 : 0) || $levels > 24791, 422, 'Levels must be between 0 and 24791.');

        return $levels;
    }

    private function message(string $target, string $text): string
    {
        $text = trim((string) preg_replace('/[\r\n]+/', ' ', $text));
        abort_if($text === '' || mb_strlen($text) > 256, 422, 'Write a message of up to 256 characters.');

        return "tell $target $text";
    }
}
