<?php

declare(strict_types=1);

namespace PrismStatus\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use PrismStatus\Models\Component;
use PrismStatus\Models\Incident;
use PrismStatus\Support\Announce;
use PrismStatus\Support\Summary;

/** Incidents and their updates, on the admin "Status page" page. */
final class IncidentsController
{
    public function index(): JsonResponse
    {
        $incidents = Incident::query()->with('updates')->orderByRaw('resolved_at is null desc')->orderByDesc('id')->limit(50)->get();

        return response()->json([
            'data' => $incidents->map(static fn (Incident $incident): array => [...Summary::incident($incident), 'announced' => $incident->announcement !== null])->values(),
            'meta' => ['announce' => Announce::available()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'impact' => ['required', Rule::in(Incident::IMPACTS)],
            'status' => ['required', Rule::in(array_diff(Incident::STATUSES, ['resolved']))],
            'components' => ['array', 'max:200'],
            'components.*' => ['integer', Rule::exists(Component::class, 'id')],
            'body' => ['required', 'string', 'max:5000'],
            'announce' => ['boolean'],
        ]);

        $incident = DB::transaction(static function () use ($data): Incident {
            $incident = Incident::query()->create([
                'title' => trim($data['title']),
                'impact' => $data['impact'],
                'status' => $data['status'],
                'components' => array_values(array_unique(array_map('intval', $data['components'] ?? []))),
            ]);
            $incident->updates()->create(['status' => $data['status'], 'body' => trim($data['body'])]);

            return $incident;
        });

        if ($data['announce'] ?? false) {
            Announce::show($incident, trim($data['body']));
        }
        Summary::forget();

        return response()->json(['data' => ['id' => $incident->id]], 201);
    }

    /** A new post. Resolving takes the announcement down; any other keeps it current. */
    public function post(Request $request, int $incident): JsonResponse
    {
        $model = Incident::query()->findOrFail($incident);
        $data = $request->validate([
            'status' => ['required', Rule::in(Incident::STATUSES)],
            'body' => ['required', 'string', 'max:5000'],
        ]);

        $model->updates()->create(['status' => $data['status'], 'body' => trim($data['body'])]);
        $model->forceFill(['status' => $data['status'], 'resolved_at' => $data['status'] === 'resolved' ? now() : null])->save();

        if ($data['status'] === 'resolved') {
            Announce::clear($model);
        } elseif ($model->announcement !== null) {
            Announce::show($model, trim($data['body']));
        }
        Summary::forget();

        return response()->json(['data' => ['id' => $model->id]]);
    }

    public function destroy(int $incident): Response
    {
        $model = Incident::query()->findOrFail($incident);
        Announce::clear($model);
        $model->delete();
        Summary::forget();

        return response()->noContent();
    }
}
