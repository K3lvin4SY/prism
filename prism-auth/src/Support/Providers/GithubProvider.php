<?php

declare(strict_types=1);

namespace PrismAuth\Support\Providers;

final class GithubProvider extends OAuth2Provider
{
    protected function authorizeUrl(): string
    {
        return 'https://github.com/login/oauth/authorize';
    }

    protected function tokenUrl(): string
    {
        return 'https://github.com/login/oauth/access_token';
    }

    protected function defaultScopes(): string
    {
        return 'read:user user:email';
    }

    protected function profile(array $token, array $state): ExternalUser
    {
        $access = (string) $token['access_token'];
        $user = $this->getJson('https://api.github.com/user', $access);
        $id = self::string($user['id'] ?? null) ?? throw new SignInFailed('provider', 'GitHub gave no user id.');

        // The primary address, and whether GitHub has confirmed it.
        $email = self::string($user['email'] ?? null);
        $verified = false;
        try {
            foreach ($this->getJson('https://api.github.com/user/emails', $access) as $entry) {
                if (is_array($entry) && ($entry['primary'] ?? false) === true) {
                    $email = self::string($entry['email'] ?? null);
                    $verified = ($entry['verified'] ?? false) === true;
                }
            }
        } catch (SignInFailed) {
            // Without the user:email scope only the public address is known, unconfirmed.
        }

        return new ExternalUser(
            subject: $id,
            email: $email,
            emailVerified: $verified,
            name: self::string($user['name'] ?? null) ?? self::string($user['login'] ?? null),
            username: self::string($user['login'] ?? null),
            avatar: self::string($user['avatar_url'] ?? null),
        );
    }
}
