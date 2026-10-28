<?php

declare(strict_types=1);

namespace PrismFactorio\Support;

use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\Server;

/**
 * Who is on the server now and everyone seen before. The console starts empty each start, so
 * the Panel keeps the history itself, by name, with when it first and last saw each player,
 * and the latest chat.
 */
final class Players
{
    /** How many players the history keeps. */
    private const int HISTORY = 200;

    /** How many chat lines are kept. */
    private const int CHAT = 200;

    /** The server's lists, in its write folder (the server folder with the egg's config-path.cfg). */
    public const array LISTS = ['admins' => 'server-adminlist.json', 'bans' => 'server-banlist.json', 'whitelist' => 'server-whitelist.json'];

    /**
     * @return array{running: bool, online: array<string, array{name: string}>, history: array<string, array<string, mixed>>, chat: list<array<string, mixed>>}
     */
    public static function observe(Server $server): array
    {
        $console = ServerConsole::for($server);
        $running = $console->isRunning();
        $session = PlayerLog::parse($running ? $console->lines(3000) : []);

        $store = Settings::server($server);
        $history = is_array($store->get('players')) ? $store->get('players') : [];
        $online = [];
        $now = time();
        $changed = false;
        foreach ($session['players'] as $name => $player) {
            if ($player['online']) {
                $online[$name] = ['name' => $name];
            }
            $known = $history[$name] ?? null;
            $entry = [
                'name' => $name,
                'firstSeen' => $known['firstSeen'] ?? ($player['joined'] ?? $now),
                'lastSeen' => $player['online'] ? $now : ($player['left'] ?? $known['lastSeen'] ?? $now),
            ];
            if ($known !== $entry) {
                $history[$name] = $entry;
                $changed = true;
            }
        }
        if ($changed) {
            uasort($history, static fn (array $a, array $b): int => $b['lastSeen'] <=> $a['lastSeen']);
            $history = array_slice($history, 0, self::HISTORY, true);
            $store->set('players', $history);
        }

        $chat = is_array($store->get('chat')) ? $store->get('chat') : [];
        $seen = array_flip(array_map(self::chatKey(...), $chat));
        $added = false;
        foreach ($session['chat'] as $line) {
            if (! isset($seen[self::chatKey($line)])) {
                $chat[] = $line;
                $added = true;
            }
        }
        if ($added) {
            $chat = array_slice($chat, -self::CHAT);
            $store->set('chat', $chat);
        }

        return ['running' => $running, 'online' => $online, 'history' => $history, 'chat' => $chat];
    }

    /**
     * The admin, ban and whitelist files. A ban is a name, or an object with the name, the reason
     * and the address it was made from. The game writes admins and bans to their files at once,
     * but keeps the whitelist to itself while it runs, so then the game is asked for it.
     *
     * @return array{admins: list<string>, bans: list<array{name: string, reason: string|null}>, whitelist: list<string>, files: array<string, bool>}
     */
    public static function lists(Server $server, bool $running = false): array
    {
        $files = ServerFiles::for($server);
        $result = ['admins' => [], 'bans' => [], 'whitelist' => [], 'files' => []];
        foreach (self::LISTS as $list => $file) {
            $content = $files->readJson($file, 2_000_000);
            $result['files'][$list] = $content !== null;
            foreach ($content ?? [] as $entry) {
                if ($list === 'bans') {
                    $name = is_array($entry) ? (string) ($entry['username'] ?? '') : (string) $entry;
                    if ($name !== '') {
                        $result['bans'][] = ['name' => $name, 'reason' => is_array($entry) && is_string($entry['reason'] ?? null) && $entry['reason'] !== '' ? $entry['reason'] : null];
                    }
                } elseif (is_string($entry) && $entry !== '') {
                    $result[$list][] = $entry;
                }
            }
        }

        if ($running) {
            $result['whitelist'] = self::runningWhitelist($server) ?? $result['whitelist'];
        }

        return $result;
    }

    /**
     * The whitelist of the running game, from "/whitelist get": "The whitelist is empty." or
     * "Whitelisted players: A, B and C". Asked at most every few minutes, so the console does not
     * fill up with it, and again after a whitelist change.
     *
     * @return list<string>|null
     */
    public static function runningWhitelist(Server $server): ?array
    {
        $key = self::whitelistKey($server);
        $cached = Cache::get($key);
        if (is_array($cached)) {
            return $cached;
        }

        foreach (ServerConsole::for($server)->ask('/whitelist get', '/^(The whitelist is empty|Whitelisted players:)/') as $line) {
            if (str_starts_with($line, 'The whitelist is empty')) {
                $names = [];
            } elseif (preg_match('/^Whitelisted players:\s*(.+)$/', $line, $match)) {
                $names = array_values(array_filter(array_map('trim', preg_split('/,\s*|\s+and\s+/', $match[1]) ?: []), PlayerLog::validName(...)));
            } else {
                continue;
            }
            Cache::put($key, $names, 300);

            return $names;
        }

        return null;
    }

    public static function forgetWhitelist(Server $server): void
    {
        Cache::forget(self::whitelistKey($server));
    }

    private static function whitelistKey(Server $server): string
    {
        return 'ext:prism-factorio:whitelist:'.$server->uuid;
    }

    /** @param  array<string, mixed>  $line */
    private static function chatKey(array $line): string
    {
        return ($line['at'] ?? '').'|'.($line['name'] ?? '').'|'.($line['text'] ?? '');
    }
}
