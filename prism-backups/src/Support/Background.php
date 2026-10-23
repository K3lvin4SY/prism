<?php

declare(strict_types=1);

namespace PrismBackups\Support;

use RuntimeException;

/**
 * A shell script run apart from the queue worker, so a long download or tar is not cut off by
 * the worker's time limit. The script's exit code is written to a file the job checks on.
 */
final class Background
{
    public static function start(string $script, string $codeFile): int
    {
        @unlink($codeFile);
        $wrapped = sprintf('( %s ); echo $? > %s', $script, escapeshellarg($codeFile));

        $process = proc_open(['setsid', 'sh', '-c', '( '.$wrapped.' ) > /dev/null 2>&1 & echo $!'], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, ['PATH' => getenv('PATH') ?: '/usr/local/bin:/usr/bin:/bin']);
        throw_unless(is_resource($process), RuntimeException::class, 'Could not start a background process on the panel.');
        $pid = (int) mb_trim((string) stream_get_contents($pipes[1]));
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($process);

        throw_if($pid <= 0, RuntimeException::class, 'Could not start a background process on the panel.');

        return $pid;
    }

    /** The exit code once the script has finished, null while it runs. */
    public static function code(string $codeFile): ?int
    {
        clearstatcache(true, $codeFile);
        if (! is_file($codeFile)) {
            return null;
        }

        $code = mb_trim((string) file_get_contents($codeFile));

        return $code === '' ? null : (int) $code;
    }

    public static function running(int $pid): bool
    {
        return $pid > 0 && file_exists('/proc/'.$pid);
    }

    public static function stop(int $pid): void
    {
        if (self::running($pid)) {
            @posix_kill(-$pid, 15);
        }
    }

    /** The last few lines a script wrote to its error file. */
    public static function error(string $file): string
    {
        if (! is_file($file)) {
            return '';
        }

        $lines = array_slice(array_filter(explode("\n", (string) file_get_contents($file, false, null, max(0, (int) filesize($file) - 4000)))), -3);

        return mb_substr(implode(' ', $lines), 0, 500);
    }
}
