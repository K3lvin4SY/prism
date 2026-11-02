<?php

declare(strict_types=1);

namespace PrismAudit\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use PrismAudit\Models\Alert;
use PrismAudit\Support\Settings;

/** The alerts the rules raised, on the admin "Audit" page. */
final class AlertsController
{
    public function index(): JsonResponse
    {
        $alerts = Alert::query()->orderByDesc('id')->limit(100)->get();

        return response()->json([
            'data' => $alerts->map(static fn (Alert $alert): array => [
                'id' => $alert->id,
                'rule' => $alert->rule,
                'summary' => $alert->summary,
                'ip' => $alert->ip,
                'user_id' => $alert->user_id,
                'activity_log_id' => $alert->activity_log_id,
                'created_at' => $alert->created_at->toIso8601String(),
                'read' => $alert->read_at !== null,
            ])->values(),
            'meta' => ['unread' => Alert::query()->whereNull('read_at')->count(), 'enabled' => Settings::bool('alerts')],
        ]);
    }

    public function read(): Response
    {
        Alert::query()->whereNull('read_at')->update(['read_at' => now()]);

        return response()->noContent();
    }
}
