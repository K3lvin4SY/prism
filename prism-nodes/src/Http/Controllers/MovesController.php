<?php

declare(strict_types=1);

namespace PrismNodes\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use PrismNodes\Models\Move;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;

/** Servers queued to move to another node, on the admin "Node health" page. */
final class MovesController
{
    public function index(): JsonResponse
    {
        $moves = Move::query()->with(['server', 'fromNode', 'toNode', 'requester'])->orderByRaw("field(status, 'moving', 'queued') desc")->orderByDesc('id')->limit(50)->get();

        return response()->json(['data' => $moves->map(static fn (Move $move): array => [
            'id' => $move->id,
            'server' => $move->server?->name,
            'from' => $move->fromNode?->name,
            'to' => $move->toNode?->name,
            'by' => $move->requester?->username,
            'status' => $move->status,
            'error' => $move->error,
            'created_at' => $move->created_at->toIso8601String(),
            'started_at' => $move->started_at?->toIso8601String(),
            'finished_at' => $move->finished_at?->toIso8601String(),
        ])->values()]);
    }

    /** Queues servers to move; the tick starts them one at a time. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'node_id' => ['required', 'integer', Rule::exists(Node::class, 'id')],
            'servers' => ['required', 'array', 'min:1', 'max:200'],
            'servers.*' => ['integer', Rule::exists(Server::class, 'id')],
        ]);
        $waiting = Move::query()->whereIn('status', ['queued', 'moving'])->pluck('server_id')->all();
        $servers = Server::query()->whereIn('id', $data['servers'])->where('node_id', '!=', $data['node_id'])->whereNotIn('id', $waiting)->get();

        foreach ($servers as $server) {
            Move::query()->create([
                'server_id' => $server->id,
                'from_node_id' => $server->node_id,
                'to_node_id' => (int) $data['node_id'],
                'requested_by' => $request->user()?->id,
            ]);
        }

        return response()->json(['data' => ['queued' => $servers->count(), 'skipped' => count($data['servers']) - $servers->count()]], 201);
    }

    /** Only a move that has not started can be called off. */
    public function cancel(int $move): Response
    {
        $model = Move::query()->where('status', 'queued')->findOrFail($move);
        $model->forceFill(['status' => 'cancelled', 'finished_at' => now()])->save();

        return response()->noContent();
    }

    /** Clears finished, failed and cancelled moves from the list. */
    public function clear(): Response
    {
        Move::query()->whereIn('status', ['done', 'failed', 'cancelled'])->delete();

        return response()->noContent();
    }
}
