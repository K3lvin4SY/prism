<?php

declare(strict_types=1);

namespace PrismDiscord\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use PrismDiscord\Models\Link;
use Pterodactyl\Models\User;
use Throwable;

/**
 * Which panel user a Discord account is: linked here with a /link code, or signed in with
 * Discord through Prism Auth.
 */
final class Accounts
{
    private const int CODE_MINUTES = 10;

    public static function user(string $discordId): ?User
    {
        $link = Link::query()->with('user')->where('discord_id', $discordId)->first();
        if ($link !== null) {
            $link->forceFill(['last_used_at' => now()])->save();

            return $link->user;
        }

        $id = self::viaAuth($discordId);

        return $id === null ? null : User::query()->find($id);
    }

    /** The user who signs in with this Discord account through Prism Auth, if it is installed. */
    public static function viaAuth(string $discordId): ?int
    {
        try {
            if (! Schema::hasTable('prism_auth_identities') || ! Schema::hasTable('prism_auth_providers')) {
                return null;
            }
            $id = DB::table('prism_auth_identities')
                ->join('prism_auth_providers', 'prism_auth_providers.id', '=', 'prism_auth_identities.provider_id')
                ->where('prism_auth_providers.type', 'discord')
                ->where('prism_auth_identities.subject', $discordId)
                ->value('prism_auth_identities.user_id');

            return $id === null ? null : (int) $id;
        } catch (Throwable) {
            return null;
        }
    }

    /** The Discord name Prism Auth knows for a user, when they sign in with Discord. */
    public static function authName(User $user): ?string
    {
        try {
            if (! Schema::hasTable('prism_auth_identities') || ! Schema::hasTable('prism_auth_providers')) {
                return null;
            }

            return DB::table('prism_auth_identities')
                ->join('prism_auth_providers', 'prism_auth_providers.id', '=', 'prism_auth_identities.provider_id')
                ->where('prism_auth_providers.type', 'discord')
                ->where('prism_auth_identities.user_id', $user->id)
                ->value('prism_auth_identities.display_name') ?? null;
        } catch (Throwable) {
            return null;
        }
    }

    /** A code for /link, shown once to the Discord user, entered on their panel account. */
    public static function code(string $discordId, string $name): string
    {
        $code = strtoupper(Str::random(4).'-'.Str::random(4));
        Cache::put('prism-discord:link:'.hash('sha256', $code), ['id' => $discordId, 'name' => mb_substr($name, 0, 64)], now()->addMinutes(self::CODE_MINUTES));

        return $code;
    }

    /** Links the user to the Discord account the code was made for; the code works once. */
    public static function redeem(User $user, string $code): ?Link
    {
        $found = Cache::pull('prism-discord:link:'.hash('sha256', strtoupper(trim($code))));
        if (! is_array($found)) {
            return null;
        }

        return DB::transaction(function () use ($user, $found): Link {
            Link::query()->where('discord_id', $found['id'])->where('user_id', '!=', $user->id)->delete();

            return Link::query()->updateOrCreate(['user_id' => $user->id], ['discord_id' => $found['id'], 'discord_name' => $found['name']]);
        });
    }
}
