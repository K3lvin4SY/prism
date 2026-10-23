<?php

declare(strict_types=1);

namespace PrismTerraria\Support;

use Pterodactyl\Models\Server;
use Throwable;

/**
 * Where a server's world is and which version saved it. The eggs load one world each:
 * saves/Worlds/<WORLD_NAME>.wld for the vanilla server and tModLoader, <WORLD_NAME>.wld in
 * the server folder for TShock.
 */
final class Worlds
{
    /** World files read whole to get at their header; bigger ones are left unread. */
    private const int MAX_READ = 32 * 1024 * 1024;

    public static function name(Server $server): string
    {
        $name = Detector::for($server)->variable('WORLD_NAME') ?? 'world';

        return preg_match('/^[^\/\\\\\0]{1,100}$/', $name) && ! str_contains($name, '..') ? $name : 'world';
    }

    /** The folder the world file is in. */
    public static function folder(string $kind): string
    {
        return $kind === 'tshock' ? '' : 'saves/Worlds';
    }

    /** The world file, relative to the server folder. */
    public static function path(Server $server, string $kind): string
    {
        $folder = self::folder($kind);

        return ($folder === '' ? '' : $folder.'/').self::name($server).'.wld';
    }

    /**
     * The files that belong to the world: the world, its backup, and tModLoader's mod data.
     *
     * @return list<string> names inside the world folder
     */
    public static function files(Server $server, string $kind): array
    {
        $name = self::name($server);
        $existing = ServerFiles::for($server)->list(self::folder($kind));

        return array_values(array_filter(
            [$name.'.wld', $name.'.wld.bak', $name.'.twld', $name.'.twld.bak'],
            static fn (string $file): bool => isset($existing[$file]),
        ));
    }

    /** The file version the world was saved with (279 is 1.4.4.9), or null with no world. */
    public static function version(Server $server, string $kind): ?int
    {
        try {
            $files = ServerFiles::for($server);
            $path = self::path($server, $kind);
            $size = $files->size($path);
            if ($size === null || $size > self::MAX_READ) {
                return null;
            }

            $bytes = $files->read($path, self::MAX_READ);
        } catch (Throwable) {
            return null;
        }

        return $bytes !== null && strlen($bytes) >= 4 ? unpack('V', substr($bytes, 0, 4))[1] : null;
    }
}
