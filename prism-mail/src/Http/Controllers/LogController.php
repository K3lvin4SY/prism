<?php

declare(strict_types=1);

namespace PrismMail\Http\Controllers;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PrismMail\Models\LogEntry;
use PrismMail\Support\Catalogue;

/** The delivery log on the admin "Emails" page. */
final class LogController
{
    /** An email still not taken by the mail server after this long most likely failed. */
    private const int UNCONFIRMED_MINUTES = 10;

    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $page = LogEntry::query()
            ->when($search !== '', static fn (Builder $query) => $query->where(static fn (Builder $where) => $where
                ->where('recipient', 'like', '%'.addcslashes($search, '%_\\').'%')
                ->orWhere('subject', 'like', '%'.addcslashes($search, '%_\\').'%')))
            ->orderByDesc('id')
            ->paginate(25);

        $stale = now()->subMinutes(self::UNCONFIRMED_MINUTES);

        return response()->json([
            'data' => $page->getCollection()->map(static fn (LogEntry $entry): array => [
                'id' => $entry->id,
                'recipient' => $entry->recipient,
                'subject' => $entry->subject,
                'email' => $entry->notification !== null ? (Catalogue::EMAILS[$entry->notification]['label'] ?? class_basename($entry->notification)) : null,
                'status' => $entry->status === 'sent' ? 'sent' : ($entry->created_at->lessThan($stale) ? 'unconfirmed' : 'sending'),
                'created_at' => $entry->created_at->toIso8601String(),
                'sent_at' => $entry->sent_at?->toIso8601String(),
            ])->values(),
            'meta' => ['page' => $page->currentPage(), 'pages' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    public function clear(): Response
    {
        LogEntry::query()->delete();

        return response()->noContent();
    }
}
