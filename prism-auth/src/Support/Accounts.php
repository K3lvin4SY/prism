<?php

declare(strict_types=1);

namespace PrismAuth\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PrismAuth\Models\AuthProvider;
use PrismAuth\Models\Identity;
use PrismAuth\Support\Providers\ExternalUser;
use Pterodactyl\Contracts\Users\CompletesLogins;
use Pterodactyl\Contracts\Users\CreatesUsers;
use Pterodactyl\Data\LoginResult;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\User;

/** Linking provider accounts to panel users, making accounts, and signing people in. */
final class Accounts
{
    public static function link(User $user, AuthProvider $provider, ExternalUser $external): Identity
    {
        $identity = Identity::query()->updateOrCreate(
            ['user_id' => $user->id, 'provider_id' => $provider->id],
            ['subject' => $external->subject, 'email' => $external->email, 'display_name' => $external->name, 'avatar' => $external->avatar],
        );

        Activity::event('user:prism-auth.link')->actor($user)->subject($user)->property(['provider' => $provider->name, 'account' => $external->name ?? $external->email ?? $external->subject])->log();

        return $identity;
    }

    /** Signs in through a linked identity; the panel asks for the two-factor code when the account has one. */
    public static function signIn(Identity $identity, ExternalUser $external): LoginResult
    {
        $identity->forceFill([
            'email' => $external->email ?? $identity->email,
            'display_name' => $external->name ?? $identity->display_name,
            'avatar' => $external->avatar ?? $identity->avatar,
            'last_used_at' => now(),
        ])->save();

        $user = $identity->user;
        Activity::event('user:prism-auth.login')->withRequestMetadata()->actor($user)->subject($user)->property(['provider' => $identity->provider->name])->log();

        return app(CompletesLogins::class)->complete($user);
    }

    /**
     * Makes an account. Without a password hash it gets a random one nobody knows (and the
     * panel's welcome email a link to set one), and it is recorded as passwordless until then.
     *
     * @param  array{email: string, username: string, name_first: string, name_last: string, password?: string|null}  $input
     */
    public static function create(array $input): User
    {
        $password = $input['password'] ?? null;

        return DB::transaction(function () use ($input, $password): User {
            $user = app(CreatesUsers::class)->create([
                'email' => $input['email'],
                'username' => $input['username'],
                'name_first' => $input['name_first'],
                'name_last' => $input['name_last'],
                // A hash from the sign-up form; the model keeps a value that is already hashed.
                'password' => $password,
                'root_admin' => false,
            ]);

            if ($password === null) {
                DB::table('prism_auth_passwordless')->insertOrIgnore(['user_id' => $user->id, 'created_at' => now(), 'updated_at' => now()]);
            }

            return $user;
        });
    }

    public static function passwordless(User $user): bool
    {
        return DB::table('prism_auth_passwordless')->where('user_id', $user->id)->exists();
    }

    /** Ways the account can sign in: each linked provider, and its password once it knows one. */
    public static function methods(User $user): int
    {
        return Identity::query()->where('user_id', $user->id)->count() + (self::passwordless($user) ? 0 : 1);
    }

    /** A free username from what the provider or the form gave, in the panel's username shape. */
    public static function username(?string ...$candidates): string
    {
        foreach ([...$candidates, 'user'] as $candidate) {
            if ($candidate === null) {
                continue;
            }
            if (str_contains($candidate, '@')) {
                $candidate = Str::before($candidate, '@');
            }
            $base = trim((string) preg_replace('/[^a-z0-9_.-]+/', '', mb_strtolower(Str::ascii($candidate))), '_.-');
            if (mb_strlen($base) < 3) {
                continue;
            }
            $base = mb_substr($base, 0, 40);
            $name = $base;
            for ($i = 2; User::query()->where('username', $name)->exists(); $i++) {
                $name = $base.$i;
            }

            return $name;
        }

        return 'user'.random_int(1000, 999999);
    }

    /** @return array{0: string, 1: string} first and last name from a full name, or the username for both */
    public static function names(?string $name, string $username): array
    {
        $parts = preg_split('/\s+/', trim((string) $name), 2) ?: [];
        $first = mb_substr($parts[0] ?? '', 0, 191);
        $last = mb_substr($parts[1] ?? '', 0, 191);

        return [$first !== '' ? $first : $username, $last !== '' ? $last : $username];
    }
}
