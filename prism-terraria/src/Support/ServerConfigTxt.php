<?php

declare(strict_types=1);

namespace PrismTerraria\Support;

/**
 * Terraria's serverconfig.txt: key=value lines and # comments. Only the lines that change are
 * rewritten; a key that is only there as an example comment ("#motd=…") is uncommented in place
 * instead of being added again at the end.
 */
final class ServerConfigTxt
{
    /** @var list<string> */
    private array $lines;

    private string $newline;

    public function __construct(string $content)
    {
        $this->newline = str_contains($content, "\r\n") ? "\r\n" : "\n";
        $this->lines = $content === '' ? [] : preg_split('/\r?\n/', rtrim($content, "\r\n"));
    }

    /** @return array<string, string> values by key, the last occurrence winning like Terraria */
    public function all(): array
    {
        $values = [];
        foreach ($this->lines as $line) {
            if (($pair = self::parse($line)) !== null) {
                $values[$pair[0]] = $pair[1];
            }
        }

        return $values;
    }

    public function get(string $key): ?string
    {
        return $this->all()[$key] ?? null;
    }

    public function set(string $key, string $value): void
    {
        $line = $key.'='.str_replace(["\r", "\n"], ' ', $value);

        // The active line, last one first since Terraria uses the last.
        for ($index = count($this->lines) - 1; $index >= 0; $index--) {
            if ((self::parse($this->lines[$index])[0] ?? null) === $key) {
                $this->lines[$index] = $line;

                return;
            }
        }

        // An example left commented out in the file: the first one is turned on.
        foreach ($this->lines as $index => $existing) {
            if (preg_match('/^\s*#\s*'.preg_quote($key, '/').'\s*=/', $existing)) {
                $this->lines[$index] = $line;

                return;
            }
        }

        $this->lines[] = $line;
    }

    /** Comments a key out, keeping the line so it can be turned on again. */
    public function unset(string $key): void
    {
        foreach ($this->lines as $index => $line) {
            if ((self::parse($line)[0] ?? null) === $key) {
                $this->lines[$index] = '#'.$line;
            }
        }
    }

    public function toString(): string
    {
        return implode($this->newline, $this->lines).$this->newline;
    }

    /** @return array{0: string, 1: string}|null */
    private static function parse(string $line): ?array
    {
        $trimmed = ltrim($line);
        if ($trimmed === '' || $trimmed[0] === '#' || ! str_contains($trimmed, '=')) {
            return null;
        }

        [$key, $value] = explode('=', $trimmed, 2);

        return [trim($key), trim($value)];
    }
}
