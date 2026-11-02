<?php

declare(strict_types=1);

namespace PrismNodes\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PrismNodes\Models\Sample;
use PrismNodes\Support\Health;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;

/** The admin "Node health" page. Only root admins reach it. */
final class NodesController
{
    public function index(): JsonResponse
    {
        $latest = Health::latestWings();
        $nodes = Node::query()->with('location')->withCount('servers')->orderBy('name')->get();
        $since = now()->subHours(Health::GRAPH_HOURS);
        $samples = Sample::query()->where('taken_at', '>=', $since)->orderBy('taken_at')->get()->groupBy('node_id');
        $free = Allocation::query()->whereNull('server_id')->selectRaw('node_id, count(*) as free')->groupBy('node_id')->pluck('free', 'node_id');

        return response()->json([
            'data' => $nodes->map(static function (Node $node) use ($latest, $samples, $free): array {
                $system = Health::system($node);
                $history = $samples->get($node->id) ?? collect();
                $last = $history->last();

                return [
                    'id' => $node->id,
                    'name' => $node->name,
                    'fqdn' => $node->fqdn,
                    'location' => $node->location?->short,
                    'maintenance' => (bool) $node->maintenance_mode,
                    'servers' => (int) $node->servers_count,
                    'free_allocations' => (int) ($free[$node->id] ?? 0),
                    'system' => $system,
                    'update' => Health::behind($system['version'], $latest) ? $latest : null,
                    'allocated' => [
                        'memory' => ['used' => $node->allocatedResources()['memory'], 'limit' => (int) $node->memory, 'overallocate' => (int) $node->memory_overallocate],
                        'disk' => ['used' => $node->allocatedResources()['disk'], 'limit' => (int) $node->disk, 'overallocate' => (int) $node->disk_overallocate],
                    ],
                    'usage' => $last === null ? null : [
                        'taken_at' => $last->taken_at->toIso8601String(),
                        'cpu' => $last->cpu,
                        'memory_bytes' => $last->memory_bytes,
                        'disk_bytes' => $last->disk_bytes,
                        'running' => $last->running,
                    ],
                    'history' => $history->map(static fn (Sample $sample): array => [
                        't' => $sample->taken_at->getTimestamp(),
                        'cpu' => $sample->cpu,
                        'memory' => $sample->memory_bytes,
                    ])->values(),
                ];
            })->values(),
            'meta' => ['latest_wings' => $latest],
        ]);
    }

    /**
     * Maintenance mode is the panel's own switch: people cannot use the node's servers while it is
     * on. Nothing changes on the node itself, so this saves the flag without asking Wings.
     */
    public function maintenance(Request $request, int $node): JsonResponse
    {
        $model = Node::query()->findOrFail($node);
        $on = $request->validate(['on' => ['required', 'boolean']])['on'];
        $model->forceFill(['maintenance_mode' => $on])->save();

        Activity::event('admin:node.update')->subject($model)->property(['name' => $model->name, 'maintenance_mode' => $on, 'via' => 'Prism Nodes'])->log();

        return response()->json(['data' => ['maintenance' => (bool) $model->maintenance_mode]]);
    }

    /** The node's servers, for picking which to move. */
    public function servers(int $node): JsonResponse
    {
        $model = Node::query()->findOrFail($node);
        $servers = Server::query()->with(['user', 'allocations'])->where('node_id', $model->id)->orderBy('name')->get();

        return response()->json(['data' => $servers->map(static fn (Server $server): array => [
            'id' => $server->id,
            'name' => $server->name,
            'short' => $server->uuidShort,
            'owner' => $server->user?->username,
            'memory' => (int) $server->memory,
            'disk' => (int) $server->disk,
            'ports' => $server->allocations->count(),
            'status' => $server->status,
        ])->values()]);
    }
}
