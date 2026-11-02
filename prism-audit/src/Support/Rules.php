<?php

declare(strict_types=1);

namespace PrismAudit\Support;

use Illuminate\Database\Eloquent\Builder;
use PrismAudit\Models\Alert;
use Pterodactyl\Models\ActivityLog;

/** The alert rules: each looks at one new activity entry and may raise an alert. */
final class Rules
{
    /** The events any rule could care about, so the tick only reads those. */
    public static function events(): array
    {
        return array_values(array_unique(['auth:success', 'auth:fail', 'user:two-factor.delete', ...Settings::list('admin_events')]));
    }

    /** @return list<array{rule: string, summary: string}> */
    public static function check(ActivityLog $log): array
    {
        return array_values(array_filter([
            self::newAddress($log),
            self::failedSignIns($log),
            self::twoFactorOff($log),
            self::adminAction($log),
        ]));
    }

    /** A sign-in from an address this person has not signed in from lately. */
    private static function newAddress(ActivityLog $log): ?array
    {
        if ($log->event !== 'auth:success' || ! Settings::bool('rule_new_ip')) {
            return null;
        }
        $user = Timeline::person($log);
        if ($user === null || (Settings::string('new_ip_who') !== 'everyone' && ! $user->root_admin)) {
            return null;
        }

        $seen = ActivityLog::query()
            ->whereIn('event', ['auth:success', 'auth:checkpoint', 'auth:token'])
            ->where('id', '<', $log->id)
            ->where('ip', $log->ip)
            ->where('timestamp', '>=', now()->subDays(max(1, Settings::int('new_ip_days'))))
            ->where(static fn (Builder $who) => $who
                ->where(static fn (Builder $actor) => $actor->where('actor_type', 'user')->where('actor_id', $user->id))
                ->orWhereHas('subjects', static fn (Builder $subject) => $subject->where('subject_type', 'user')->where('subject_id', $user->id)))
            ->exists();
        if ($seen) {
            return null;
        }

        $who = $user->root_admin ? "Admin {$user->username}" : $user->username;
        $agent = is_string($log->properties?->get('useragent')) ? ' ('.mb_strimwidth($log->properties->get('useragent'), 0, 80, '…').')' : '';

        return ['rule' => 'new_ip', 'summary' => "{$who} signed in from {$log->ip}, an address not used by them in the last ".Settings::int('new_ip_days')." days{$agent}."];
    }

    /** Many failed sign-ins from one address in a short time. Raised once per address and window. */
    private static function failedSignIns(ActivityLog $log): ?array
    {
        if ($log->event !== 'auth:fail' || ! Settings::bool('rule_failed')) {
            return null;
        }
        $minutes = max(1, Settings::int('fail_minutes'));
        $limit = max(2, Settings::int('fail_count'));
        $since = now()->subMinutes($minutes);

        $count = ActivityLog::query()->where('event', 'auth:fail')->where('ip', $log->ip)->where('timestamp', '>=', $since)->where('id', '<=', $log->id)->count();
        if ($count < $limit || Alert::query()->where('rule', 'failed')->where('ip', $log->ip)->where('created_at', '>=', $since)->exists()) {
            return null;
        }

        return ['rule' => 'failed', 'summary' => "{$count} failed sign-ins from {$log->ip} in the last {$minutes} minutes."];
    }

    private static function twoFactorOff(ActivityLog $log): ?array
    {
        if ($log->event !== 'user:two-factor.delete' || ! Settings::bool('rule_two_factor')) {
            return null;
        }
        $user = Timeline::person($log);

        return ['rule' => 'two_factor', 'summary' => ($user?->username ?? 'Someone').' turned off two-factor authentication, from '.$log->ip.'.'];
    }

    private static function adminAction(ActivityLog $log): ?array
    {
        if (! str_starts_with($log->event, 'admin:') || ! in_array($log->event, Settings::list('admin_events'), true)) {
            return null;
        }
        $user = Timeline::person($log);
        $what = Describe::event($log->event);
        $subject = $log->subjects->first()?->subject;
        $name = $subject !== null ? (string) ($subject->getAttribute('name') ?? $subject->getAttribute('username') ?? '') : '';

        return ['rule' => 'admin', 'summary' => ($user?->username ?? 'Someone').' '.$what.($name !== '' ? ": {$name}" : '').', from '.$log->ip.'.'];
    }
}
