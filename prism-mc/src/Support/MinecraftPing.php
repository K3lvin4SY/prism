<?php

declare(strict_types=1);

namespace PrismMc\Support;

use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\Server;
use RuntimeException;

/**
 * Asks a running server what the server list would show, without RCON or a plugin:
 * the Java status protocol over TCP, or the RakNet unconnected ping for Bedrock.
 */
final class MinecraftPing
{
    private const string RAKNET_MAGIC = "\x00\xff\xff\x00\xfe\xfe\xfe\xfe\xfd\xfd\xfd\xfd\x12\x34\x56\x78";

    public function __construct(private readonly Server $server, private readonly string $edition) {}

    public static function for(Server $server, ?string $edition): self
    {
        return new self($server, $edition ?? 'java');
    }

    /**
     * @return array{online: int, max: int, motd: string, version: string|null, players: list<array{name: string, id: string}>}
     */
    public function status(): array
    {
        return Cache::remember('ext:prism-mc:ping:'.$this->server->uuid, 10, fn (): array => $this->edition === 'bedrock' ? $this->bedrock() : $this->java());
    }

    /** @return array{0: string, 1: int} */
    private function address(): array
    {
        $allocation = $this->server->allocation;
        throw_unless($allocation, RuntimeException::class, 'The server has no allocation.');

        $host = $allocation->ip;
        if ($host === '0.0.0.0' || $host === '::' || $host === '') {
            $host = $this->server->node->fqdn;
        }

        return [$host, (int) $allocation->port];
    }

    private function timeout(): float
    {
        return max(0.5, min(10.0, (float) Settings::admin('ping_timeout', 2)));
    }

    /** @return array{online: int, max: int, motd: string, version: string|null, players: list<array{name: string, id: string}>} */
    private function java(): array
    {
        [$host, $port] = $this->address();
        $socket = @stream_socket_client('tcp://'.(str_contains($host, ':') ? "[$host]" : $host).':'.$port, $errno, $error, $this->timeout());
        throw_unless($socket, RuntimeException::class, "Could not connect: $error");

        stream_set_timeout($socket, (int) ceil($this->timeout()));

        try {
            $handshake = "\x00".self::varInt(-1).self::varInt(strlen($host)).$host.pack('n', $port).self::varInt(1);
            fwrite($socket, self::varInt(strlen($handshake)).$handshake);
            fwrite($socket, "\x01\x00");

            self::readVarInt($socket);
            $packetId = self::readVarInt($socket);
            throw_unless($packetId === 0, RuntimeException::class, 'Unexpected status packet.');

            $length = self::readVarInt($socket);
            throw_if($length <= 0 || $length > 1_048_576, RuntimeException::class, 'Invalid status length.');

            $json = '';
            while (strlen($json) < $length) {
                $chunk = fread($socket, $length - strlen($json));
                throw_if($chunk === false || $chunk === '', RuntimeException::class, 'The status was cut short.');
                $json .= $chunk;
            }
        } finally {
            fclose($socket);
        }

        $data = json_decode($json, true);
        throw_unless(is_array($data), RuntimeException::class, 'Invalid status JSON.');

        $players = [];
        foreach ($data['players']['sample'] ?? [] as $player) {
            if (is_string($player['name'] ?? null) && is_string($player['id'] ?? null)) {
                $players[] = ['name' => $player['name'], 'id' => $player['id']];
            }
        }

        return [
            'online' => (int) ($data['players']['online'] ?? 0),
            'max' => (int) ($data['players']['max'] ?? 0),
            'motd' => self::flattenComponent($data['description'] ?? ''),
            'version' => is_string($data['version']['name'] ?? null) ? $data['version']['name'] : null,
            'players' => $players,
        ];
    }

    /** @return array{online: int, max: int, motd: string, version: string|null, players: list<array{name: string, id: string}>} */
    private function bedrock(): array
    {
        [$host, $port] = $this->address();
        $socket = @stream_socket_client('udp://'.(str_contains($host, ':') ? "[$host]" : $host).':'.$port, $errno, $error, $this->timeout());
        throw_unless($socket, RuntimeException::class, "Could not connect: $error");

        stream_set_timeout($socket, (int) ceil($this->timeout()));

        try {
            fwrite($socket, "\x01".pack('J', (int) (microtime(true) * 1000)).self::RAKNET_MAGIC.pack('J', random_int(1, PHP_INT_MAX)));
            $response = fread($socket, 4096);
        } finally {
            fclose($socket);
        }

        throw_if(! is_string($response) || strlen($response) < 35 || $response[0] !== "\x1c", RuntimeException::class, 'No Bedrock pong.');

        $length = unpack('n', substr($response, 33, 2))[1];
        $parts = explode(';', substr($response, 35, $length));

        return [
            'online' => (int) ($parts[4] ?? 0),
            'max' => (int) ($parts[5] ?? 0),
            'motd' => trim(($parts[1] ?? '')."\n".($parts[7] ?? '')),
            'version' => $parts[3] ?? null,
            'players' => [],
        ];
    }

    /**
     * Turns a chat component into legacy § text, keeping colors and styles.
     */
    public static function flattenComponent(mixed $component): string
    {
        if (is_string($component)) {
            return $component;
        }

        if (! is_array($component)) {
            return '';
        }

        if (array_is_list($component)) {
            return implode('', array_map(self::flattenComponent(...), $component));
        }

        static $colors = [
            'black' => '0', 'dark_blue' => '1', 'dark_green' => '2', 'dark_aqua' => '3', 'dark_red' => '4',
            'dark_purple' => '5', 'gold' => '6', 'gray' => '7', 'dark_gray' => '8', 'blue' => '9', 'green' => 'a',
            'aqua' => 'b', 'red' => 'c', 'light_purple' => 'd', 'yellow' => 'e', 'white' => 'f',
        ];

        $prefix = '';
        $color = $component['color'] ?? null;
        if (is_string($color) && isset($colors[$color])) {
            $prefix .= '§'.$colors[$color];
        } elseif (is_string($color) && preg_match('/^#([0-9a-fA-F]{6})$/', $color, $match)) {
            $prefix .= '§x'.implode('', array_map(static fn (string $c): string => '§'.strtolower($c), str_split($match[1])));
        }

        foreach (['obfuscated' => 'k', 'bold' => 'l', 'strikethrough' => 'm', 'underlined' => 'n', 'italic' => 'o'] as $style => $code) {
            if (($component[$style] ?? false) === true) {
                $prefix .= '§'.$code;
            }
        }

        $text = $prefix.(is_string($component['text'] ?? null) ? $component['text'] : '');
        foreach ($component['extra'] ?? [] as $extra) {
            $text .= self::flattenComponent($extra);
        }

        return $text;
    }

    private static function varInt(int $value): string
    {
        $value &= 0xFFFFFFFF;
        $out = '';
        do {
            $byte = $value & 0x7F;
            $value >>= 7;
            if ($value !== 0) {
                $byte |= 0x80;
            }

            $out .= chr($byte);
        } while ($value !== 0);

        return $out;
    }

    /** @param resource $socket */
    private static function readVarInt($socket): int
    {
        $value = 0;
        for ($i = 0; $i < 5; $i++) {
            $byte = fread($socket, 1);
            throw_if($byte === false || $byte === '', RuntimeException::class, 'The connection closed.');
            $byte = ord($byte);
            $value |= ($byte & 0x7F) << (7 * $i);
            if (($byte & 0x80) === 0) {
                return $value;
            }
        }

        throw new RuntimeException('VarInt too long.');
    }
}
