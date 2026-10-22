<?php

declare(strict_types=1);

namespace McSuite\Support;

/**
 * Reads and writes the server list of a proxy: Velocity's velocity.toml, or BungeeCord's and
 * Waterfall's config.yml. Only the sections that hold servers are rewritten.
 *
 * The neutral shape is:
 *  servers:     name → {address, motd?, restricted?}
 *  order:       names players are sent to first (Velocity `try`, Bungee `priorities`)
 *  forcedHosts: host → [names] (Velocity only)
 */
final class ProxyConfig
{
    /** Example servers in the files proxies generate, removed on the first link. */
    private const array VELOCITY_EXAMPLES = ['lobby' => '127.0.0.1:30066', 'factions' => '127.0.0.1:30067', 'minigames' => '127.0.0.1:30068'];

    private const array BUNGEE_EXAMPLES = ['lobby' => 'localhost:25565'];

    public function __construct(public readonly string $type, private string $text) {}

    public static function file(string $type): string
    {
        return $type === 'velocity' ? 'velocity.toml' : 'config.yml';
    }

    public function text(): string
    {
        return $this->text;
    }

    public function setText(string $text): void
    {
        $this->text = $text;
    }

    /** @return array{servers: array<string, array<string, mixed>>, order: list<string>, forcedHosts: array<string, list<string>>} */
    public function read(): array
    {
        return $this->type === 'velocity' ? $this->readVelocity() : $this->readBungee();
    }

    /** @param array{servers: array<string, array<string, mixed>>, order: list<string>, forcedHosts: array<string, list<string>>} $config */
    public function write(array $config): void
    {
        $this->type === 'velocity' ? $this->writeVelocity($config) : $this->writeBungee($config);
    }

    /** True while the server list is still the proxy's own example. */
    public function hasOnlyExamples(): bool
    {
        $servers = array_map(static fn (array $server): string => $server['address'], $this->read()['servers']);
        $examples = $this->type === 'velocity' ? self::VELOCITY_EXAMPLES : self::BUNGEE_EXAMPLES;

        return $servers !== [] && array_diff_assoc($servers, $examples) === [];
    }

    // ---- Velocity -------------------------------------------------------------------------

    public function velocityValue(string $key): ?string
    {
        return preg_match('/^'.preg_quote($key, '/').'\s*=\s*"?([^"\r\n]*)"?\s*$/m', $this->text, $match) ? $match[1] : null;
    }

    public function setVelocityValue(string $key, string $tomlValue): void
    {
        $line = "$key = $tomlValue";
        $updated = preg_replace('/^'.preg_quote($key, '/').'\s*=.*$/m', $line, $this->text, 1, $count);
        // A missing top-level key goes before the first [section].
        $this->text = $count > 0 ? (string) $updated : (string) preg_replace('/^\[/m', "$line\n\n[", $this->text, 1);
    }

    /** @return array{servers: array<string, array<string, mixed>>, order: list<string>, forcedHosts: array<string, list<string>>} */
    private function readVelocity(): array
    {
        $servers = [];
        $order = [];
        foreach ($this->tomlSection('servers') as $key => $value) {
            if ($key === 'try') {
                $order = is_array($value) ? $value : [];
            } elseif (is_string($value)) {
                $servers[$key] = ['address' => $value];
            }
        }

        $forced = [];
        foreach ($this->tomlSection('forced-hosts') as $host => $names) {
            $forced[$host] = is_array($names) ? $names : [];
        }

        return ['servers' => $servers, 'order' => $order, 'forcedHosts' => $forced];
    }

    /** @param array{servers: array<string, array<string, mixed>>, order: list<string>, forcedHosts: array<string, list<string>>} $config */
    private function writeVelocity(array $config): void
    {
        $servers = "[servers]\n# Managed by MC Suite: each key is a server name, each value the address players are sent to.\n";
        foreach ($config['servers'] as $name => $server) {
            $servers .= self::tomlKey($name).' = '.self::tomlString($server['address'])."\n";
        }

        $order = array_values(array_filter($config['order'], static fn (string $name): bool => isset($config['servers'][$name])));
        $servers .= "\n# The order players are sent to servers when they join or are kicked.\ntry = [".implode(', ', array_map(self::tomlString(...), $order))."]\n";

        $forced = "[forced-hosts]\n";
        foreach ($config['forcedHosts'] as $host => $names) {
            $names = array_values(array_filter($names, static fn (string $name): bool => isset($config['servers'][$name])));
            if ($names !== []) {
                $forced .= self::tomlString($host).' = ['.implode(', ', array_map(self::tomlString(...), $names))."]\n";
            }
        }

        $this->replaceTomlSection('servers', $servers);
        $this->replaceTomlSection('forced-hosts', $forced);
    }

    /** @return array<string, string|list<string>> */
    private function tomlSection(string $name): array
    {
        $body = $this->tomlSectionBody($name);
        if ($body === null) {
            return [];
        }

        // Join multi-line arrays into single statements first.
        $body = (string) preg_replace('/#[^\r\n"]*$/m', '', $body);
        $statements = [];
        $buffer = '';
        foreach (preg_split('/\r?\n/', $body) as $line) {
            $buffer .= ' '.trim($line);
            if (substr_count($buffer, '[') <= substr_count($buffer, ']')) {
                if (trim($buffer) !== '') {
                    $statements[] = trim($buffer);
                }

                $buffer = '';
            }
        }

        $values = [];
        foreach ($statements as $statement) {
            if (! preg_match('/^("(?:[^"\\\\]|\\\\.)*"|[A-Za-z0-9_.-]+)\s*=\s*(.+)$/', $statement, $match)) {
                continue;
            }

            $key = trim($match[1], '"');
            $value = trim($match[2]);
            if (str_starts_with($value, '[')) {
                preg_match_all('/"((?:[^"\\\\]|\\\\.)*)"/', $value, $items);
                $values[$key] = array_map('stripcslashes', $items[1]);
            } else {
                $values[$key] = stripcslashes(trim($value, '"'));
            }
        }

        return $values;
    }

    private function tomlSectionBody(string $name): ?string
    {
        if (! preg_match('/^\['.preg_quote($name, '/').'\]\s*$/m', $this->text, $match, PREG_OFFSET_CAPTURE)) {
            return null;
        }

        $start = $match[0][1] + strlen($match[0][0]);
        $end = preg_match('/^\[[^\]]+\]\s*$/m', $this->text, $next, PREG_OFFSET_CAPTURE, $start) ? $next[0][1] : strlen($this->text);

        return substr($this->text, $start, $end - $start);
    }

    private function replaceTomlSection(string $name, string $content): void
    {
        if (! preg_match('/^\['.preg_quote($name, '/').'\]\s*$/m', $this->text, $match, PREG_OFFSET_CAPTURE)) {
            $this->text = rtrim($this->text)."\n\n".$content;

            return;
        }

        $start = $match[0][1];
        $after = $start + strlen($match[0][0]);
        $end = preg_match('/^\[[^\]]+\]\s*$/m', $this->text, $next, PREG_OFFSET_CAPTURE, $after) ? $next[0][1] : strlen($this->text);
        $this->text = substr($this->text, 0, $start).$content."\n".substr($this->text, $end);
    }

    private static function tomlString(string $value): string
    {
        return '"'.addcslashes($value, "\"\\").'"';
    }

    private static function tomlKey(string $key): string
    {
        return preg_match('/^[A-Za-z0-9_-]+$/', $key) ? $key : self::tomlString($key);
    }

    // ---- BungeeCord / Waterfall -----------------------------------------------------------

    /** A top-level scalar of config.yml, such as ip_forward. */
    public function bungeeValue(string $key): ?string
    {
        return preg_match('/^'.preg_quote($key, '/').':\s*(\S+)/m', $this->text, $match) ? trim($match[1], '\'"') : null;
    }

    public function setBungeeValue(string $key, string $value): void
    {
        $updated = preg_replace('/^'.preg_quote($key, '/').':.*$/m', "$key: $value", $this->text, 1, $count);
        $this->text = $count > 0 ? (string) $updated : rtrim($this->text)."\n$key: $value\n";
    }

    /** @return array{servers: array<string, array<string, mixed>>, order: list<string>, forcedHosts: array<string, list<string>>} */
    private function readBungee(): array
    {
        $servers = [];
        $current = null;
        foreach ($this->yamlBlock('servers') ?? [] as $line) {
            if (preg_match('/^  ([^\s:#][^:]*):\s*$/', $line, $match)) {
                $current = trim($match[1], '\'"');
                $servers[$current] = ['address' => '', 'motd' => '', 'restricted' => false];
            } elseif ($current !== null && preg_match('/^    (address|motd|restricted):\s*(.*?)\s*$/', $line, $match)) {
                $value = trim($match[2], '\'"');
                $servers[$current][$match[1]] = $match[1] === 'restricted' ? $value === 'true' : $value;
            }
        }

        $order = [];
        if (preg_match('/^(\s*)priorities:\s*\r?\n((?:\1\s*-\s*.+\r?\n?)+)/m', $this->text, $match)) {
            preg_match_all('/-\s*([^\r\n#]+)/', $match[2], $items);
            $order = array_map(static fn (string $item): string => trim($item, " '\""), $items[1]);
        }

        return ['servers' => $servers, 'order' => $order, 'forcedHosts' => []];
    }

    /** @param array{servers: array<string, array<string, mixed>>, order: list<string>, forcedHosts: array<string, list<string>>} $config */
    private function writeBungee(array $config): void
    {
        $block = "servers:\n";
        foreach ($config['servers'] as $name => $server) {
            $block .= '  '.$name.":\n";
            $block .= '    motd: '.YamlLines::quote((string) ($server['motd'] ?? $name))."\n";
            $block .= '    address: '.$server['address']."\n";
            $block .= '    restricted: '.(($server['restricted'] ?? false) ? 'true' : 'false')."\n";
        }

        $lines = preg_split('/\r?\n/', $this->text);
        $range = $this->yamlBlockRange('servers');
        if ($range === null) {
            $this->text = rtrim($this->text)."\n".$block;
        } else {
            array_splice($lines, $range[0], $range[1] - $range[0], explode("\n", rtrim($block)));
            $this->text = implode("\n", $lines);
        }

        $order = array_values(array_filter($config['order'], static fn (string $name): bool => isset($config['servers'][$name])));
        $this->text = (string) preg_replace_callback(
            '/^(\s*)priorities:\s*\r?\n(?:\1\s*-\s*.+\r?\n?)*/m',
            static fn (array $match): string => $match[1].'priorities:'."\n".implode('', array_map(static fn (string $name): string => $match[1].'- '.$name."\n", $order)),
            $this->text,
            1,
        );
    }

    /** @return list<string>|null the lines inside a top-level block */
    private function yamlBlock(string $key): ?array
    {
        $range = $this->yamlBlockRange($key);
        if ($range === null) {
            return null;
        }

        return array_slice(preg_split('/\r?\n/', $this->text), $range[0] + 1, $range[1] - $range[0] - 1);
    }

    /** @return array{0: int, 1: int}|null the first line of a top-level block and the line after its end */
    private function yamlBlockRange(string $key): ?array
    {
        $lines = preg_split('/\r?\n/', $this->text);
        foreach ($lines as $index => $line) {
            if (preg_match('/^'.preg_quote($key, '/').':\s*$/', $line)) {
                $end = $index + 1;
                while ($end < count($lines) && ($lines[$end] === '' || $lines[$end][0] === ' ' || $lines[$end][0] === '#')) {
                    $end++;
                }

                return [$index, $end];
            }
        }

        return null;
    }
}
