<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Support;

/**
 * Who is on the server, from its log. Characters live on the players' own computers, so the
 * log is all the server says: "[userid:N] player <name> connected" and "... disconnected",
 * which the egg's startup also passes to the console.
 */
final class PlayerLog
{
    private const string PATTERN = '/^\[userid:(\d+)\]\s+player\s+(.+?)\s+(connected|disconnected|joined|left|has joined|has left)\b/i';

    /**
     * Each player seen in the lines, in order, with whether their last line was a join.
     *
     * @param  list<string>  $lines
     * @return array<string, array{id: string, name: string, online: bool, joins: int}> keyed by user id
     */
    public static function parse(array $lines): array
    {
        $players = [];
        foreach ($lines as $line) {
            if (! preg_match(self::PATTERN, trim($line), $match)) {
                continue;
            }

            $id = $match[1];
            $joined = in_array(strtolower($match[3]), ['connected', 'joined', 'has joined'], true);
            $players[$id] ??= ['id' => $id, 'name' => $match[2], 'online' => false, 'joins' => 0];
            $players[$id]['name'] = $match[2];
            $players[$id]['online'] = $joined;
            if ($joined) {
                $players[$id]['joins']++;
            }
        }

        return $players;
    }
}
