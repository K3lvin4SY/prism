<?php

declare(strict_types=1);

namespace PrismDatabase\Support;

use Illuminate\Support\Facades\Crypt;
use PDO;
use PDOException;
use Pterodactyl\Models\Database;
use RuntimeException;

/**
 * A connection to one server database, made with that database's own user and password.
 * The host's administrator login is never used, so a query can only do what the server's
 * database user could do from anywhere else.
 */
final class Connection
{
    /** @return array{host: string, port: int, username: string, password: string, database: string} */
    public static function credentials(Database $database): array
    {
        $host = $database->host;
        throw_unless($host, RuntimeException::class, 'The database host of this database no longer exists.');

        return [
            'host' => (string) $host->host,
            'port' => (int) $host->port,
            'username' => (string) $database->username,
            'password' => (string) Crypt::decrypt($database->password),
            'database' => (string) $database->database,
        ];
    }

    public static function open(Database $database, int $timeout = 15, bool $readOnly = false): PDO
    {
        $credentials = self::credentials($database);

        try {
            $pdo = new PDO(
                sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $credentials['host'], $credentials['port'], $credentials['database']),
                $credentials['username'],
                $credentials['password'],
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_TIMEOUT => 5,
                    PDO::ATTR_EMULATE_PREPARES => true,
                    PDO::ATTR_STRINGIFY_FETCHES => false,
                    PDO::MYSQL_ATTR_MULTI_STATEMENTS => false,
                    PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => true,
                ],
            );
        } catch (PDOException $exception) {
            $message = $exception->getMessage();
            throw new RuntimeException(match (true) {
                str_contains($message, 'Access denied') => 'The database refused its own user from the panel. If "Connections from" is limited to the server\'s address, the panel cannot reach it.',
                str_contains($message, 'Unknown database') => 'The database does not exist on its host any more.',
                default => 'Could not connect to the database host: '.preg_replace('/SQLSTATE\[\w+\] \[\d+\] /', '', $message),
            }, 0, $exception);
        }

        // A time limit for each statement: MySQL counts milliseconds, MariaDB seconds.
        foreach (['SET SESSION max_execution_time = '.($timeout * 1000), 'SET SESSION max_statement_time = '.$timeout] as $statement) {
            try {
                $pdo->exec($statement);
            } catch (PDOException) {
                // Each server knows only one of the two.
            }
        }

        if ($readOnly) {
            $pdo->exec('SET SESSION TRANSACTION READ ONLY');
        }

        return $pdo;
    }

    /** Quotes a table or column name for MySQL. */
    public static function quote(string $identifier): string
    {
        return '`'.str_replace('`', '``', $identifier).'`';
    }
}
