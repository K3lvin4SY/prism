<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Support;

/**
 * Who is on the server, from its log. Characters live on the players' own computers, so the
 * log is all the server says: "[userid:N] player <name> connected islocalplayer=False" when
 * someone joins, and "Disconnected from userid:N with reason <why>" when they leave. Their
 * SteamID comes just before a join: "Successful authentication from userid: <steamid64>".
 */
final class PlayerLog
{
    private const string JOIN = '/^\[userid:(\d+)\]\s+player\s+(.+?)\s+(connected|disconnected)\b/i';

    private const string LEFT = '/^Disconnected from userid:\s*(\d+)\b/i';

    private const string STEAM = '/^Successful authentication from userid:\s*(\d{17})\b/i';

    /**
     * Each player seen in the lines, in order, with whether they are still connected.
     *
     * @param  list<string>  $lines
     * @return array<string, array{id: string, name: string, online: bool, joins: int, steamId: string|null}> keyed by connection id
     */
    public static function parse(array $lines): array
    {
        $players = [];
        $steamId = null;
        foreach ($lines as $line) {
            $line = trim($line);
            if (preg_match(self::STEAM, $line, $match)) {
                $steamId = $match[1];

                continue;
            }

            if (preg_match(self::LEFT, $line, $match)) {
                if (isset($players[$match[1]])) {
                    $players[$match[1]]['online'] = false;
                }

                continue;
            }

            if (! preg_match(self::JOIN, $line, $match)) {
                continue;
            }

            $id = $match[1];
            $joined = strtolower($match[3]) === 'connected';
            $players[$id] ??= ['id' => $id, 'name' => $match[2], 'online' => false, 'joins' => 0, 'steamId' => null];
            $players[$id]['name'] = $match[2];
            $players[$id]['online'] = $joined;
            if ($joined) {
                $players[$id]['joins']++;
                $players[$id]['steamId'] ??= $steamId;
                $steamId = null;
            }
        }

        return $players;
    }
}
