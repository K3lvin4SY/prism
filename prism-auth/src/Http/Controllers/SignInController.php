<?php

declare(strict_types=1);

namespace PrismAuth\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Session;
use PrismAuth\Models\AuthProvider;
use PrismAuth\Models\Identity;
use PrismAuth\Support\Accounts;
use PrismAuth\Support\Flow;
use PrismAuth\Support\Providers\ExternalUser;
use PrismAuth\Support\Providers\Providers;
use PrismAuth\Support\Providers\SignInFailed;
use PrismAuth\Support\Settings;
use PrismAuth\Support\SignupRules;
use Pterodactyl\Data\LoginResult;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\User;
use Throwable;

/**
 * Sending people to a provider and taking them back: signing in, linking a provider to the
 * signed-in account, or starting a sign-up with what the provider shared.
 */
final class SignInController
{
    private const string ACCOUNT = '/account/sign-in-methods';

    /** The enabled providers, for the sign-in page and the account page: never their credentials. */
    public function providers(): JsonResponse
    {
        $providers = AuthProvider::query()->where('enabled', true)->orderBy('sort')->orderBy('id')->get();

        return response()->json(['data' => $providers->map->toPublic()->values()]);
    }

    public function redirect(Request $request, string $slug): RedirectResponse
    {
        $intent = $request->query('intent') === 'link' ? 'link' : 'login';
        $provider = AuthProvider::query()->where('slug', $slug)->where('enabled', true)->first();
        if ($provider === null) {
            return $this->failed($intent, 'unknown');
        }
        if ($intent === 'link' && Auth::guest()) {
            return redirect('/auth/login');
        }
        if ($intent === 'login' && Auth::check()) {
            return redirect('/');
        }

        try {
            return redirect()->away(Providers::for($provider)->redirect(Flow::start($provider->slug, $intent, Auth::id())));
        } catch (SignInFailed $failure) {
            return $this->failed($intent, $failure->reason, $provider, $failure->getMessage());
        }
    }

    public function callback(Request $request, string $slug): RedirectResponse
    {
        $flow = Flow::finish($slug, $request->query('state'));
        $intent = $flow['intent'] ?? (Auth::check() ? 'link' : 'login');
        $provider = AuthProvider::query()->where('slug', $slug)->where('enabled', true)->first();
        if ($provider === null) {
            return $this->failed($intent, 'unknown');
        }
        if ($flow === null) {
            return $this->failed($intent, 'state', $provider, 'The sign-in expired or was started in another tab.');
        }

        try {
            $external = Providers::for($provider)->user($request, $flow);
        } catch (SignInFailed $failure) {
            return $this->failed($intent, $failure->reason, $provider, $failure->getMessage());
        } catch (Throwable $exception) {
            report($exception);

            return $this->failed($intent, 'provider', $provider, $exception->getMessage());
        }

        $identity = Identity::query()->with(['user', 'provider'])->where('provider_id', $provider->id)->where('subject', $external->subject)->first();

        return $intent === 'link' ? $this->link($provider, $external, $identity, (int) $flow['user']) : $this->login($provider, $external, $identity);
    }

    private function link(AuthProvider $provider, ExternalUser $external, ?Identity $identity, int $userId): RedirectResponse
    {
        $user = Auth::user();
        if (! $user instanceof User || $user->id !== $userId) {
            return redirect('/auth/login');
        }
        if ($identity !== null && $identity->user_id !== $user->id) {
            return $this->failed('link', 'taken', $provider);
        }

        Accounts::link($user, $provider, $external);

        return redirect(self::ACCOUNT.'?prism-auth=linked&provider='.urlencode($provider->slug));
    }

    private function login(AuthProvider $provider, ExternalUser $external, ?Identity $identity): RedirectResponse
    {
        if ($identity !== null) {
            return $this->finish(Accounts::signIn($identity, $external));
        }

        // A confirmed address that matches an account links to it, admins only when allowed.
        if ($external->email !== null && $external->emailVerified && Settings::bool('link_by_email', true)) {
            $user = User::query()->where('email', $external->email)->first();
            // An account already linked to another account at this provider keeps that link.
            $linkedElsewhere = $user !== null && Identity::query()->where('user_id', $user->id)->where('provider_id', $provider->id)->exists();
            if ($user !== null && ! $linkedElsewhere && (! $user->root_admin || Settings::bool('link_admins'))) {
                return $this->finish(Accounts::signIn(Accounts::link($user, $provider, $external)->load(['user', 'provider']), $external));
            }
            if ($user !== null) {
                return $this->failed('login', 'unlinked', $provider);
            }
        }

        $autoCreate = Settings::bool('auto_create');
        if (! $provider->allow_signup || ! ($autoCreate || Settings::bool('signup_enabled'))) {
            return $this->failed('login', 'unlinked', $provider);
        }

        // With a confirmed address nobody uses, the account is made at once.
        if ($autoCreate && $external->email !== null && $external->emailVerified && SignupRules::domainAllowed($external->email) && ! User::query()->where('email', $external->email)->exists()) {
            try {
                $username = Accounts::username($external->username, $external->name, $external->email);
                [$first, $last] = Accounts::names($external->name, $username);
                $user = Accounts::create(['email' => $external->email, 'username' => $username, 'name_first' => $first, 'name_last' => $last]);
            } catch (Throwable $exception) {
                report($exception);

                return $this->failed('login', 'create', $provider, $exception->getMessage());
            }
            Activity::event('user:prism-auth.signup')->withRequestMetadata()->actor($user)->subject($user)->property(['provider' => $provider->name])->log();

            return $this->finish(Accounts::signIn(Accounts::link($user, $provider, $external)->load(['user', 'provider']), $external));
        }

        // Otherwise the sign-up form finishes it, and confirms the address by email.
        Flow::holdPending($provider->id, $external->subject, $external->profile(), $external->emailVerified);

        return redirect('/auth/login?prism-auth=signup');
    }

    /** Signed in, or on to the panel's own two-factor screen, which the sign-in page opens. */
    private function finish(LoginResult $result): RedirectResponse
    {
        if ($result->complete) {
            return redirect($result->intended);
        }

        Session::put('prism-auth.result', $result->toResponseData());

        return redirect('/auth/login?prism-auth=checkpoint');
    }

    /** The two-factor hand-off for the sign-in page, once. */
    public function result(): JsonResponse
    {
        $result = Session::pull('prism-auth.result');

        return response()->json(['data' => is_array($result) ? $result : null]);
    }

    /** What the provider shared, for the sign-up form to start from. */
    public function pending(): JsonResponse
    {
        $pending = Flow::pending();
        $provider = $pending !== null ? AuthProvider::query()->find($pending['provider']) : null;

        return response()->json(['data' => $pending !== null && $provider !== null ? [
            'provider' => $provider->toPublic(),
            'email' => $pending['profile']['email'] ?? null,
            'email_verified' => $pending['verified'],
            'name' => $pending['profile']['name'] ?? null,
            'username' => Accounts::username($pending['profile']['username'] ?? null, $pending['profile']['name'] ?? null, $pending['profile']['email'] ?? null),
            'avatar' => $pending['profile']['avatar'] ?? null,
        ] : null]);
    }

    public function forgetPending(): JsonResponse
    {
        Flow::forgetPending();

        return response()->json(['data' => null]);
    }

    private function failed(string $intent, string $reason, ?AuthProvider $provider = null, string $detail = ''): RedirectResponse
    {
        // An unknown provider is anyone typing an address; only real attempts are logged.
        if ($provider !== null) {
            Activity::event('auth:prism-auth.fail')->withRequestMetadata()->property(['provider' => $provider->name, 'reason' => $reason, 'detail' => mb_substr($detail, 0, 300)])->log();
        }

        $query = http_build_query(['prism-auth' => 'error', 'reason' => $reason, 'provider' => $provider?->slug]);

        return redirect(($intent === 'link' ? self::ACCOUNT : '/auth/login').'?'.$query);
    }
}
