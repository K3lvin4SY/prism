<?php

declare(strict_types=1);

namespace TerrariaSuite\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use TerrariaSuite\Support\ServerConsole;
use TerrariaSuite\Support\ServerFiles;
use TerrariaSuite\Support\TerrariaSettings;
use TerrariaSuite\Support\TShockDatabase;
use Throwable;

/**
 * Players. Terraria keeps characters on the players' own computers, so what a server knows is
 * who is online (asked with the "playing" command), who came and went (its logs) and its ban
 * list. TShock adds accounts, groups, bans by account, and with server-side characters on,
 * every character's inventory, all from its database.
 */
class PlayersController extends Controller
{
    /** Names Terraria accepts: anything on one line, without the quotes commands are built with. */
    private const string NAME = '/^[^"\r\n\t]{1,24}$/u';

    public function index(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'players', 'players-view');
        $kind = $info['kind'];
        $console = ServerConsole::for($server);
        $running = $console->isRunning();

        $online = $running ? Cache::remember('ext:terraria-suite:online:'.$server->uuid, 10, fn (): array => $this->online($console, $kind)) : [];

        $response = [
            'kind' => $kind,
            'running' => $running,
            'online' => $online,
            'activity' => array_slice(array_reverse($this->activity($server, $console, $kind)), 0, 50),
            'canManage' => $this->can($request, $server, 'players-manage'),
        ];

        if ($kind === 'tshock') {
            $database = TShockDatabase::open($server);
            $settings = TerrariaSettings::load($server, 'tshock');

            return new JsonResponse([
                ...$response,
                'accounts' => $database?->accounts() ?? [],
                'bans' => $database?->bans() ?? [],
                'groups' => $database?->groups() ?? [],
                'ssc' => $settings->get('ssc.Enabled') === 'true',
                'database' => $database !== null,
            ]);
        }

        return new JsonResponse([...$response, 'bans' => $this->banlist($server)]);
    }

    /** One TShock account, with its server-side character when it has one. */
    public function show(Request $request, Server $server, int $account): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'players', 'players-view');
        abort_unless($info['kind'] === 'tshock', 404, 'Only TShock keeps accounts and characters on the server.');

        $database = TShockDatabase::open($server);
        $details = $database?->account($account);
        abort_if($details === null, 404, 'No such account.');

        $online = ServerConsole::for($server)->isRunning()
            ? Cache::remember('ext:terraria-suite:online:'.$server->uuid, 10, fn (): array => $this->online(ServerConsole::for($server), 'tshock'))
            : [];

        return new JsonResponse([
            'account' => $details,
            'character' => $database->character($account),
            'groups' => $database->groups(),
            'bans' => array_values(array_filter($database->bans(), static fn (array $ban): bool => $ban['type'] === 'acc' && strcasecmp($ban['value'], $details['name']) === 0)),
            'online' => in_array(strtolower($details['name']), array_map('strtolower', array_column($online, 'name')), true),
            'canManage' => $this->can($request, $server, 'players-manage'),
        ]);
    }

    public function action(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'players', 'players-manage');
        $kind = $info['kind'];
        $data = $request->validate([
            'action' => ['required', 'string', 'in:kick,ban,unban,say,message,heal,godmode,mute,unmute,give,group,delete-account'],
            'name' => ['nullable', 'string', 'regex:'.self::NAME],
            'account' => ['nullable', 'string', 'regex:'.self::NAME],
            'reason' => ['nullable', 'string', 'max:200', 'not_regex:/["\r\n]/'],
            'duration' => ['nullable', 'string', 'regex:/^(\d+[dhms])+$/'],
            'ticket' => ['nullable', 'integer', 'min:1'],
            'group' => ['nullable', 'string', 'regex:/^[A-Za-z0-9_-]{1,32}$/'],
            'item' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'amount' => ['nullable', 'integer', 'min:1', 'max:9999'],
            'text' => ['nullable', 'string', 'max:300'],
        ]);

        $action = $data['action'];
        $name = $data['name'] ?? null;
        $reason = trim((string) ($data['reason'] ?? '')) ?: 'No reason given.';
        $text = trim((string) preg_replace('/[\r\n]+/', ' ', (string) ($data['text'] ?? '')));
        $console = ServerConsole::for($server);

        // The vanilla server keeps bans in banlist.txt and has no unban command.
        if ($action === 'unban' && $kind !== 'tshock') {
            abort_if($name === null, 422, 'Pick a player.');
            $this->unbanVanilla($server, $name);
            $this->log($action, $name);

            return new JsonResponse(['applied' => 'file']);
        }

        abort_unless($console->isRunning(), 409, 'Start the server first: this is done through its console.');

        $need = static function (?string $value, string $what): string {
            abort_if($value === null || $value === '', 422, "Pick $what.");

            return $value;
        };

        $command = $kind === 'tshock'
            ? match ($action) {
                'kick' => sprintf('kick "%s" "%s"', $need($name, 'a player'), $reason),
                // An online player by name, or any account with TShock's exact identifier form.
                'ban' => isset($data['account'])
                    ? trim(sprintf('ban add acc:%s "%s" %s -e', $data['account'], $reason, $data['duration'] ?? ''))
                    : trim(sprintf('ban add "%s" "%s" %s', $need($name, 'a player'), $reason, $data['duration'] ?? '')),
                'unban' => sprintf('ban del %d', $need(isset($data['ticket']) ? (string) $data['ticket'] : null, 'a ban')),
                'say' => 'say '.$need($text, 'a message'),
                'message' => sprintf('w "%s" %s', $need($name, 'a player'), $need($text, 'a message')),
                'heal' => sprintf('heal "%s"', $need($name, 'a player')),
                'godmode' => sprintf('godmode "%s"', $need($name, 'a player')),
                'mute' => sprintf('mute "%s" "%s"', $need($name, 'a player'), $reason),
                'unmute' => sprintf('mute "%s"', $need($name, 'a player')),
                'give' => sprintf('give %d "%s" %d', $need(isset($data['item']) ? (string) $data['item'] : null, 'an item'), $need($name, 'a player'), $data['amount'] ?? 1),
                'group' => sprintf('user group "%s" %s', $need($data['account'] ?? null, 'an account'), $need($data['group'] ?? null, 'a group')),
                'delete-account' => sprintf('user del "%s"', $need($data['account'] ?? null, 'an account')),
            }
            : match ($action) {
                'kick' => 'kick '.$need($name, 'a player'),
                'ban' => 'ban '.$need($name, 'a player'),
                'say' => 'say '.$need($text, 'a message'),
                default => abort(422, 'The '.($kind === 'tmodloader' ? 'tModLoader' : 'Terraria').' server cannot do this. TShock can.'),
            };

        $console->send($command);
        Cache::forget('ext:terraria-suite:online:'.$server->uuid);
        $this->log($action, $name ?? $data['account'] ?? null);

        return new JsonResponse(['applied' => 'command']);
    }

    /**
     * Who is online, from the "playing" command.
     *  Terraria / tModLoader: "Name (1.2.3.4:5678)" lines, then "2 players connected." or "No players connected."
     *  TShock: "Online Players (2/8):" with the names after it, or "There are currently no players online."
     *
     * @return list<array{name: string, ip: string|null}>
     */
    private function online(ServerConsole $console, string $kind): array
    {
        try {
            $reply = $kind === 'tshock'
                ? $console->ask('playing', '/no players online|Online Players/i')
                : $console->ask('playing', '/players? connected\.?$/i');
        } catch (Throwable) {
            return [];
        }

        $players = [];
        if ($kind === 'tshock') {
            $collecting = false;
            foreach ($reply as $line) {
                if (preg_match('/Online Players \(\d+\/\d+\):\s*(.*)$/i', $line, $match)) {
                    $collecting = true;
                    $line = $match[1];
                } elseif (! $collecting || str_starts_with($line, ':') || preg_match('/^(Type|Server executed)/i', $line)) {
                    continue;
                }

                foreach (preg_split('/,\s*/', $line) as $player) {
                    $player = trim($player);
                    if ($player !== '' && preg_match(self::NAME, $player)) {
                        $players[] = ['name' => $player, 'ip' => null];
                    }
                }
            }

            return $players;
        }

        foreach ($reply as $line) {
            if (preg_match('/^(.+?) \(([0-9a-f.:\[\]]+?)(?::\d+)?\)$/i', $line, $match)) {
                $players[] = ['name' => $match[1], 'ip' => $match[2]];
            }
        }

        return $players;
    }

    /**
     * Joins and leaves, oldest first, from the console and the server's own log file.
     *
     * @return list<array{time: string|null, name: string, event: string, detail: string|null}>
     */
    private function activity(Server $server, ServerConsole $console, string $kind): array
    {
        $text = implode("\n", $console->lines(100));
        $file = $this->logFile($server, $kind);
        if ($file !== null) {
            $text = $file."\n".$text;
        }

        $events = [];
        $seen = [];
        foreach (preg_split('/\r?\n/', $text) as $line) {
            $time = preg_match('/(\d{2}:\d{2}:\d{2})/', $line, $stamp) ? $stamp[1] : null;
            $event = match (true) {
                (bool) preg_match('/(?:^|\]\s*|- |: )([^\[\]:]{1,24}?) \(([\d.]+)\) from \'([^\']*)\' group(?: from \'([^\']*)\')? joined/', $line, $match) => ['joined', $match[1], trim(($match[4] ?? '') ?: $match[3])],
                (bool) preg_match('/(?:^|\]\s*|- |: )([^\[\]:]{1,24}?)(?: \([^)]*\))? has joined\.?$/', $line, $match) => ['joined', $match[1], null],
                (bool) preg_match('/(?:^|\]\s*|- |: )([^\[\]:]{1,24}?) has left\.?$/', $line, $match) => ['left', $match[1], null],
                default => null,
            };

            if ($event === null) {
                continue;
            }

            // The same join is in the console and the log, and TShock writes it twice: keep one.
            $key = $time.'|'.$event[0].'|'.$event[1];
            if (isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
            $events[] = ['time' => $time, 'name' => trim($event[1]), 'event' => $event[0], 'detail' => $event[2]];
        }

        return $events;
    }

    /** The newest TShock log, or tModLoader's server.log; the vanilla server keeps none. */
    private function logFile(Server $server, string $kind): ?string
    {
        try {
            $files = ServerFiles::for($server);
            $path = match ($kind) {
                'tmodloader' => 'tModLoader-Logs/server.log',
                'tshock' => (static function () use ($files): ?string {
                    $logs = array_filter($files->list('tshock/logs'), static fn (array $file, string $name): bool => $file['file'] && str_ends_with($name, '.log'), ARRAY_FILTER_USE_BOTH);
                    uasort($logs, static fn (array $a, array $b): int => strcmp((string) $b['modified'], (string) $a['modified']));
                    $name = array_key_first($logs);

                    return $name !== null ? 'tshock/logs/'.$name : null;
                })(),
                default => null,
            };

            if ($path === null) {
                return null;
            }

            $size = $files->size($path);

            return $size !== null && $size < 4_000_000 ? $files->read($path, 4_000_000) : null;
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * banlist.txt of the vanilla server and tModLoader: "//Name" then the banned address.
     *
     * @return list<array{name: string, ip: string|null}>
     */
    private function banlist(Server $server): array
    {
        $text = ServerFiles::for($server)->read('banlist.txt', 1_000_000) ?? '';
        $bans = [];
        $lines = preg_split('/\r?\n/', $text);
        foreach ($lines as $index => $line) {
            if (str_starts_with($line, '//')) {
                $next = trim($lines[$index + 1] ?? '');
                $bans[] = ['name' => substr($line, 2), 'ip' => $next !== '' && ! str_starts_with($next, '//') ? $next : null];
            }
        }

        return $bans;
    }

    private function unbanVanilla(Server $server, string $name): void
    {
        $files = ServerFiles::for($server);
        $lines = preg_split('/\r?\n/', $files->read('banlist.txt', 1_000_000) ?? '');
        $kept = [];
        for ($index = 0; $index < count($lines); $index++) {
            if (strcasecmp($lines[$index], '//'.$name) === 0) {
                // The address line after the name goes with it.
                if (isset($lines[$index + 1]) && ! str_starts_with($lines[$index + 1], '//')) {
                    $index++;
                }

                continue;
            }

            $kept[] = $lines[$index];
        }

        $files->write('banlist.txt', rtrim(implode("\n", $kept))."\n");
    }

    private function log(string $action, ?string $name): void
    {
        Activity::event('server:terraria-suite.players.'.$action)->property('player', $name)->log();
    }
}
