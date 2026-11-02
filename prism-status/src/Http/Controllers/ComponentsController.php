<?php

declare(strict_types=1);

namespace PrismStatus\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use PrismStatus\Models\Component;
use PrismStatus\Support\Summary;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;

/** The nodes and servers on the status page, on the admin "Status page" page. Only root admins reach it. */
final class ComponentsController
{
    public function index(): JsonResponse
    {
        $components = Component::query()->orderBy('group')->orderBy('sort')->orderBy('id')->get();
        $nodes = Node::query()->whereIn('id', $components->where('type', 'node')->pluck('ref_id'))->pluck('name', 'id');
        $servers = Server::query()->whereIn('id', $components->where('type', 'server')->pluck('ref_id'))->get(['id', 'name', 'uuidShort'])->keyBy('id');

        return response()->json(['data' => $components->map(static fn (Component $component): array => [
            'id' => $component->id,
            'type' => $component->type,
            'ref_id' => $component->ref_id,
            'source' => $component->type === 'node'
                ? ($nodes[$component->ref_id] ?? null)
                : (($server = $servers->get($component->ref_id)) ? $server->name.' ('.$server->uuidShort.')' : null),
            'label' => $component->label,
            'group' => $component->group,
            'state' => Summary::publicState($component->state),
            'checked_at' => $component->checked_at?->toIso8601String(),
        ])->values()]);
    }

    /** Nodes or servers that can be added, matching a search. */
    public function candidates(Request $request): JsonResponse
    {
        $data = $request->validate(['type' => ['required', Rule::in(Component::TYPES)], 'q' => ['nullable', 'string', 'max:64']]);
        $like = '%'.addcslashes(trim((string) ($data['q'] ?? '')), '%_\\').'%';
        $taken = Component::query()->where('type', $data['type'])->pluck('ref_id');

        $found = $data['type'] === 'node'
            ? Node::query()->where('name', 'like', $like)->whereNotIn('id', $taken)->orderBy('name')->limit(20)->get()
                ->map(static fn (Node $node): array => ['id' => $node->id, 'name' => $node->name, 'hint' => ''])
            : Server::query()->where(static fn ($query) => $query->where('name', 'like', $like)->orWhere('uuidShort', 'like', $like))->whereNotIn('id', $taken)->orderBy('name')->limit(20)->get()
                ->map(static fn (Server $server): array => ['id' => $server->id, 'name' => $server->name, 'hint' => $server->uuidShort]);

        return response()->json(['data' => $found->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(Component::TYPES)],
            'ref_id' => ['required', 'integer', 'min:1'],
            'label' => ['required', 'string', 'max:64'],
            'group' => ['nullable', 'string', 'max:64'],
        ]);
        $exists = $data['type'] === 'node' ? Node::query()->whereKey($data['ref_id'])->exists() : Server::query()->whereKey($data['ref_id'])->exists();
        abort_unless($exists, 422, 'That '.$data['type'].' does not exist.');
        abort_if(Component::query()->where('type', $data['type'])->where('ref_id', $data['ref_id'])->exists(), 422, 'That '.$data['type'].' is on the page already.');

        $component = Component::query()->create([
            'type' => $data['type'],
            'ref_id' => $data['ref_id'],
            'label' => trim($data['label']),
            'group' => trim((string) ($data['group'] ?? '')),
            'sort' => (int) Component::query()->max('sort') + 1,
        ]);
        Summary::forget();

        return response()->json(['data' => ['id' => $component->id]], 201);
    }

    public function update(Request $request, int $component): JsonResponse
    {
        $model = Component::query()->findOrFail($component);
        $data = $request->validate(['label' => ['required', 'string', 'max:64'], 'group' => ['nullable', 'string', 'max:64']]);
        $model->forceFill(['label' => trim($data['label']), 'group' => trim((string) ($data['group'] ?? ''))])->save();
        Summary::forget();

        return response()->json(['data' => ['id' => $model->id]]);
    }

    /** The page's order, as a list of ids. */
    public function order(Request $request): Response
    {
        $ids = $request->validate(['ids' => ['required', 'array', 'max:200'], 'ids.*' => ['integer']])['ids'];
        foreach (array_values($ids) as $sort => $id) {
            Component::query()->whereKey($id)->update(['sort' => $sort]);
        }
        Summary::forget();

        return response()->noContent();
    }

    /** Its history goes with it. */
    public function destroy(int $component): Response
    {
        Component::query()->findOrFail($component)->delete();
        Summary::forget();

        return response()->noContent();
    }
}
