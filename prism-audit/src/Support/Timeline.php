<?php

declare(strict_types=1);

namespace PrismAudit\Support;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Pterodactyl\Models\ActivityLog;
use Pterodactyl\Models\ActivityLogSubject;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Throwable;

/** The panel's activity log, filtered the way the Audit page asks, and each entry as the page shows it. */
final class Timeline
{
    public const array FAMILIES = ['auth', 'user', 'server', 'admin'];

    /** Properties never shown or exported, whatever an event put there. */
    private const array HIDDEN = ['password', 'token', 'secret', 'current_password', 'password_confirmation'];

    /** @return Builder<ActivityLog> */
    public static function query(Request $request): Builder
    {
        $filters = $request->validate([
            'user' => ['nullable', 'integer', 'min:1'],
            'server' => ['nullable', 'integer', 'min:1'],
            'family' => ['nullable', 'string', 'in:auth,user,server,admin,other'],
            'event' => ['nullable', 'string', 'max:191'],
            'ip' => ['nullable', 'string', 'max:45'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'q' => ['nullable', 'string', 'max:191'],
            'before' => ['nullable', 'integer', 'min:1'],
        ]);
        $like = static fn (string $text): string => '%'.addcslashes($text, '%_\\').'%';

        return ActivityLog::query()
            ->with(['actor', 'subjects.subject'])
            ->whereNotIn('event', ActivityLog::DISABLED_EVENTS)
            ->when($filters['user'] ?? null, static fn (Builder $query, int $user) => $query->where(static fn (Builder $who) => $who
                ->where(static fn (Builder $actor) => $actor->where('actor_type', 'user')->where('actor_id', $user))
                ->orWhereHas('subjects', static fn (Builder $subject) => $subject->where('subject_type', 'user')->where('subject_id', $user))))
            ->when($filters['server'] ?? null, static fn (Builder $query, int $server) => $query->whereHas('subjects', static fn (Builder $subject) => $subject->where('subject_type', 'server')->where('subject_id', $server)))
            ->when($filters['family'] ?? null, static fn (Builder $query, string $family) => $family === 'other'
                ? $query->where(static function (Builder $other): void {
                    foreach (self::FAMILIES as $known) {
                        $other->where('event', 'not like', $known.':%');
                    }
                })
                : $query->where('event', 'like', $family.':%'))
            ->when($filters['event'] ?? null, static fn (Builder $query, string $event) => $query->where('event', $event))
            ->when($filters['ip'] ?? null, static fn (Builder $query, string $ip) => $query->where('ip', 'like', addcslashes($ip, '%_\\').'%'))
            ->when($filters['from'] ?? null, static fn (Builder $query, string $from) => $query->where('timestamp', '>=', CarbonImmutable::parse($from)->startOfDay()))
            ->when($filters['to'] ?? null, static fn (Builder $query, string $to) => $query->where('timestamp', '<=', CarbonImmutable::parse($to)->endOfDay()))
            ->when($filters['q'] ?? null, static fn (Builder $query, string $text) => $query->where(static fn (Builder $any) => $any
                ->where('event', 'like', $like($text))
                ->orWhere('description', 'like', $like($text))
                ->orWhere('properties', 'like', $like($text))))
            ->when($filters['before'] ?? null, static fn (Builder $query, int $before) => $query->where('id', '<', $before))
            ->orderByDesc('id');
    }

    public static function present(ActivityLog $log): array
    {
        $actor = $log->actor;

        return [
            'id' => $log->id,
            'event' => $log->event,
            'timestamp' => $log->timestamp?->toIso8601String(),
            'ip' => $log->ip,
            'description' => $log->description,
            'actor' => $actor instanceof User ? self::user($actor) : null,
            'api' => $log->api_key_id !== null,
            'subjects' => $log->subjects->map(static fn (ActivityLogSubject $subject): array => self::subject($subject))->values()->all(),
            'properties' => self::properties($log),
        ];
    }

    /** One line of the CSV export. */
    public static function row(ActivityLog $log): array
    {
        $entry = self::present($log);

        return [
            $entry['timestamp'],
            $entry['event'],
            $entry['actor']['username'] ?? ($entry['api'] ? 'API key' : 'System'),
            $entry['ip'],
            implode('; ', array_map(static fn (array $subject): string => $subject['type'].': '.$subject['label'], $entry['subjects'])),
            $entry['description'] ?? '',
            $entry['properties'] === [] ? '' : (string) json_encode($entry['properties'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ];
    }

    /** The person an entry is about: whoever did it, or for sign-ins, whose account it was. */
    public static function person(ActivityLog $log): ?User
    {
        if ($log->actor instanceof User) {
            return $log->actor;
        }
        $subject = $log->subjects->first(static fn (ActivityLogSubject $subject): bool => $subject->subject_type === 'user');

        return $subject?->subject instanceof User ? $subject->subject : null;
    }

    public static function user(User $user): array
    {
        return ['id' => $user->id, 'username' => $user->username, 'email' => $user->email, 'admin' => (bool) $user->root_admin];
    }

    private static function subject(ActivityLogSubject $subject): array
    {
        $model = $subject->subject;
        $label = match (true) {
            $model instanceof Server => $model->name,
            $model instanceof User => $model->username,
            $model !== null => (string) ($model->getAttribute('name') ?? $model->getAttribute('identifier') ?? '#'.$subject->subject_id),
            default => '#'.$subject->subject_id.' (deleted)',
        };

        return [
            'type' => (string) $subject->subject_type,
            'id' => (int) $subject->subject_id,
            'label' => $label,
            'short' => $model instanceof Server ? $model->uuidShort : null,
        ];
    }

    private static function properties(ActivityLog $log): array
    {
        try {
            $values = $log->properties?->all() ?? [];
        } catch (Throwable) {
            return [];
        }

        return array_filter($values, static fn ($value, $key): bool => ! in_array(strtolower((string) $key), self::HIDDEN, true), ARRAY_FILTER_USE_BOTH);
    }
}
