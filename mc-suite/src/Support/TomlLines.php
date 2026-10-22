<?php

declare(strict_types=1);

namespace McSuite\Support;

/**
 * Reads and sets single keys in a TOML file without rewriting it: comments, order and every
 * other line stay exactly as they were. Enough for flat keys in [section] tables, which is
 * all the configs MC Suite edits use.
 */
final class TomlLines
{
    /** The raw TOML value of a key, or null. Section '' is the top level, before any table. */
    public static function get(string $text, string $section, string $key): ?string
    {
        [$start, $end] = self::range($text, $section) ?? [null, null];
        if ($start === null) {
            return null;
        }

        $lines = self::lines($text);
        for ($index = $start; $index < $end; $index++) {
            if (preg_match('/^\s*'.preg_quote($key, '/').'\s*=\s*(.*?)\s*$/', $lines[$index], $match)) {
                return self::stripComment($match[1]);
            }
        }

        return null;
    }

    /** Sets a key to a raw TOML value, adding the key, or the table, when it is missing. */
    public static function set(string $text, string $section, string $key, string $value): string
    {
        $lines = self::lines($text);
        $line = "$key = $value";
        $range = self::range($text, $section);

        if ($range === null) {
            $text = rtrim($text);
            if ($section === '') {
                return $line."\n".($text === '' ? '' : $text."\n");
            }

            return ($text === '' ? '' : $text."\n\n")."[$section]\n$line\n";
        }

        [$start, $end] = $range;
        for ($index = $start; $index < $end; $index++) {
            if (preg_match('/^(\s*)'.preg_quote($key, '/').'\s*=/', $lines[$index], $match)) {
                $lines[$index] = $match[1].$line;

                return implode("\n", $lines);
            }
        }

        // New keys go after the table's last key, before the blank lines that end it.
        $insert = $end;
        while ($insert > $start && trim($lines[$insert - 1]) === '') {
            $insert--;
        }

        array_splice($lines, $insert, 0, [$line]);

        return implode("\n", $lines);
    }

    /** Removes a key, leaving the rest of the file as it was. */
    public static function remove(string $text, string $section, string $key): string
    {
        $range = self::range($text, $section);
        if ($range === null) {
            return $text;
        }

        $lines = self::lines($text);
        for ($index = $range[0]; $index < $range[1]; $index++) {
            if (preg_match('/^\s*'.preg_quote($key, '/').'\s*=/', $lines[$index])) {
                array_splice($lines, $index, 1);

                return implode("\n", $lines);
            }
        }

        return $text;
    }

    public static function string(string $value): string
    {
        return '"'.addcslashes($value, "\"\\\n\r\t").'"';
    }

    /** A raw value as plain text: strings unquoted, everything else as written. */
    public static function scalar(?string $raw): ?string
    {
        if ($raw === null) {
            return null;
        }

        if (preg_match('/^"((?:[^"\\\\]|\\\\.)*)"$/', $raw, $match)) {
            return stripcslashes($match[1]);
        }

        if (preg_match("/^'([^']*)'$/", $raw, $match)) {
            return $match[1];
        }

        return $raw;
    }

    /** @return array{0: int, 1: int}|null the first line inside a table and the line after its end */
    private static function range(string $text, string $section): ?array
    {
        $lines = self::lines($text);
        $start = null;

        if ($section === '') {
            $start = 0;
        } else {
            foreach ($lines as $index => $line) {
                if (preg_match('/^\s*\[\s*'.preg_quote($section, '/').'\s*\]\s*(#.*)?$/', $line)) {
                    $start = $index + 1;
                    break;
                }
            }
        }

        if ($start === null) {
            return null;
        }

        $end = count($lines);
        for ($index = $start; $index < count($lines); $index++) {
            if (preg_match('/^\s*\[/', $lines[$index])) {
                $end = $index;
                break;
            }
        }

        return [$start, $end];
    }

    /** @return list<string> */
    private static function lines(string $text): array
    {
        return preg_split('/\r?\n/', $text) ?: [''];
    }

    private static function stripComment(string $value): string
    {
        // A # inside a quoted string is part of the value.
        if (preg_match('/^("(?:[^"\\\\]|\\\\.)*"|\'[^\']*\')/', $value, $match)) {
            return $match[1];
        }

        return trim((string) preg_replace('/\s+#.*$/', '', $value));
    }
}
