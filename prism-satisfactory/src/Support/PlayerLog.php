<?php

declare(strict_types=1);

namespace PrismSatisfactory\Support;

/**
 * Who joined, from the server's log (FactoryGame/Saved/Logs/FactoryGame.log, one per run, in
 * UTC). Unreal names the player when they get in:
 *
 *   [2026.10.28-21.40.02:123][512]LogNet: Join succeeded: Alice
 *
 * A leave names only the connection, so who is still on is worked out with the API's count of
 * connected players (see Players).
 */
final class PlayerLog
{
    private const string JOIN = '/^\[(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):\d+\]\[\s*\d+\]LogNet: Join succeeded: (.+?)\s*$/';

    /**
     * The joins in the lines, oldest first.
     *
     * @param  list<string>  $lines
     * @return list<array{name: string, at: int}>
     */
    public static function joins(array $lines): array
    {
        $joins = [];
        foreach ($lines as $line) {
            if (preg_match(self::JOIN, $line, $match)) {
                $at = gmmktime((int) $match[4], (int) $match[5], (int) $match[6], (int) $match[2], (int) $match[3], (int) $match[1]);
                $joins[] = ['name' => mb_substr($match[7], 0, 64), 'at' => $at !== false ? $at : time()];
            }
        }

        return $joins;
    }

    /**
     * The players most likely on now: the last $count different names to join.
     *
     * @param  list<array{name: string, at: int}>  $joins
     * @return list<string>
     */
    public static function latest(array $joins, int $count): array
    {
        $names = [];
        foreach (array_reverse($joins) as $join) {
            if (count($names) >= $count) {
                break;
            }
            if (! in_array($join['name'], $names, true)) {
                $names[] = $join['name'];
            }
        }

        return $names;
    }
}
