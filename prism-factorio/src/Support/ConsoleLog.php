<?php

declare(strict_types=1);

namespace PrismFactorio\Support;

use Pterodactyl\Contracts\Servers\UpdatesServerStartup;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/**
 * Factorio's console log: with --console-log, the game writes every join, leave, chat line,
 * kick and ban to a file of its own, with the time. Wings keeps only the last 100 lines of
 * output, so without it a join on a busy server soon scrolls out of reach.
 *
 * The option goes at the end of the server's own startup command (never the egg's), after
 * --start-server; it applies from the next start.
 */
final class ConsoleLog
{
    public const string FILE = 'factorio-console.log';

    private const string OPTION = '--console-log '.self::FILE;

    public static function installed(Server $server): bool
    {
        return str_contains((string) $server->startup, '--console-log');
    }

    public static function install(Server $server): void
    {
        if (self::installed($server)) {
            return;
        }

        app(UpdatesServerStartup::class)->update($server, [
            'startup' => rtrim((string) $server->startup).' '.self::OPTION,
            'skip_scripts' => (bool) $server->skip_scripts,
        ], User::USER_LEVEL_ADMIN);
    }

    /** Larger logs are moved aside while the server is stopped, as Wings sends files whole. */
    private const int LIMIT = 8_000_000;

    /**
     * The console log's lines, or null when the server does not write one yet or it is too big
     * to read (until the server stops and it is moved aside).
     *
     * @return list<string>|null
     */
    public static function lines(Server $server, bool $running): ?array
    {
        if (! self::installed($server)) {
            return null;
        }

        $files = ServerFiles::for($server);
        $size = $files->size(self::FILE);
        if ($size === null) {
            return [];
        }
        if ($size > self::LIMIT) {
            if (! $running) {
                $files->rename('', self::FILE, 'factorio-console.old.log');

                return [];
            }

            return null;
        }

        return preg_split('/\r?\n/', (string) $files->read(self::FILE, self::LIMIT)) ?: [];
    }
}
