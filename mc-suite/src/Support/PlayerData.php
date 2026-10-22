<?php

declare(strict_types=1);

namespace McSuite\Support;

use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * Everything MC Suite knows about a server's players, read from files the server keeps
 * anyway: the user cache, op, whitelist and ban lists, player data, and the server log.
 * No RCON or plugin is involved.
 */
final class PlayerData
{
    public const string UUID = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/';

    private const int MAX_LOG = 4_000_000;

    private ?ServerFiles $files = null;

    /** @var array<string, string>|null */
    private ?array $properties = null;

    /** @var array{0: string, 1: string, 2: string}|null */
    private ?array $folders = null;

    public function __construct(private readonly Server $server, private readonly string $edition) {}

    public static function for(Server $server, string $edition): self
    {
        return new self($server, $edition);
    }

    public function files(): ServerFiles
    {
        return $this->files ??= ServerFiles::for($this->server);
    }

    /** Pumpkin's list files live in data/, everything else in the server root. */
    private const array PUMPKIN_DATA = ['ops.json', 'whitelist.json', 'banned-players.json', 'banned-ips.json'];

    /** @return array<string, string> */
    public function properties(): array
    {
        return $this->properties ??= ServerProperties::load($this->server)->all();
    }

    public function isPumpkin(): bool
    {
        return (Detector::for($this->server)->info()['software'] ?? null) === 'pumpkin';
    }

    /** Where a player list such as ops.json is kept on this server. */
    public function listPath(string $file): string
    {
        return $this->isPumpkin() && in_array($file, self::PUMPKIN_DATA, true) ? 'data/'.$file : $file;
    }

    public function levelName(): string
    {
        $name = $this->properties()['level-name'] ?? '';

        return $name !== '' ? ServerFiles::normalize($name) : ($this->edition === 'bedrock' ? 'Bedrock level' : 'world');
    }

    public function isRunning(): bool
    {
        try {
            return in_array(Daemon::server($this->server)->details()['state'] ?? 'offline', ['running', 'starting'], true);
        } catch (Throwable) {
            return false;
        }
    }

    /**
     * The player data, stats and advancements folders. Minecraft 26.1 moved them under
     * players/; older worlds keep them at the top of the world folder.
     *
     * @return array{0: string, 1: string, 2: string}
     */
    public function playerFolders(): array
    {
        if ($this->folders !== null) {
            return $this->folders;
        }

        $level = $this->levelName();
        $modern = array_key_exists('players', $this->files()->list($level));

        return $this->folders = $modern
            ? ["$level/players/data", "$level/players/stats", "$level/players/advancements"]
            : ["$level/playerdata", "$level/stats", "$level/advancements"];
    }

    /**
     * The region folder of a dimension. Minecraft 26.1 keeps every dimension under
     * dimensions/minecraft/; older vanilla worlds use DIM-1 and DIM1, and Bukkit servers keep
     * the Nether and the End in worlds of their own.
     */
    public function regionFolder(string $dimension): ?string
    {
        $level = $this->levelName();
        $root = $this->files()->list($level);

        if (array_key_exists('dimensions', $root)) {
            return "$level/dimensions/minecraft/$dimension/region";
        }

        if ($dimension === 'overworld') {
            return "$level/region";
        }

        $folder = $dimension === 'the_nether' ? 'DIM-1' : 'DIM1';
        if (array_key_exists($folder, $root)) {
            return "$level/$folder/region";
        }

        $bukkit = $level.($dimension === 'the_nether' ? '_nether' : '_the_end');

        return array_key_exists($folder, $this->files()->list($bukkit)) ? "$bukkit/$folder/region" : null;
    }

    /** @return list<array<string, mixed>> */
    public function jsonList(string $file): array
    {
        try {
            $data = $this->files()->readJson($this->listPath($file), 2_000_000);
        } catch (Throwable) {
            return [];
        }

        return is_array($data) && array_is_list($data) ? array_values(array_filter($data, 'is_array')) : [];
    }

    /**
     * Events from the current log, oldest first: joins, leaves, kicks, bans and op changes.
     *
     * @return list<array{time: string|null, name: string, event: string, detail: string|null, id: string|null}>
     */
    public function events(): array
    {
        $log = '';
        try {
            $size = $this->files()->size('logs/latest.log');
            if ($size !== null && $size <= self::MAX_LOG) {
                $log = $this->files()->read('logs/latest.log', self::MAX_LOG) ?? '';
            }
        } catch (Throwable) {
            // No log yet.
        }

        // Bedrock keeps no latest.log; its console is the only record.
        if ($log === '') {
            try {
                $log = implode("\n", Daemon::server($this->server)->logs(100));
            } catch (Throwable) {
                $log = '';
            }
        }

        $events = [];
        foreach (preg_split('/\r?\n/', $log) as $line) {
            $line = (string) preg_replace('/\e\[[0-9;]*[A-Za-z]/', '', $line);
            $event = $this->edition === 'bedrock' ? $this->bedrockEvent($line) : $this->javaEvent($line);
            if ($event !== null) {
                $events[] = $event;
            }
        }

        return $events;
    }

    /** @return array{time: string|null, name: string, event: string, detail: string|null, id: string|null}|null */
    private function javaEvent(string $line): ?array
    {
        if (preg_match('/^\[(\d{2}:\d{2}:\d{2})[^\]]*\](?:\s*\[[^\]]*\])*:\s?(.*)$/', $line, $match)) {
            [, $time, $message] = $match;
        } elseif (preg_match('/^(?:(\d{2}:\d{2}:\d{2})\s+)?\[?(?:INFO|WARN|ERROR|DEBUG)\]?\s+(.*)$/', $line, $match)) {
            // Pumpkin: "[INFO] message" in latest.log, "12:00:00  INFO message" on the console.
            $time = $match[1] !== '' ? $match[1] : null;
            $message = $match[2];
        } else {
            return null;
        }

        $name = '[.*]?[A-Za-z0-9_]{1,32}';

        $patterns = [
            'joined' => "/^($name) joined the game/",
            'left' => "/^($name) left the game/",
            'kicked' => "/^Kicked ($name): (.*)$/",
            'lost' => "/^($name) lost connection: (.*)$/",
            'banned' => "/^Banned ($name): (.*)$/",
            'unbanned' => "/^Unbanned ($name)/",
            'opped' => "/^Made ($name) a server operator/",
            'deopped' => "/^Made ($name) no longer a server operator/",
            'whitelisted' => "/^Added ($name) to the whitelist/",
            'unwhitelisted' => "/^Removed ($name) from the whitelist/",
            'uuid' => "/^UUID of player ($name) is ([0-9a-f-]{36})/",
        ];

        foreach ($patterns as $event => $pattern) {
            if (preg_match($pattern, $message, $found)) {
                return [
                    'time' => $time,
                    'name' => $found[1],
                    'event' => $event,
                    'detail' => $event === 'uuid' ? null : (isset($found[2]) ? mb_substr($found[2], 0, 200) : null),
                    'id' => $event === 'uuid' ? $found[2] : null,
                ];
            }
        }

        return null;
    }

    /** @return array{time: string|null, name: string, event: string, detail: string|null, id: string|null}|null */
    private function bedrockEvent(string $line): ?array
    {
        $time = preg_match('/^\[\d{4}-\d{2}-\d{2} (\d{2}:\d{2}:\d{2})/', $line, $stamp) ? $stamp[1] : null;

        if (preg_match('/Player connected: (.+?), xuid: (\d+)/', $line, $match)) {
            return ['time' => $time, 'name' => $match[1], 'event' => 'joined', 'detail' => null, 'id' => $match[2]];
        }

        if (preg_match('/Player disconnected: (.+?), xuid: (\d+)/', $line, $match)) {
            return ['time' => $time, 'name' => $match[1], 'event' => 'left', 'detail' => null, 'id' => $match[2]];
        }

        return null;
    }

    /**
     * Who is online right now: replayed from the log, merged with the ping's player sample.
     *
     * @param  list<array<string, mixed>>  $events
     * @param  array<string, mixed>|null  $status
     * @return array<string, string|null> name → id
     */
    public static function onlineFrom(array $events, ?array $status): array
    {
        $online = [];
        foreach ($events as $event) {
            if ($event['event'] === 'joined') {
                $online[$event['name']] = $event['id'];
            } elseif (in_array($event['event'], ['left', 'kicked', 'lost'], true)) {
                unset($online[$event['name']]);
            }
        }

        foreach ($status['players'] ?? [] as $player) {
            $online[$player['name']] ??= $player['id'];
        }

        return $online;
    }
}
