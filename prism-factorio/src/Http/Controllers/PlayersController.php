<?php

declare(strict_types=1);

namespace PrismFactorio\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use PrismFactorio\Support\ConsoleLog;
use PrismFactorio\Support\PlayerLog;
use PrismFactorio\Support\Players;
use PrismFactorio\Support\ServerConsole;
use PrismFactorio\Support\ServerFiles;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;

class PlayersController extends Controller
{
    /** What each action does on a running server, and to which list it belongs when stopped. */
    private const array ACTIONS = [
        'kick' => ['command' => '/kick %s %s', 'list' => null],
        'ban' => ['command' => '/ban %s %s', 'list' => 'bans'],
        'unban' => ['command' => '/unban %s', 'list' => 'bans'],
        'promote' => ['command' => '/promote %s', 'list' => 'admins'],
        'demote' => ['command' => '/demote %s', 'list' => 'admins'],
        'whitelist-add' => ['command' => '/whitelist add %s', 'list' => 'whitelist'],
        'whitelist-remove' => ['command' => '/whitelist remove %s', 'list' => 'whitelist'],
        'whisper' => ['command' => '/whisper %s %s', 'list' => null],
    ];

    /**
     * Who is online now (from this run's console), everyone seen before (kept by the Panel, as
     * the console starts empty each start), and the admin, ban and whitelist files.
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'players', 'players-view');
        ['running' => $running, 'online' => $online, 'history' => $history] = Players::observe($server);

        return new JsonResponse([
            'running' => $running,
            'online' => array_values($online),
            'history' => array_values(array_map(static fn (array $player): array => $player + ['online' => isset($online[$player['name']])], $history)),
            ...Players::lists($server, $running),
            'consoleLog' => ConsoleLog::installed($server),
        ]);
    }

    /**
     * Makes the game write joins, leaves and chat to a file of its own, from its next start, by
     * adding --console-log to the server's startup command.
     */
    public function consoleLog(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'players', 'players-manage');
        ConsoleLog::install($server);
        Activity::event('server:prism-factorio.players.console-log')->log();

        return new JsonResponse(['installed' => true, 'running' => ServerConsole::for($server)->isRunning()]);
    }

    /** One player: what the Panel saw of them, their place on the lists and what they said. */
    public function show(Request $request, Server $server, string $player): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'players', 'players-view');
        ['running' => $running, 'online' => $online, 'history' => $history, 'chat' => $chat] = Players::observe($server);
        $lists = Players::lists($server, $running);

        $entry = $history[$player] ?? null;
        $banned = array_values(array_filter($lists['bans'], static fn (array $ban): bool => strcasecmp($ban['name'], $player) === 0));
        abort_if($entry === null && $banned === [] && ! in_array($player, [...$lists['admins'], ...$lists['whitelist']], true), 404, 'This player has not been seen on this server.');

        return new JsonResponse([
            'player' => ($entry ?? ['name' => $player, 'firstSeen' => null, 'lastSeen' => null]) + ['online' => isset($online[$player])],
            'admin' => in_array($player, $lists['admins'], true),
            'whitelisted' => in_array($player, $lists['whitelist'], true),
            'ban' => $banned[0] ?? null,
            'chat' => array_values(array_slice(array_filter($chat, static fn (array $line): bool => $line['name'] === $player), -30)),
        ]);
    }

    /**
     * Kicks, bans, promotes, whitelists or messages a player. On a running server this is the
     * game's own command, so the game keeps its lists; on a stopped one the list file is changed
     * and the game reads it when it starts.
     */
    public function action(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'players', 'players-manage');
        $data = $request->validate([
            'action' => ['required', 'string', 'in:'.implode(',', array_keys(self::ACTIONS))],
            'name' => ['required', 'string', 'max:60'],
            'text' => ['nullable', 'string', 'max:200'],
        ]);
        if (! PlayerLog::validName($data['name'])) {
            throw ValidationException::withMessages(['name' => 'A Factorio username has only letters, digits, dashes, underscores and dots.']);
        }

        $action = self::ACTIONS[$data['action']];
        // One line: a newline would start another command.
        $text = trim((string) preg_replace('/[\r\n]+/', ' ', (string) ($data['text'] ?? '')));
        $console = ServerConsole::for($server);
        $running = $console->isRunning();

        if ($running) {
            abort_if($data['action'] === 'whisper' && $text === '', 422, 'Write a message to send.');
            $console->send(trim(sprintf($action['command'], $data['name'], $text)));
            if ($action['list'] === 'whitelist') {
                Players::forgetWhitelist($server);
            }
        } else {
            abort_if($action['list'] === null, 409, 'The server is offline, so there is nobody to '.($data['action'] === 'kick' ? 'kick' : 'message').'.');
            $this->changeList($server, $data['action'], $data['name'], $text);
        }

        Activity::event('server:prism-factorio.players.'.$data['action'])->property(['name' => $data['name'], 'offline' => ! $running])->log();

        return new JsonResponse(['applied' => $running ? 'command' : 'file']);
    }

    private function changeList(Server $server, string $action, string $name, string $reason): void
    {
        $files = ServerFiles::for($server);
        $list = self::ACTIONS[$action]['list'];
        $file = Players::LISTS[$list];
        $current = $files->readJson($file, 2_000_000) ?? [];
        $matches = static fn (mixed $entry): bool => strcasecmp(is_array($entry) ? (string) ($entry['username'] ?? '') : (string) $entry, $name) === 0;
        $without = array_values(array_filter($current, static fn (mixed $entry): bool => ! $matches($entry)));

        $next = match ($action) {
            'ban' => [...$without, $reason !== '' ? ['username' => $name, 'reason' => $reason] : $name],
            'promote', 'whitelist-add' => [...$without, $name],
            default => $without,
        };

        $files->writeJson($file, $next);
    }
}
