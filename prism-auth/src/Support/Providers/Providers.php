<?php

declare(strict_types=1);

namespace PrismAuth\Support\Providers;

use PrismAuth\Models\AuthProvider;

final class Providers
{
    public static function for(AuthProvider $provider): Provider
    {
        return match ($provider->type) {
            'google' => new GoogleProvider($provider),
            'discord' => new DiscordProvider($provider),
            'github' => new GithubProvider($provider),
            'steam' => new SteamProvider($provider),
            default => new OidcProvider($provider),
        };
    }
}
