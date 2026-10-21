<?php

declare(strict_types=1);

namespace McSuite\Support;

/**
 * A server.properties file that can be patched in place: only changed keys are rewritten,
 * so comments, ordering, spacing and unknown keys stay exactly as they were.
 *
 * Java Edition files use java.util.Properties escaping (\uXXXX, \:, \=, \n). Bedrock files
 * are plain UTF-8 key=value lines, so escaping is turned off for them.
 */
final class PropertiesFile
{
    /** @var list<string> */
    private array $lines;

    /** @var array<string, int> key → line index */
    private array $index = [];

    private string $newline;

    public function __construct(string $content, private readonly bool $javaEscapes = true)
    {
        $this->newline = str_contains($content, "\r\n") ? "\r\n" : "\n";
        $this->lines = $content === '' ? [] : preg_split('/\r?\n/', rtrim($content, "\r\n"));

        foreach ($this->lines as $i => $line) {
            $parsed = $this->parseLine($line);
            if ($parsed !== null) {
                $this->index[$parsed[0]] = $i;
            }
        }
    }

    /** @return array<string, string> decoded values by key, in file order */
    public function all(): array
    {
        $values = [];
        foreach ($this->index as $key => $i) {
            $values[$key] = $this->parseLine($this->lines[$i])[1];
        }

        return $values;
    }

    public function get(string $key): ?string
    {
        return isset($this->index[$key]) ? $this->parseLine($this->lines[$this->index[$key]])[1] : null;
    }

    public function set(string $key, string $value): void
    {
        $line = $this->encodeKey($key).'='.$this->encodeValue($value);

        if (isset($this->index[$key])) {
            $this->lines[$this->index[$key]] = $line;

            return;
        }

        $this->lines[] = $line;
        $this->index[$key] = count($this->lines) - 1;
    }

    public function toString(): string
    {
        return implode($this->newline, $this->lines).$this->newline;
    }

    /** @return array{0: string, 1: string}|null */
    private function parseLine(string $line): ?array
    {
        $trimmed = ltrim($line);
        if ($trimmed === '' || $trimmed[0] === '#' || $trimmed[0] === '!') {
            return null;
        }

        $length = strlen($trimmed);
        $separator = null;
        for ($i = 0; $i < $length; $i++) {
            $char = $trimmed[$i];
            if ($char === '\\' && $this->javaEscapes) {
                $i++;

                continue;
            }

            if ($char === '=' || $char === ':' && $this->javaEscapes) {
                $separator = $i;
                break;
            }
        }

        if ($separator === null) {
            return [$this->decode(rtrim($trimmed)), ''];
        }

        $key = $this->decode(rtrim(substr($trimmed, 0, $separator)));
        $value = ltrim(substr($trimmed, $separator + 1), " \t\f");

        return [$key, $this->javaEscapes ? $this->decode($value) : rtrim($value, "\r")];
    }

    private function decode(string $text): string
    {
        if (! $this->javaEscapes || ! str_contains($text, '\\')) {
            return $text;
        }

        return (string) preg_replace_callback('/\\\\(u[0-9a-fA-F]{4}|.)/s', static function (array $match): string {
            $escape = $match[1];
            if ($escape[0] === 'u' && strlen($escape) === 5) {
                return mb_chr((int) hexdec(substr($escape, 1)), 'UTF-8');
            }

            return match ($escape) {
                'n' => "\n",
                't' => "\t",
                'r' => "\r",
                'f' => "\f",
                default => $escape,
            };
        }, $text);
    }

    private function encodeKey(string $key): string
    {
        return $this->javaEscapes ? str_replace(['\\', '=', ':', ' '], ['\\\\', '\\=', '\\:', '\\ '], $key) : $key;
    }

    private function encodeValue(string $value): string
    {
        if (! $this->javaEscapes) {
            return str_replace(["\r", "\n"], '', $value);
        }

        $out = '';
        foreach (mb_str_split($value, 1, 'UTF-8') as $position => $char) {
            $out .= match ($char) {
                '\\' => '\\\\',
                "\n" => '\\n',
                "\r" => '\\r',
                "\t" => '\\t',
                "\f" => '\\f',
                '=' => '\\=',
                ':' => '\\:',
                '#' => '\\#',
                '!' => '\\!',
                ' ' => $position === 0 ? '\\ ' : ' ',
                default => $this->encodeChar($char),
            };
        }

        return $out;
    }

    private function encodeChar(string $char): string
    {
        $code = mb_ord($char, 'UTF-8');
        if ($code >= 0x20 && $code <= 0x7E) {
            return $char;
        }

        if ($code > 0xFFFF) {
            // Supplementary characters become a UTF-16 surrogate pair, as Java writes them.
            $code -= 0x10000;

            return sprintf('\\u%04X\\u%04X', 0xD800 + ($code >> 10), 0xDC00 + ($code & 0x3FF));
        }

        return sprintf('\\u%04X', $code);
    }
}
