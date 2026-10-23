<?php

declare(strict_types=1);

namespace PrismMc\Support;

/**
 * Line-based edits of YAML config files, so comments and everything else stay as they are.
 * Only plain nested maps are supported, which is all the server configs here need.
 */
final class YamlLines
{
    /**
     * Sets a nested key, creating missing parents at the end of the deepest one that exists.
     *
     * @param  list<string>  $path
     */
    public static function set(string $yaml, array $path, string $value): string
    {
        $newline = str_contains($yaml, "\r\n") ? "\r\n" : "\n";
        $lines = $yaml === '' ? [] : preg_split('/\r?\n/', rtrim($yaml, "\r\n"));

        $start = 0;
        $end = count($lines);
        $indent = -1;

        foreach ($path as $depth => $key) {
            $found = null;
            for ($i = $start; $i < $end; $i++) {
                $line = $lines[$i];
                if (trim($line) === '' || ltrim($line)[0] === '#') {
                    continue;
                }

                $lineIndent = strlen($line) - strlen(ltrim($line));
                if ($lineIndent <= $indent) {
                    $end = $i;
                    break;
                }

                if (preg_match('/^(\s*)[\'"]?'.preg_quote($key, '/').'[\'"]?:(\s|$)/', $line, $match) && strlen($match[1]) === self::childIndent($lines, $start, $end, $indent)) {
                    $found = $i;
                    $indent = strlen($match[1]);
                    break;
                }
            }

            if ($found === null) {
                // Add the rest of the path under the deepest existing parent.
                $insert = [];
                $base = $indent < 0 ? 0 : self::childIndent($lines, $start, $end, $indent);
                $base = $indent >= 0 && $base <= $indent ? $indent + 2 : $base;
                $remaining = array_slice($path, $depth);
                foreach ($remaining as $offset => $part) {
                    $prefix = str_repeat(' ', $base + $offset * 2);
                    $insert[] = $offset === count($remaining) - 1 ? "$prefix$part: $value" : "$prefix$part:";
                }

                array_splice($lines, $end, 0, $insert);

                return implode($newline, $lines).$newline;
            }

            if ($depth === count($path) - 1) {
                $lines[$found] = (string) preg_replace('/^(\s*[\'"]?'.preg_quote($key, '/').'[\'"]?:)(?:[ \t]+[^#\r\n]*?)?([ \t]+#.*)?$/', '$1 '.$value.'$2', $lines[$found]);

                return implode($newline, $lines).$newline;
            }

            $start = $found + 1;
            // The block ends at the next line indented no deeper than this key.
            $end = count($lines);
            for ($i = $start; $i < count($lines); $i++) {
                $line = $lines[$i];
                if (trim($line) === '' || ltrim($line)[0] === '#') {
                    continue;
                }

                if (strlen($line) - strlen(ltrim($line)) <= $indent) {
                    $end = $i;
                    break;
                }
            }
        }

        return implode($newline, $lines).$newline;
    }

    /** Reads a nested scalar, unquoted. */
    public static function get(string $yaml, array $path): ?string
    {
        $pattern = '';
        $indent = -1;
        $lines = preg_split('/\r?\n/', $yaml);
        $index = 0;

        foreach ($path as $depth => $key) {
            $found = false;
            for (; $index < count($lines); $index++) {
                $line = $lines[$index];
                if (trim($line) === '' || ltrim($line)[0] === '#') {
                    continue;
                }

                $lineIndent = strlen($line) - strlen(ltrim($line));
                if ($depth > 0 && $lineIndent <= $indent) {
                    return null;
                }

                if (preg_match('/^(\s*)[\'"]?'.preg_quote($key, '/').'[\'"]?:\s*(.*?)\s*(#.*)?$/', $line, $match) && ($depth === 0 ? strlen($match[1]) === 0 : strlen($match[1]) > $indent)) {
                    $indent = strlen($match[1]);
                    $pattern = $match[2];
                    $found = true;
                    $index++;
                    break;
                }
            }

            if (! $found) {
                return null;
            }
        }

        return trim($pattern, '\'"');
    }

    /** The indentation of the first child line in a block. */
    private static function childIndent(array $lines, int $start, int $end, int $parent): int
    {
        for ($i = $start; $i < $end; $i++) {
            $line = $lines[$i];
            if (trim($line) === '' || ltrim($line)[0] === '#') {
                continue;
            }

            $indent = strlen($line) - strlen(ltrim($line));
            if ($indent > $parent) {
                return $indent;
            }

            break;
        }

        return $parent < 0 ? 0 : $parent + 2;
    }

    public static function quote(string $value): string
    {
        return "'".str_replace("'", "''", $value)."'";
    }
}
