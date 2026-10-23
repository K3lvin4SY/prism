<?php

declare(strict_types=1);

namespace PrismSchedules\Support;

use Carbon\CarbonInterface;
use Pterodactyl\Models\ActivityLog;
use Pterodactyl\Models\Server;

/**
 * Whether someone asked a server to stop: a stop, kill or restart, or a stop command typed into
 * the console, in its activity log. A server that goes down without one has crashed.
 */
final class Requests
{
    private const array POWER = ['server:power.stop', 'server:power.kill', 'server:power.restart'];

    private const string STOP_COMMAND = '/^\/?(stop|end|exit|quit|shutdown|restart)\b/i';

    public static function stopAskedSince(Server $server, CarbonInterface $since): bool
    {
        $events = ActivityLog::query()
            ->whereHas('subjects', static fn ($query) => $query->where('subject_type', 'server')->where('subject_id', $server->id))
            ->where('timestamp', '>=', $since)
            ->where(static fn ($query) => $query->whereIn('event', self::POWER)->orWhere('event', 'server:console.command'))
            ->latest('id')
            ->limit(200)
            ->get(['id', 'event', 'properties']);

        foreach ($events as $event) {
            if (in_array($event->event, self::POWER, true)) {
                return true;
            }

            if (preg_match(self::STOP_COMMAND, mb_trim((string) ($event->properties['command'] ?? ''))) === 1) {
                return true;
            }
        }

        return false;
    }
}
