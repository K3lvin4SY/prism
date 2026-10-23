<?php

declare(strict_types=1);

namespace PrismDatabase\Support;

use Pterodactyl\Models\Database;
use RuntimeException;

/**
 * Dumps a database with mysqldump as its own user, gzipped, in a process that runs on its own,
 * so the queue only checks on it and no job outlives the queue's time limit.
 */
final class Dumper
{
    /** @return array{pid: int, code: string, error: string} where the process writes its exit code and errors */
    public static function start(Database $database, string $target): array
    {
        $binary = trim((string) shell_exec('command -v mysqldump mariadb-dump 2>/dev/null | head -n 1'));
        throw_if($binary === '', RuntimeException::class, 'mysqldump is not installed on the panel.');

        $credentials = Connection::credentials($database);
        $code = $target.'.code';
        $error = $target.'.err';
        @unlink($code);

        $arguments = implode(' ', array_map('escapeshellarg', [
            '--host='.$credentials['host'],
            '--port='.$credentials['port'],
            '--user='.$credentials['username'],
            '--single-transaction',
            '--quick',
            '--routines',
            '--triggers',
            '--no-tablespaces',
            '--skip-lock-tables',
            '--default-character-set=utf8mb4',
            '--hex-blob',
            $credentials['database'],
        ]));

        // pipefail keeps mysqldump's own exit code when gzip succeeds.
        $script = sprintf(
            'set -o pipefail; %s %s 2> %s | gzip -c > %s; echo $? > %s',
            escapeshellarg($binary),
            $arguments,
            escapeshellarg($error),
            escapeshellarg($target),
            escapeshellarg($code),
        );

        // The password goes in the environment, so it does not show in the process list.
        $process = proc_open(['setsid', 'sh', '-c', '( '.$script.' ) > /dev/null 2>&1 & echo $!'], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, ['MYSQL_PWD' => $credentials['password'], 'PATH' => getenv('PATH') ?: '/usr/local/bin:/usr/bin:/bin']);
        throw_unless(is_resource($process), RuntimeException::class, 'Could not start mysqldump.');
        $pid = (int) trim((string) stream_get_contents($pipes[1]));
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($process);

        return ['pid' => $pid, 'code' => $code, 'error' => $error];
    }

    /**
     * Whether the dump has finished: null while it runs, else the exit code and any errors.
     *
     * @return array{code: int, error: string}|null
     */
    public static function poll(string $target): ?array
    {
        $code = $target.'.code';
        if (! is_file($code)) {
            return null;
        }

        $result = ['code' => (int) trim((string) file_get_contents($code)), 'error' => trim((string) @file_get_contents($target.'.err'))];
        @unlink($code);
        @unlink($target.'.err');

        return $result;
    }

    public static function running(int $pid): bool
    {
        return $pid > 0 && file_exists('/proc/'.$pid);
    }
}
