<?php

declare(strict_types=1);

namespace PrismAuth\Support\Providers;

use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * Any OpenID Connect provider (Google, Authentik, Keycloak, Authelia, Zitadel, Entra ID, ...),
 * found through its discovery document. Who signed in comes from the userinfo endpoint, asked
 * with the access token the provider just gave us over TLS; the ID token's nonce is checked too.
 */
class OidcProvider extends OAuth2Provider
{
    protected function issuer(): string
    {
        return rtrim(trim((string) $this->provider->issuer), '/');
    }

    /** @return array<string, mixed> */
    public function discovery(bool $fresh = false): array
    {
        $issuer = $this->issuer();
        if (! str_starts_with($issuer, 'https://')) {
            throw new SignInFailed('setup', 'The issuer must be an https:// address.');
        }

        $key = 'prism-auth:oidc:'.sha1($issuer);
        if ($fresh) {
            Cache::forget($key);
        }

        return Cache::remember($key, 3600, function () use ($issuer): array {
            try {
                $response = $this->http()->get($issuer.'/.well-known/openid-configuration');
            } catch (Throwable $exception) {
                throw new SignInFailed('unreachable', $exception->getMessage());
            }
            $document = $response->json();
            if (! $response->successful() || ! is_array($document) || ! is_string($document['authorization_endpoint'] ?? null) || ! is_string($document['token_endpoint'] ?? null)) {
                throw new SignInFailed('setup', 'No OpenID Connect discovery document at '.$issuer.'/.well-known/openid-configuration.');
            }

            return $document;
        });
    }

    protected function authorizeUrl(): string
    {
        return (string) $this->discovery()['authorization_endpoint'];
    }

    protected function tokenUrl(): string
    {
        return (string) $this->discovery()['token_endpoint'];
    }

    protected function defaultScopes(): string
    {
        return 'openid email profile';
    }

    protected function authorizeParameters(array $state): array
    {
        return ['nonce' => $state['nonce']];
    }

    protected function profile(array $token, array $state): ExternalUser
    {
        $claims = self::claims($token['id_token'] ?? null);
        if ($claims !== null && isset($claims['nonce']) && ! hash_equals($state['nonce'], (string) $claims['nonce'])) {
            throw new SignInFailed('state', 'The ID token was not made for this sign-in.');
        }

        $endpoint = $this->discovery()['userinfo_endpoint'] ?? null;
        $info = is_string($endpoint) ? $this->getJson($endpoint, (string) $token['access_token']) : ($claims ?? []);
        $subject = self::string($info['sub'] ?? null);
        if ($subject === null || ($claims !== null && isset($claims['sub']) && (string) $claims['sub'] !== $subject)) {
            throw new SignInFailed('provider', 'The provider gave no consistent subject.');
        }

        $verified = $info['email_verified'] ?? $claims['email_verified'] ?? false;

        return new ExternalUser(
            subject: $subject,
            email: self::string($info['email'] ?? null),
            emailVerified: $verified === true || $verified === 'true',
            name: self::string($info['name'] ?? null),
            username: self::string($info['preferred_username'] ?? $info['nickname'] ?? null),
            avatar: self::string($info['picture'] ?? null),
        );
    }

    /**
     * The ID token's claims, read without checking its signature: they are only compared with
     * the nonce and the subject from userinfo, never trusted on their own.
     *
     * @return array<string, mixed>|null
     */
    private static function claims(mixed $jwt): ?array
    {
        if (! is_string($jwt) || substr_count($jwt, '.') !== 2) {
            return null;
        }
        $payload = json_decode((string) base64_decode(strtr(explode('.', $jwt)[1], '-_', '+/'), true), true);

        return is_array($payload) ? $payload : null;
    }
}
