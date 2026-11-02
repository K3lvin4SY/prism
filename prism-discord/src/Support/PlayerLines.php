<?php

declare(strict_types=1);

namespace PrismDiscord\Support;

/**
 * Players joining and leaving, read from console lines: Minecraft Java and Bedrock, Factorio and
 * Terraria print them. Chat cannot pass for one: a name never holds <, >, : or brackets, and the
 * Minecraft patterns need the name right after the log prefix.
 */
final class PlayerLines
{
    /** Pattern => event, tried in order. */
    private const array PATTERNS = [
        '/\[JOIN\]\s+([^\s<>:\[\]]{1,48}) joined the game/' => 'player.join',
        '/\[LEAVE\]\s+([^\s<>:\[\]]{1,48}) left the game/' => 'player.leave',
        '/\]:\s(\.?[A-Za-z0-9_]{1,16}) joined the game$/' => 'player.join',
        '/\]:\s(\.?[A-Za-z0-9_]{1,16}) left the game$/' => 'player.leave',
        '/Player connected: ([^,<>:\[\]]{1,32}), xuid/' => 'player.join',
        '/Player disconnected: ([^,<>:\[\]]{1,32}), xuid/' => 'player.leave',
        '/^(?:\[[^\]]*\]\s*)*([^<>:\[\]]{1,32}?) has joined\.$/' => 'player.join',
        '/^(?:\[[^\]]*\]\s*)*([^<>:\[\]]{1,32}?) has left\.$/' => 'player.leave',
    ];

    /** @return array{event: string, player: string}|null */
    public static function parse(string $line): ?array
    {
        $line = trim(preg_replace('/\e\[[0-9;?]*[A-Za-z]/', '', $line) ?? $line);
        foreach (self::PATTERNS as $pattern => $event) {
            if (preg_match($pattern, $line, $match) === 1) {
                return ['event' => $event, 'player' => trim($match[1])];
            }
        }

        return null;
    }

    /**
     * The lines that were not in the console the last time it was read. The console holds its
     * latest lines, so the new ones are those after the longest end of the old read that the
     * new one starts with; when nothing overlaps, every line is new.
     *
     * @param  list<string>  $before
     * @param  list<string>  $now
     * @return list<string>
     */
    public static function fresh(array $before, array $now): array
    {
        $max = min(count($before), count($now));
        for ($overlap = $max; $overlap > 0; $overlap--) {
            if (array_slice($before, -$overlap) === array_slice($now, 0, $overlap)) {
                return array_slice($now, $overlap);
            }
        }

        return $now;
    }
}
