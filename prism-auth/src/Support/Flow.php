<?php

declare(strict_types=1);

namespace PrismAuth\Support;

use Illuminate\Support\Facades\Session;
use Illuminate\Support\Str;

/**
 * What a sign-in started here has to match when the provider sends the browser back: the state,
 * the PKCE verifier and the nonce, the provider, and whether it signs in or links an account.
 * Each is used once and lasts ten minutes.
 */
final class Flow
{
    private const string KEY = 'prism-auth.flow';

    private const int LIFETIME = 600;

    /** @return array{state: string, verifier: string, nonce: string, slug: string, intent: string, user: int|null, at: int} */
    public static function start(string $slug, string $intent, ?int $userId): array
    {
        $flow = [
            'state' => Str::random(40),
            'verifier' => Str::random(64),
            'nonce' => Str::random(32),
            'slug' => $slug,
            'intent' => $intent,
            'user' => $userId,
            'at' => time(),
        ];
        Session::put(self::KEY, $flow);

        return $flow;
    }

    /**
     * The flow for this callback, taken out of the session, or null when the state does not match
     * or it has expired.
     *
     * @return array{state: string, verifier: string, nonce: string, slug: string, intent: string, user: int|null, at: int}|null
     */
    public static function finish(string $slug, mixed $state): ?array
    {
        $flow = Session::pull(self::KEY);
        if (! is_array($flow) || ! is_string($state) || ! isset($flow['state'], $flow['slug'], $flow['at'])) {
            return null;
        }
        if (! hash_equals((string) $flow['state'], $state) || $flow['slug'] !== $slug || time() - (int) $flow['at'] > self::LIFETIME) {
            return null;
        }

        return $flow;
    }

    /**
     * A provider sign-in with no account yet, kept so the sign-up form can finish it.
     *
     * @param  array{email: string|null, name: string|null, username: string|null, avatar: string|null}  $profile
     */
    public static function holdPending(int $providerId, string $subject, array $profile, bool $emailVerified): void
    {
        Session::put('prism-auth.pending', ['provider' => $providerId, 'subject' => $subject, 'profile' => $profile, 'verified' => $emailVerified, 'at' => time()]);
    }

    /** @return array{provider: int, subject: string, profile: array{email: string|null, name: string|null, username: string|null, avatar: string|null}, verified: bool, at: int}|null */
    public static function pending(): ?array
    {
        $pending = Session::get('prism-auth.pending');
        if (! is_array($pending) || time() - (int) ($pending['at'] ?? 0) > 1800) {
            return null;
        }

        return $pending;
    }

    public static function forgetPending(): void
    {
        Session::forget('prism-auth.pending');
    }
}
