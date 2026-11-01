<?php

declare(strict_types=1);

namespace PrismNotes\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PrismNotes\Models\Note;
use PrismNotes\Support\Settings;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/**
 * A server's notes, on its "Notes" page. Reading a note and ticking its checklist needs
 * ext.prism-notes.read; writing, pinning, reordering and deleting need ext.prism-notes.manage.
 */
final class NotesController
{
    /** Items one checklist may have. */
    private const int MAX_ITEMS = 100;

    public function index(Request $request, Server $server): JsonResponse
    {
        $user = $this->authorize($request, $server, 'read');
        $notes = Note::query()->with(['user', 'editor'])->where('server_id', $server->id)
            ->orderByDesc('pinned')->orderBy('position')->orderByDesc('id')->get();

        return response()->json(['data' => [
            'notes' => $notes->map(fn (Note $note): array => $this->present($note))->values(),
            'can_manage' => $user->can('ext.prism-notes.manage', $server),
            'max_notes' => $this->maxNotes(),
        ]]);
    }

    public function store(Request $request, Server $server): JsonResponse
    {
        $user = $this->authorize($request, $server, 'manage');
        abort_if(Note::query()->where('server_id', $server->id)->count() >= $this->maxNotes(), 422, 'This server has '.$this->maxNotes().' notes, the most it may have. Delete one first.');

        $fields = $this->validated($request, null);
        $position = (int) Note::query()->where('server_id', $server->id)->max('position') + 1;
        $note = Note::query()->create([...$fields, 'server_id' => $server->id, 'user_id' => $user->id, 'updated_by' => $user->id, 'position' => $position]);
        $this->log('create', $server, $note);

        return response()->json(['data' => $this->present($note->load(['user', 'editor']))], 201);
    }

    public function update(Request $request, Server $server, int $note): JsonResponse
    {
        $user = $this->authorize($request, $server, 'manage');
        $model = $this->find($server, $note);
        $model->forceFill([...$this->validated($request, $model), 'updated_by' => $user->id])->save();
        $this->log('update', $server, $model);

        return response()->json(['data' => $this->present($model->load(['user', 'editor']))]);
    }

    /** Ticks or unticks one checklist item. Locked, so two people ticking at once both count. */
    public function tick(Request $request, Server $server, int $note, string $item): JsonResponse
    {
        $user = $this->authorize($request, $server, 'read');
        $done = (bool) $request->validate(['done' => ['required', 'boolean']])['done'];

        $model = DB::transaction(function () use ($server, $note, $item, $done, $user): Note {
            $model = Note::query()->where('server_id', $server->id)->lockForUpdate()->findOrFail($note);
            $items = $model->items;
            $index = array_search($item, array_column($items, 'id'), true);
            abort_if($index === false, 404, 'That item is no longer on the checklist.');
            if ($items[$index]['done'] !== $done) {
                $items[$index] = [...$items[$index], 'done' => $done, 'done_by' => $done ? $user->username : null, 'done_at' => $done ? now()->toIso8601String() : null];
                $model->forceFill(['items' => $items])->save();
            }

            return $model;
        });

        return response()->json(['data' => $this->present($model->load(['user', 'editor']))]);
    }

    /** The order of the server's notes, as dragged on the Notes page. Pinned notes still come first. */
    public function order(Request $request, Server $server): Response
    {
        $this->authorize($request, $server, 'manage');
        $ids = $request->validate(['ids' => ['required', 'array', 'max:200'], 'ids.*' => ['integer']])['ids'];

        DB::transaction(function () use ($server, $ids): void {
            foreach (array_values(array_unique($ids)) as $position => $id) {
                Note::query()->where('server_id', $server->id)->whereKey($id)->update(['position' => $position]);
            }
        });

        return response()->noContent();
    }

    public function destroy(Request $request, Server $server, int $note): Response
    {
        $this->authorize($request, $server, 'manage');
        $model = $this->find($server, $note);
        $model->delete();
        $this->log('delete', $server, $model);

        return response()->noContent();
    }

    /** Managing implies reading: someone who may write notes may see them. */
    private function authorize(Request $request, Server $server, string $ability): User
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless(Settings::bool('enabled'), 404, 'Notes are turned off on this panel.');
        $allowed = $ability === 'read'
            ? $user->can('ext.prism-notes.read', $server) || $user->can('ext.prism-notes.manage', $server)
            : $user->can('ext.prism-notes.manage', $server);
        abort_unless($allowed, 403, $ability === 'read' ? 'You do not have permission to see this server\'s notes.' : 'You do not have permission to change this server\'s notes.');

        return $user;
    }

    private function find(Server $server, int $id): Note
    {
        return Note::query()->where('server_id', $server->id)->findOrFail($id);
    }

    /**
     * The note's fields from the request. Checklist items keep their id, and who ticked them,
     * when they come back with it; new ones get an id here.
     *
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Note $note): array
    {
        $required = $note ? 'sometimes' : 'required';
        $data = $request->validate([
            'kind' => [$required, 'string', 'in:'.implode(',', Note::KINDS)],
            'title' => [$required, 'string', 'between:1,120'],
            'body' => ['sometimes', 'nullable', 'string', 'max:20000'],
            'items' => ['sometimes', 'array', 'max:'.self::MAX_ITEMS],
            'items.*.id' => ['sometimes', 'nullable', 'string', 'regex:/^[A-Za-z0-9]{1,16}$/'],
            'items.*.text' => ['required', 'string', 'between:1,300'],
            'items.*.done' => ['sometimes', 'boolean'],
            'pinned' => ['sometimes', 'boolean'],
            'color' => ['sometimes', 'nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);

        $fields = [];
        foreach (['kind', 'pinned'] as $key) {
            if (array_key_exists($key, $data)) {
                $fields[$key] = $data[$key];
            }
        }
        if (isset($data['title'])) {
            $fields['title'] = trim($data['title']);
        }
        if (array_key_exists('body', $data) || $note === null) {
            $fields['body'] = (string) ($data['body'] ?? '');
        }
        if (array_key_exists('color', $data)) {
            $fields['color'] = $data['color'] === null ? null : strtolower($data['color']);
        }
        if (array_key_exists('items', $data) || $note === null) {
            $fields['items'] = $this->items($data['items'] ?? [], $note?->items ?? [], $request->user());
        }

        return $fields;
    }

    /**
     * @param  list<array{id?: string|null, text: string, done?: bool}>  $incoming
     * @param  list<array{id: string, text: string, done: bool, done_by: string|null, done_at: string|null}>  $existing
     * @return list<array{id: string, text: string, done: bool, done_by: string|null, done_at: string|null}>
     */
    private function items(array $incoming, array $existing, User $user): array
    {
        $before = array_column($existing, null, 'id');
        $items = [];
        $seen = [];
        foreach ($incoming as $item) {
            $id = $item['id'] ?? null;
            if ($id === null || isset($seen[$id])) {
                $id = Str::random(8);
            }
            $seen[$id] = true;
            $done = (bool) ($item['done'] ?? false);
            $old = $before[$id] ?? null;
            $same = $old !== null && $old['done'] === $done;
            $items[] = [
                'id' => $id,
                'text' => trim($item['text']),
                'done' => $done,
                'done_by' => $same ? $old['done_by'] : ($done ? $user->username : null),
                'done_at' => $same ? $old['done_at'] : ($done ? now()->toIso8601String() : null),
            ];
        }

        return $items;
    }

    /** @return array<string, mixed> */
    private function present(Note $note): array
    {
        return [
            'id' => $note->id,
            'kind' => $note->kind,
            'title' => $note->title,
            'body' => $note->body,
            'items' => $note->items,
            'pinned' => $note->pinned,
            'color' => $note->color,
            'position' => $note->position,
            'by' => $note->user?->username,
            'updated_by' => $note->editor?->username,
            'created_at' => $note->created_at->toIso8601String(),
            'updated_at' => $note->updated_at->toIso8601String(),
        ];
    }

    private function maxNotes(): int
    {
        return max(1, min(200, Settings::int('max_notes')));
    }

    private function log(string $event, Server $server, Note $note): void
    {
        Activity::event('server:prism-notes.'.$event)->subject($server)->property(['note' => $note->title])->log();
    }
}
