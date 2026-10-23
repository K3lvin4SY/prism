<?php

declare(strict_types=1);

namespace PrismDatabase\Support;

use PDO;
use PDOException;
use Pterodactyl\Models\Database;
use RuntimeException;

/**
 * Runs an .sql or .sql.gz file against a database as its own user, for a limited time per
 * call. It returns where it stopped, so the next call carries on from that statement.
 */
final class Importer
{
    private const int CHUNK = 1024 * 1024;

    /**
     * @param  array{offset?: int, delimiter?: string, statements?: int, errors?: int, log?: list<string>}  $state
     * @return array{offset: int, delimiter: string, statements: int, errors: int, log: list<string>, done: bool, total: int}
     */
    public static function run(Database $database, string $file, array $state, bool $stopOnError, int $seconds): array
    {
        $gzip = self::isGzip($file);
        $total = $gzip ? self::gzipSize($file) : (int) filesize($file);
        $handle = $gzip ? gzopen($file, 'rb') : fopen($file, 'rb');
        throw_unless($handle, RuntimeException::class, 'The file could not be opened.');

        $offset = (int) ($state['offset'] ?? 0);
        $statements = (int) ($state['statements'] ?? 0);
        $errors = (int) ($state['errors'] ?? 0);
        $log = $state['log'] ?? [];
        $splitter = new SqlSplitter($offset, (string) ($state['delimiter'] ?? ';'));
        $gzip ? gzseek($handle, $offset) : fseek($handle, $offset);

        $pdo = Connection::open($database, 300);
        // Each call is a new session, so the settings a dump makes at its top are made again.
        foreach (["SET NAMES utf8mb4", 'SET FOREIGN_KEY_CHECKS = 0', 'SET UNIQUE_CHECKS = 0', "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO'", "SET TIME_ZONE = '+00:00'"] as $setting) {
            try {
                $pdo->exec($setting);
            } catch (PDOException) {
                // Not every server allows every setting; the import carries on without it.
            }
        }

        $deadline = microtime(true) + $seconds;
        $done = false;

        try {
            while (microtime(true) < $deadline) {
                $chunk = $gzip ? gzread($handle, self::CHUNK) : fread($handle, self::CHUNK);
                $final = $chunk === '' || $chunk === false || ($gzip ? gzeof($handle) : feof($handle));

                foreach ($splitter->feed((string) $chunk, $final) as $statement) {
                    try {
                        $pdo->exec($statement['sql']);
                        $statements++;
                    } catch (PDOException $exception) {
                        $errors++;
                        $message = self::describe($statement['sql'], $exception);
                        if (count($log) < 20) {
                            $log[] = $message;
                        }

                        if ($stopOnError) {
                            throw new RuntimeException($message, 0, $exception);
                        }
                    }

                    $offset = $statement['end'];
                }

                if ($final) {
                    $done = true;

                    break;
                }
            }
        } finally {
            $gzip ? gzclose($handle) : fclose($handle);
        }

        return ['offset' => $done ? max($offset, $total) : $offset, 'delimiter' => $splitter->delimiter(), 'statements' => $statements, 'errors' => $errors, 'log' => $log, 'done' => $done, 'total' => $total];
    }

    /** Drops every table and view, for "empty the database first" and restores. */
    public static function emptyDatabase(Database $database): void
    {
        $pdo = Connection::open($database, 120);
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        $statement = $pdo->prepare('SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?');
        $statement->execute([$database->database]);
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $pdo->exec(($row['TABLE_TYPE'] === 'VIEW' ? 'DROP VIEW IF EXISTS ' : 'DROP TABLE IF EXISTS ').Connection::quote((string) $row['TABLE_NAME']));
        }
    }

    public static function isGzip(string $file): bool
    {
        $handle = fopen($file, 'rb');
        $magic = $handle ? fread($handle, 2) : '';
        if ($handle) {
            fclose($handle);
        }

        return $magic === "\x1f\x8b";
    }

    /** The uncompressed size a gzip file records in its last four bytes (modulo 4 GB). */
    private static function gzipSize(string $file): int
    {
        $handle = fopen($file, 'rb');
        fseek($handle, -4, SEEK_END);
        $size = unpack('V', (string) fread($handle, 4))[1] ?? 0;
        fclose($handle);

        return (int) $size;
    }

    private static function describe(string $sql, PDOException $exception): string
    {
        $snippet = preg_replace('/\s+/', ' ', mb_substr($sql, 0, 120));
        $error = preg_replace('/^SQLSTATE\[\w+\]: [^:]+: \d+ /', '', $exception->getMessage());

        return sprintf('%s (in: %s%s)', $error, $snippet, mb_strlen($sql) > 120 ? '…' : '');
    }
}
