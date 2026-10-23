<?php

declare(strict_types=1);

namespace PrismDatabase\Support;

/**
 * Splits an SQL dump into statements as it is read. It knows quoted strings and names,
 * comments (keeping MySQL's executable /*! … *\/ ones), and DELIMITER lines, and reports where
 * each statement ends in the stream so an import can stop and carry on later.
 * Mirrors src/client/lib/splitter.ts, which has the tests.
 */
final class SqlSplitter
{
    private string $buffer = '';

    private string $delimiter = ';';

    /** Bytes of the stream already handed out as statements. */
    private int $consumed;

    public function __construct(int $offset = 0, string $delimiter = ';')
    {
        $this->consumed = $offset;
        $this->delimiter = $delimiter;
    }

    public function delimiter(): string
    {
        return $this->delimiter;
    }

    /**
     * @return list<array{sql: string, end: int}> complete statements, each with the stream
     *                                             offset just after it
     */
    public function feed(string $chunk, bool $final = false): array
    {
        $this->buffer .= $chunk;
        $b = $this->buffer;
        $n = strlen($b);
        $statements = [];
        $start = 0;
        $i = 0;
        $quote = null;

        while ($i < $n) {
            $c = $b[$i];

            if ($quote !== null) {
                if ($c === '\\' && $quote !== '`') {
                    $i += 2;

                    continue;
                }

                if ($c === $quote) {
                    if ($i + 1 >= $n && ! $final) {
                        break;
                    }

                    if (($b[$i + 1] ?? '') === $quote) {
                        $i += 2;

                        continue;
                    }

                    $quote = null;
                }

                $i++;

                continue;
            }

            // DELIMITER is a client command: it changes the delimiter and is not sent.
            if (($c === 'D' || $c === 'd') && trim(substr($b, $start, $i - $start)) === '' && strncasecmp(substr($b, $i, 10), 'DELIMITER ', 10) === 0) {
                $end = strpos($b, "\n", $i);
                if ($end === false && ! $final) {
                    break;
                }

                $end = $end === false ? $n : $end;
                $value = trim(substr($b, $i + 10, $end - $i - 10));
                if ($value !== '') {
                    $this->delimiter = $value;
                }

                $i = $start = min($n, $end + 1);

                continue;
            }

            if ($c === '\'' || $c === '"' || $c === '`') {
                $quote = $c;
                $i++;

                continue;
            }

            if ($c === '#' || ($c === '-' && ($b[$i + 1] ?? '') === '-' && ($i + 2 >= $n || ctype_space($b[$i + 2])))) {
                if ($c === '-' && $i + 2 >= $n && ! $final) {
                    break;
                }

                $end = strpos($b, "\n", $i);
                if ($end === false && ! $final) {
                    break;
                }

                $i = $end === false ? $n : $end + 1;

                continue;
            }

            if ($c === '/' && ($b[$i + 1] ?? '') === '*') {
                $end = strpos($b, '*/', $i + 2);
                if ($end === false && ! $final) {
                    break;
                }

                $i = $end === false ? $n : $end + 2;

                continue;
            }

            if ($c === $this->delimiter[0] && substr($b, $i, strlen($this->delimiter)) === $this->delimiter) {
                $this->emit($statements, substr($b, $start, $i - $start), $this->consumed + $i + strlen($this->delimiter));
                $i += strlen($this->delimiter);
                $start = $i;

                continue;
            }

            $i++;
        }

        if ($final) {
            $this->emit($statements, substr($b, $start), $this->consumed + $n);
            $start = $n;
        }

        $this->buffer = substr($b, $start);
        $this->consumed += $start;

        return $statements;
    }

    /** Bytes left over that do not make a statement yet. */
    public function pending(): int
    {
        return strlen($this->buffer);
    }

    /** @param list<array{sql: string, end: int}> $statements */
    private function emit(array &$statements, string $sql, int $end): void
    {
        $sql = trim($sql);
        if (self::isEmpty($sql) || self::isSkipped($sql)) {
            return;
        }

        $statements[] = ['sql' => $sql, 'end' => $end];
    }

    /** Only whitespace and ordinary comments; MySQL's /*! … *\/ comments run and count. */
    public static function isEmpty(string $sql): bool
    {
        $stripped = preg_replace(['#/\*(?!!).*?\*/#s', '/^\s*(--\s|#).*$/m'], '', $sql);

        return trim((string) $stripped) === '';
    }

    /** Statements that would leave or replace the server's own database. */
    public static function isSkipped(string $sql): bool
    {
        return preg_match('/^(USE\s|CREATE\s+(DATABASE|SCHEMA)\s|DROP\s+(DATABASE|SCHEMA)\s)/i', ltrim($sql)) === 1;
    }
}
