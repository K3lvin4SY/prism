<?php

declare(strict_types=1);

namespace PrismAuth\Support\Providers;

final class DiscordProvider extends OAuth2Provider
{
    protected function authorizeUrl(): string
    {
        return 'https://discord.com/oauth2/authorize';
    }

    protected function tokenUrl(): string
    {
        return 'https://discord.com/api/oauth2/token';
    }

    protected function defaultScopes(): string
    {
        return 'identify email';
    }

    protected function profile(array $token, array $state): ExternalUser
    {
        $user = $this->getJson('https://discord.com/api/users/@me', (string) $token['access_token']);
        $id = self::string($user['id'] ?? null) ?? throw new SignInFailed('provider', 'Discord gave no user id.');
        $avatar = self::string($user['avatar'] ?? null);

        return new ExternalUser(
            subject: $id,
            email: self::string($user['email'] ?? null),
            emailVerified: ($user['verified'] ?? false) === true,
            name: self::string($user['global_name'] ?? null) ?? self::string($user['username'] ?? null),
            username: self::string($user['username'] ?? null),
            avatar: $avatar !== null ? 'https://cdn.discordapp.com/avatars/'.$id.'/'.$avatar.'.png?size=128' : null,
        );
    }
}
