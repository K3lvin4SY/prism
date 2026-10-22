<?php

declare(strict_types=1);

namespace McSuite\Support;

/**
 * Pumpkin keeps its settings in pumpkin.toml instead of server.properties. This maps the
 * server.properties keys MC Suite knows onto it, so every tab can read and write them the
 * same way. Values in and out are server.properties strings ("true", "survival", "20").
 */
final class PumpkinConfig
{
    public const string FILE = 'pumpkin.toml';

    /**
     * Property key → [table, key, kind]. Kinds: bool, int, float, string, title (an enum Pumpkin
     * writes capitalised, "Survival"), inverse (a bool with the opposite meaning).
     */
    private const array KEYS = [
        'motd' => ['networking.java', 'motd', 'string'],
        'max-players' => ['networking.java', 'max_players', 'int'],
        'online-mode' => ['networking.java', 'online_mode', 'bool'],
        'view-distance' => ['networking.java', 'view_distance', 'int'],
        'simulation-distance' => ['networking.java', 'simulation_distance', 'int'],
        'network-compression-threshold' => ['networking.java.compression', 'threshold', 'int'],
        'prevent-proxy-connections' => ['networking.java.authentication', 'prevent_proxy_connections', 'bool'],
        'enable-query' => ['networking.query', 'enabled', 'bool'],
        'difficulty' => ['', 'default_difficulty', 'title'],
        'gamemode' => ['', 'default_gamemode', 'title'],
        'force-gamemode' => ['', 'force_gamemode', 'bool'],
        'hardcore' => ['', 'hardcore', 'bool'],
        'white-list' => ['', 'white_list', 'bool'],
        'enforce-whitelist' => ['', 'enforce_whitelist', 'bool'],
        'level-seed' => ['', 'seed', 'string'],
        'level-name' => ['', 'default_level_name', 'string'],
        'allow-nether' => ['', 'allow_nether', 'bool'],
        'allow-end' => ['', 'allow_end', 'bool'],
        'spawn-protection' => ['', 'spawn_protection', 'int'],
        'op-permission-level' => ['', 'op_permission_level', 'int'],
        'accepts-transfers' => ['', 'accepts_transfers', 'bool'],
        'allow-chat-reports' => ['', 'allow_chat_reports', 'bool'],
        'log-ips' => ['', 'scrub_ips', 'inverse'],
        'tps' => ['', 'tps', 'float'],
        'pvp' => ['pvp', 'enabled', 'bool'],
        'broadcast-console-to-ops' => ['commands', 'broadcast_console_to_ops', 'bool'],
        'console-tty' => ['commands', 'use_tty', 'bool'],
        'chat-format' => ['chat', 'format', 'string'],
        'save-player-data' => ['player_data', 'save_player_data', 'bool'],
        'resource-pack' => ['resource_pack.java', 'url', 'string'],
        'resource-pack-sha1' => ['resource_pack.java', 'sha1', 'string'],
        'resource-pack-prompt' => ['resource_pack.java', 'prompt_message', 'string'],
        'require-resource-pack' => ['resource_pack.java', 'force', 'bool'],
    ];

    public function __construct(private string $text) {}

    public static function supports(string $key): bool
    {
        return isset(self::KEYS[$key]);
    }

    /** @return array<string, string> */
    public function all(): array
    {
        $values = [];
        foreach (array_keys(self::KEYS) as $key) {
            $value = $this->get($key);
            if ($value !== null) {
                $values[$key] = $value;
            }
        }

        return $values;
    }

    public function get(string $key): ?string
    {
        if (! isset(self::KEYS[$key])) {
            return null;
        }

        [$table, $name, $kind] = self::KEYS[$key];
        $raw = TomlLines::scalar(TomlLines::get($this->text, $table, $name));
        if ($raw === null) {
            return null;
        }

        return match ($kind) {
            'title' => strtolower($raw),
            'inverse' => $raw === 'true' ? 'false' : 'true',
            'float' => (string) (int) round((float) $raw),
            default => $raw,
        };
    }

    public function set(string $key, string $value): void
    {
        if (! isset(self::KEYS[$key])) {
            return;
        }

        [$table, $name, $kind] = self::KEYS[$key];
        $raw = match ($kind) {
            'bool' => $value === 'true' ? 'true' : 'false',
            'inverse' => $value === 'true' ? 'false' : 'true',
            'int' => (string) (int) $value,
            'float' => number_format((float) $value, 1, '.', ''),
            'title' => TomlLines::string(ucfirst(strtolower($value))),
            default => TomlLines::string($value),
        };

        $this->text = TomlLines::set($this->text, $table, $name, $raw);

        // A resource pack is only sent while the table says it is on.
        if ($key === 'resource-pack') {
            $this->text = TomlLines::set($this->text, 'resource_pack.java', 'enabled', $value !== '' ? 'true' : 'false');
        }
    }

    /** Sets a raw TOML value outside the property mapping, such as proxy forwarding. */
    public function setRaw(string $table, string $key, string $raw): void
    {
        $this->text = TomlLines::set($this->text, $table, $key, $raw);
    }

    public function removeRaw(string $table, string $key): void
    {
        $this->text = TomlLines::remove($this->text, $table, $key);
    }

    public function getRaw(string $table, string $key): ?string
    {
        return TomlLines::get($this->text, $table, $key);
    }

    public function toString(): string
    {
        return $this->text;
    }
}
