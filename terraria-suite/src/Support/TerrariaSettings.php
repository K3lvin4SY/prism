<?php

declare(strict_types=1);

namespace TerrariaSuite\Support;

use Pterodactyl\Models\Server;
use RuntimeException;

/**
 * A server's settings, whichever files hold them:
 *  - serverconfig.txt for the vanilla server and tModLoader, keys as written there, and
 *  - tshock/config.json ("tshock.X") and tshock/sscconfig.json ("ssc.X") for TShock, both
 *    {"Settings": {...}} objects. Keys Terraria Suite does not know are kept as they are.
 */
final class TerrariaSettings
{
    private const int MAX_FILE = 1_000_000;

    public const string SERVERCONFIG = 'serverconfig.txt';

    public const array JSON_FILES = ['tshock' => 'tshock/config.json', 'ssc' => 'tshock/sscconfig.json'];

    /** @var array<string, \stdClass> decoded JSON files by prefix, as objects so {} stays {} */
    private array $json = [];

    /** @var array<string, bool> files changed since loading */
    private array $dirty = [];

    private ?ServerConfigTxt $config = null;

    private function __construct(private readonly ServerFiles $files, public readonly string $kind) {}

    public static function load(Server $server, string $kind): self
    {
        $settings = new self(ServerFiles::for($server), $kind);

        if ($kind === 'tshock') {
            foreach (self::JSON_FILES as $prefix => $path) {
                $text = $settings->files->read($path, self::MAX_FILE);
                $decoded = $text === null ? null : json_decode($text);
                if ($text !== null && ! $decoded instanceof \stdClass) {
                    throw new RuntimeException("$path is not valid JSON. Fix or delete it, and TShock writes a new one.");
                }

                $settings->json[$prefix] = $decoded ?? new \stdClass();
            }
        } else {
            $settings->config = new ServerConfigTxt($settings->files->read(self::SERVERCONFIG, self::MAX_FILE) ?? '');
        }

        return $settings;
    }

    /** Whether the server has written its settings yet. TShock writes its files on the first start. */
    public function exists(): bool
    {
        return $this->kind !== 'tshock' || isset($this->json['tshock']->Settings);
    }

    /** @return array<string, string> every known value as text, by key */
    public function all(): array
    {
        if ($this->config !== null) {
            return $this->config->all();
        }

        $values = [];
        foreach ($this->json as $prefix => $data) {
            foreach ((array) ($data->Settings ?? []) as $key => $value) {
                if (is_scalar($value)) {
                    $values["$prefix.$key"] = is_bool($value) ? ($value ? 'true' : 'false') : (string) $value;
                }
            }
        }

        return $values;
    }

    public function get(string $key): ?string
    {
        return $this->all()[$key] ?? null;
    }

    /** Sets a value already checked by SettingsSchema::normalize. */
    public function set(string $key, string $value): void
    {
        if ($this->config !== null) {
            $this->config->set($key, $value);
            $this->dirty[self::SERVERCONFIG] = true;

            return;
        }

        [$prefix, $name] = explode('.', $key, 2) + [1 => ''];
        if (! isset(self::JSON_FILES[$prefix]) || $name === '') {
            throw new RuntimeException("Unknown setting $key.");
        }

        $this->json[$prefix]->Settings ??= new \stdClass();
        $this->json[$prefix]->Settings->{$name} = match (SettingsSchema::type($this->kind, $key)) {
            'bool' => $value === 'true',
            'int' => (int) $value,
            default => $value,
        };
        $this->dirty[self::JSON_FILES[$prefix]] = true;
    }

    public function save(): void
    {
        foreach (array_keys($this->dirty) as $path) {
            if ($path === self::SERVERCONFIG) {
                $this->files->write($path, $this->config?->toString() ?? '');

                continue;
            }

            $prefix = array_search($path, self::JSON_FILES, true);
            // TShock writes two-space indented JSON with unescaped slashes; keep that look.
            $text = json_encode($this->json[$prefix], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
            $this->files->write($path, preg_replace_callback('/^( +)/m', static fn (array $match): string => str_repeat(' ', intdiv(strlen($match[1]), 2)), (string) $text)."\n");
        }

        $this->dirty = [];
    }
}
