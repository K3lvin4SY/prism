<?php

declare(strict_types=1);

namespace PrismFactorio\Support;

/**
 * Who is on the server, from its console output. Factorio prints a line for each join, leave,
 * chat message, kick and ban, after a date and time:
 *
 *   2026-10-28 22:05:00 [JOIN] Alice joined the game
 *   2026-10-28 22:09:12 [CHAT] Alice: hello
 *   2026-10-28 22:15:40 [LEAVE] Alice left the game
 *   2026-10-28 22:16:02 [KICK] Bob was kicked by <server>. Reason: afk.
 *   2026-10-28 22:16:30 [BAN] Bob (not on map) was banned by <server>. Reason: griefing.
 */
final class PlayerLog
{
    private const string LINE = '/^(?:(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+)?\[(JOIN|LEAVE|CHAT|KICK|BAN)\]\s+(.*)$/';

    /**
     * Each player seen in the lines, in order, with whether they are still connected, and the
     * chat. Times are unix seconds, or null when a line has none.
     *
     * @param  list<string>  $lines
     * @return array{players: array<string, array{name: string, online: bool, joins: int, joined: int|null, left: int|null}>, chat: list<array{name: string, text: string, at: int|null}>}
     */
    public static function parse(array $lines): array
    {
        $players = [];
        $chat = [];
        foreach ($lines as $line) {
            if (! preg_match(self::LINE, trim($line), $match)) {
                continue;
            }

            $at = $match[1] !== '' ? (strtotime($match[1]) ?: null) : null;
            $rest = $match[3];
            switch ($match[2]) {
                case 'JOIN':
                    if (preg_match('/^(\S+) joined the game$/', $rest, $name)) {
                        $players[$name[1]] ??= ['name' => $name[1], 'online' => false, 'joins' => 0, 'joined' => null, 'left' => null];
                        $players[$name[1]]['online'] = true;
                        $players[$name[1]]['joins']++;
                        $players[$name[1]]['joined'] = $at;
                    }
                    break;
                case 'LEAVE':
                    if (preg_match('/^(\S+) left the game/', $rest, $name) && isset($players[$name[1]])) {
                        $players[$name[1]]['online'] = false;
                        $players[$name[1]]['left'] = $at;
                    }
                    break;
                case 'KICK':
                case 'BAN':
                    // A kick or ban is followed by a leave line too, but not always right away.
                    if (preg_match('/^(\S+) (?:\(not on map\) )?was (?:kicked|banned)/', $rest, $name) && isset($players[$name[1]])) {
                        $players[$name[1]]['online'] = false;
                        $players[$name[1]]['left'] = $at;
                    }
                    break;
                case 'CHAT':
                    if (preg_match('/^(\S+?)(?: \[[^\]]*\])?: (.*)$/', $rest, $said)) {
                        $chat[] = ['name' => $said[1], 'text' => $said[2], 'at' => $at];
                    }
                    break;
            }
        }

        return ['players' => $players, 'chat' => $chat];
    }

    /** Factorio usernames: letters, digits, dashes, underscores and dots. */
    public static function validName(string $name): bool
    {
        return (bool) preg_match('/^[A-Za-z0-9_.-]{1,60}$/', $name);
    }
}
