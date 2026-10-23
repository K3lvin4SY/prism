<?php

declare(strict_types=1);

namespace PrismSchedules\Support;

use Illuminate\Support\Facades\Cache;
use Pterodactyl\Contracts\Servers\ReadsServerLogs;
use Pterodactyl\Contracts\Servers\SendsServerCommands;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * Players online on a Minecraft server: the panel sends "list" and reads the answer from the
 * console. Other games have no such command, so they have no count.
 */
final class Players
{
    private const string PATTERN = '/There are (\d+)(?: of a max of |\/)(\d+) players online/i';

    public static function supported(Server $server): bool
    {
        $tags = $server->egg ? array_map('strtolower', $server->egg->tagSlugs()) : [];

        return in_array('minecraft', $tags, true) && ! in_array('bedrock', $tags, true);
    }

    /** @return array{online: int, max: int}|null */
    public static function count(Server $server): ?array
    {
        if (! self::supported($server)) {
            return null;
        }

        return Cache::remember('prism-schedules:players:'.$server->id, 30, static function () use ($server): ?array {
            try {
                app(SendsServerCommands::class)->send($server, 'list');
                usleep(1_500_000);
                $lines = app(ReadsServerLogs::class)->read($server, 40);
            } catch (Throwable) {
                return null;
            }

            foreach (array_reverse($lines) as $line) {
                if (preg_match(self::PATTERN, $line, $match) === 1) {
                    return ['online' => (int) $match[1], 'max' => (int) $match[2]];
                }
            }

            return null;
        });
    }
}
