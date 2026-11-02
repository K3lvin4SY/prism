<?php

declare(strict_types=1);

namespace PrismStatus\Support;

use Illuminate\Support\Facades\DB;
use PrismStatus\Models\Component;
use PrismStatus\Models\Day;
use Pterodactyl\Contracts\Servers\ReadsServerState;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Throwable;

/** Once a minute: is each component up, and the day's tally. */
final class Checks
{
    /** States that count as up in the history. */
    public const array UP = ['up', 'starting'];

    /** States that are not counted at all: nothing was checked, or the downtime was planned. */
    public const array UNCOUNTED = ['unknown', 'maintenance'];

    public static function run(): void
    {
        $components = Component::query()->get();
        if ($components->isEmpty()) {
            return;
        }

        $nodes = Node::query()->whereIn('id', $components->where('type', 'node')->pluck('ref_id'))->get()->keyBy('id');
        $servers = Server::query()->with('node')->whereIn('id', $components->where('type', 'server')->pluck('ref_id'))->get()->keyBy('id');
        $day = now()->toDateString();

        foreach ($components as $component) {
            $state = match ($component->type) {
                'node' => self::node($nodes->get($component->ref_id)),
                'server' => self::server($servers->get($component->ref_id)),
                default => 'unknown',
            };

            $component->forceFill([
                'state' => $state,
                'checked_at' => now(),
                'changed_at' => $state !== $component->state || $component->changed_at === null ? now() : $component->changed_at,
            ])->save();

            if (! in_array($state, self::UNCOUNTED, true)) {
                $up = in_array($state, self::UP, true);
                DB::table('prism_status_days')->upsert(
                    [['component_id' => $component->id, 'day' => $day, 'checks' => 1, 'up' => $up ? 1 : 0]],
                    ['component_id', 'day'],
                    ['checks' => DB::raw('checks + 1'), 'up' => DB::raw($up ? 'up + 1' : 'up')],
                );
            }
        }

        Day::query()->where('day', '<', now()->subDays(100)->toDateString())->delete();
    }

    /** Up when Wings answers. A node in maintenance mode is planned downtime. */
    private static function node(?Node $node): string
    {
        if ($node === null) {
            return 'unknown';
        }
        if ($node->maintenance_mode) {
            return 'maintenance';
        }

        try {
            Daemon::node($node)->systemInformation();

            return 'up';
        } catch (Throwable) {
            return 'down';
        }
    }

    /** Up while running; starting counts as up. Its node in maintenance mode is planned downtime. */
    private static function server(?Server $server): string
    {
        if ($server === null) {
            return 'unknown';
        }
        if ($server->node?->maintenance_mode) {
            return 'maintenance';
        }

        try {
            $state = app(ReadsServerState::class)->read($server);
        } catch (Throwable) {
            return 'down';
        }

        return match (true) {
            $state->isSuspended => 'down',
            $state->state === 'running' => 'up',
            $state->state === 'starting' => 'starting',
            default => 'down',
        };
    }
}
