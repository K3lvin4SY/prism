<?php

declare(strict_types=1);

namespace PrismAudit\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use PrismAudit\Support\Timeline;
use Pterodactyl\Models\ActivityLog;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** The admin "Audit" page's timeline. Only root admins reach it. */
final class EventsController
{
    private const int PAGE = 50;

    /** Rows one export holds at most. */
    private const int EXPORT_LIMIT = 50000;

    public function index(Request $request): JsonResponse
    {
        $logs = Timeline::query($request)->limit(self::PAGE + 1)->get();
        $more = $logs->count() > self::PAGE;
        $logs = $logs->take(self::PAGE);

        return response()->json([
            'data' => $logs->map(static fn (ActivityLog $log): array => Timeline::present($log))->values(),
            'meta' => ['next' => $more ? $logs->last()?->id : null],
        ]);
    }

    /** The same entries as a CSV file, newest first. */
    public function export(Request $request): StreamedResponse
    {
        $query = Timeline::query($request);
        $name = 'audit-'.now()->format('Y-m-d-His').'.csv';

        return response()->streamDownload(static function () use ($query): void {
            $out = fopen('php://output', 'wb');
            fputcsv($out, ['Time', 'Event', 'By', 'IP address', 'About', 'Description', 'Details'], escape: '');
            // Newest first, a page at a time below the last id written.
            $written = 0;
            $last = null;
            do {
                $logs = (clone $query)->when($last, static fn ($page) => $page->where('id', '<', $last))->limit(500)->get();
                foreach ($logs as $log) {
                    fputcsv($out, array_map(self::safe(...), Timeline::row($log)), escape: '');
                }
                $written += $logs->count();
                $last = $logs->last()?->id;
            } while ($logs->count() === 500 && $written < self::EXPORT_LIMIT);
            fclose($out);
        }, $name, ['Content-Type' => 'text/csv; charset=UTF-8', 'Cache-Control' => 'no-store']);
    }

    /** The event names in the log, for the event filter. */
    public function filters(): JsonResponse
    {
        $events = Cache::remember('prism-audit:events', 600, static fn (): array => ActivityLog::query()
            ->whereNotIn('event', ActivityLog::DISABLED_EVENTS)
            ->distinct()->orderBy('event')->pluck('event')->all());

        return response()->json(['data' => ['events' => $events]]);
    }

    /** Users or servers matching a search, for the "by" and "server" filters. */
    public function lookup(Request $request): JsonResponse
    {
        $data = $request->validate(['type' => ['required', 'in:user,server'], 'q' => ['nullable', 'string', 'max:64']]);
        $like = '%'.addcslashes(trim((string) ($data['q'] ?? '')), '%_\\').'%';

        $found = $data['type'] === 'user'
            ? User::query()->where(static fn ($query) => $query->where('username', 'like', $like)->orWhere('email', 'like', $like))->orderBy('username')->limit(10)->get()
                ->map(static fn (User $user): array => ['id' => $user->id, 'label' => $user->username, 'hint' => $user->email])
            : Server::query()->where(static fn ($query) => $query->where('name', 'like', $like)->orWhere('uuidShort', 'like', $like))->orderBy('name')->limit(10)->get()
                ->map(static fn (Server $server): array => ['id' => $server->id, 'label' => $server->name, 'hint' => $server->uuidShort]);

        return response()->json(['data' => $found->values()]);
    }

    /** Keeps spreadsheet apps from running a cell as a formula. */
    private static function safe(mixed $value): string
    {
        $text = (string) $value;

        return $text !== '' && in_array($text[0], ['=', '+', '-', '@', "\t", "\r"], true) ? "'".$text : $text;
    }
}
