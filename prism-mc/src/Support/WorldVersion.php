<?php

declare(strict_types=1);

namespace PrismMc\Support;

use Pterodactyl\Models\Server;
use Throwable;

/**
 * The data version a world was last saved with, from its level.dat. Servers refuse worlds
 * newer than they know, so a version switch has to check it first.
 */
final class WorldVersion
{
    private const int MAX_LEVEL_DAT = 1_000_000;

    /** The level folder: server.properties' level-name, or Pumpkin's default_level_name. */
    public static function levelName(Server $server): string
    {
        try {
            $name = ServerProperties::load($server)->get('level-name');
        } catch (Throwable) {
            $name = null;
        }

        return is_string($name) && $name !== '' ? ServerFiles::normalize($name) : 'world';
    }

    /** null when there is no world yet, or its level.dat cannot be read. */
    public static function dataVersion(Server $server): ?int
    {
        try {
            $bytes = ServerFiles::for($server)->read(self::levelName($server).'/level.dat', self::MAX_LEVEL_DAT);
        } catch (Throwable) {
            return null;
        }

        if ($bytes === null) {
            return null;
        }

        $nbt = str_starts_with($bytes, "\x1f\x8b") ? @gzdecode($bytes) : $bytes;
        if (! is_string($nbt)) {
            return null;
        }

        // TAG_Int named DataVersion: type 3, name length 11, the name, a big-endian int.
        $at = strpos($nbt, "\x03\x00\x0bDataVersion");
        if ($at === false || strlen($nbt) < $at + 18) {
            return null;
        }

        $value = unpack('N', substr($nbt, $at + 14, 4))[1];

        return $value >= 0x80000000 ? $value - 0x100000000 : $value;
    }
}
