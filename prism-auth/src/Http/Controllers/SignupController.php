<?php

declare(strict_types=1);

namespace PrismAuth\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PrismAuth\Models\AuthProvider;
use PrismAuth\Models\Identity;
use PrismAuth\Models\Verification;
use PrismAuth\Notifications\AlreadyRegistered;
use PrismAuth\Notifications\VerifyEmail;
use PrismAuth\Support\Accounts;
use PrismAuth\Support\Flow;
use PrismAuth\Support\Providers\ExternalUser;
use PrismAuth\Support\Settings;
use PrismAuth\Support\SignupRules;
use Pterodactyl\Contracts\Users\CompletesLogins;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\User;
use Throwable;

/**
 * Sign-up: the form makes a verification and emails its link, and opening the link makes the
 * account and signs it in. The form answers the same whether or not the address has an account.
 */
final class SignupController
{
    public function store(Request $request): JsonResponse
    {
        $pending = Flow::pending();
        $provider = $pending !== null ? AuthProvider::query()->where('enabled', true)->where('allow_signup', true)->find($pending['provider']) : null;
        if (! Settings::bool('signup_enabled') && ! ($provider !== null && Settings::bool('auto_create'))) {
            abort(403, 'Sign-up is turned off.');
        }

        $this->limit($request);
        SignupRules::human($request->all(), $request->ip());
        $data = SignupRules::validate($request->all(), passwordOptional: $provider !== null);

        $username = $data['username'] ?? Accounts::username($pending['profile']['username'] ?? null, $data['email']);
        if (User::query()->where('username', $username)->exists()) {
            throw ValidationException::withMessages(['username' => 'That username is taken. Please pick another.']);
        }
        [$first, $last] = Accounts::names(trim(($data['name_first'] ?? '').' '.($data['name_last'] ?? '')) ?: ($pending['profile']['name'] ?? null), $username);
        $first = $data['name_first'] ?? $first;
        $last = $data['name_last'] ?? $last;

        if (User::query()->where('email', $data['email'])->exists()) {
            Notification::route('mail', $data['email'])->notifyNow(new AlreadyRegistered);

            return $this->sent($data['email']);
        }

        // The provider already confirmed this address: no email needed.
        if ($provider !== null && $pending['verified'] && mb_strtolower((string) ($pending['profile']['email'] ?? '')) === $data['email']) {
            $user = Accounts::create(['email' => $data['email'], 'username' => $username, 'name_first' => $first, 'name_last' => $last, 'password' => $data['password'] !== null ? Hash::make($data['password']) : null]);
            $this->linkPending($user, $provider, $pending);
            Activity::event('user:prism-auth.signup')->withRequestMetadata()->actor($user)->subject($user)->property(['provider' => $provider->name])->log();
            Flow::forgetPending();
            $result = app(CompletesLogins::class)->complete($user);

            return response()->json(['data' => ['status' => 'signed-in', 'result' => $result->toResponseData()]]);
        }

        Verification::query()->where('email', $data['email'])->delete();
        $token = Str::random(40);
        Verification::query()->create([
            'token' => hash('sha256', $token),
            'email' => $data['email'],
            'username' => $username,
            'name_first' => $first,
            'name_last' => $last,
            'password' => $data['password'] !== null ? Hash::make($data['password']) : null,
            'provider_id' => $provider?->id,
            'subject' => $provider !== null ? $pending['subject'] : null,
            'profile' => $provider !== null ? $pending['profile'] : null,
            'ip' => $request->ip(),
            'expires_at' => now()->addHours($this->hours()),
        ]);
        Flow::forgetPending();
        $this->send($data['email'], $username, $token);

        return $this->sent($data['email']);
    }

    /** Sends the link again with a new token; the old link stops working. */
    public function resend(Request $request): JsonResponse
    {
        $this->limit($request);
        $email = mb_strtolower(trim((string) $request->input('email')));
        $verification = Verification::query()->where('email', $email)->where('expires_at', '>', now())->latest('id')->first();
        if ($verification !== null) {
            $token = Str::random(40);
            $verification->forceFill(['token' => hash('sha256', $token), 'expires_at' => now()->addHours($this->hours())])->save();
            $this->send($email, $verification->username, $token);
        }

        return $this->sent($email);
    }

    public function verify(string $token): RedirectResponse
    {
        $verification = Verification::query()->where('token', hash('sha256', $token))->first();
        if ($verification === null || $verification->expires_at->isPast()) {
            $verification?->delete();

            return redirect('/auth/login?prism-auth=expired');
        }

        if (User::query()->where('email', $verification->email)->orWhere('username', $verification->username)->exists()) {
            $verification->delete();

            return redirect('/auth/login?prism-auth=error&reason=taken-account');
        }

        try {
            $user = DB::transaction(function () use ($verification): User {
                $user = Accounts::create([
                    'email' => $verification->email,
                    'username' => $verification->username,
                    'name_first' => $verification->name_first,
                    'name_last' => $verification->name_last,
                    'password' => $verification->password,
                ]);
                $provider = $verification->provider_id !== null ? AuthProvider::query()->find($verification->provider_id) : null;
                if ($provider !== null && $verification->subject !== null) {
                    $this->linkPending($user, $provider, ['subject' => $verification->subject, 'profile' => $verification->profile ?? []]);
                }
                $verification->delete();

                return $user;
            });
        } catch (Throwable $exception) {
            report($exception);

            return redirect('/auth/login?prism-auth=error&reason=create');
        }

        Activity::event('user:prism-auth.signup')->withRequestMetadata()->actor($user)->subject($user)->property(['email' => $user->email])->log();

        if (Auth::check()) {
            Auth::logout();
        }
        app(CompletesLogins::class)->complete($user);

        return redirect('/?prism-auth=welcome');
    }

    /** @param  array{subject: string, profile: array<string, mixed>}  $pending */
    private function linkPending(User $user, AuthProvider $provider, array $pending): void
    {
        if (Identity::query()->where('provider_id', $provider->id)->where('subject', $pending['subject'])->exists()) {
            return;
        }

        $profile = $pending['profile'];
        Accounts::link($user, $provider, new ExternalUser(
            subject: $pending['subject'],
            email: isset($profile['email']) ? (string) $profile['email'] : null,
            emailVerified: false,
            name: isset($profile['name']) ? (string) $profile['name'] : null,
            username: isset($profile['username']) ? (string) $profile['username'] : null,
            avatar: isset($profile['avatar']) ? (string) $profile['avatar'] : null,
        ));
    }

    private function send(string $email, string $username, string $token): void
    {
        Notification::route('mail', $email)->notifyNow(new VerifyEmail($username, url('/prism-auth/verify/'.$token), $this->hours()));
    }

    private function hours(): int
    {
        return max(1, min(168, Settings::int('verify_hours', 24)));
    }

    /** Sign-ups and resends per network address and hour. */
    private function limit(Request $request): void
    {
        $key = 'prism-auth:signup:'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, max(1, Settings::int('limit_per_hour', 5)))) {
            throw ValidationException::withMessages(['email' => 'Too many tries from your network. Please try again in '.max(1, (int) ceil(RateLimiter::availableIn($key) / 60)).' minutes.']);
        }
        RateLimiter::hit($key, 3600);
    }

    private function sent(string $email): JsonResponse
    {
        return response()->json(['data' => ['status' => 'sent', 'email' => $email]]);
    }
}
