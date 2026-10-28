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
            if (! self::sameIssuer($issuer, (string) ($document['issuer'] ?? ''))) {
                throw new SignInFailed('setup', 'The discovery document at '.$issuer.' is for another issuer.');
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
        if ($claims !== null) {
            $audience = (array) ($claims['aud'] ?? []);
            if (! is_string($claims['nonce'] ?? null) || ! hash_equals($state['nonce'], $claims['nonce'])) {
                throw new SignInFailed('state', 'The ID token was not made for this sign-in.');
            }
            if (! in_array((string) $this->provider->client_id, $audience, true) || ! self::sameIssuer((string) ($claims['iss'] ?? ''), (string) $this->discovery()['issuer'])) {
                throw new SignInFailed('provider', 'The ID token was not made for this panel.');
            }
        }

        $endpoint = $this->discovery()['userinfo_endpoint'] ?? null;
        if (! is_string($endpoint) && $claims === null) {
            throw new SignInFailed('provider', 'The provider has no userinfo endpoint and sent no ID token.');
        }
        $info = is_string($endpoint) ? $this->getJson($endpoint, (string) $token['access_token']) : $claims;
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
     * Whether an issuer is the expected one. Google's ID tokens may leave out the scheme, and
     * Entra ID's multi-tenant documents have a {tenantid} placeholder.
     */
    private static function sameIssuer(string $given, string $expected): bool
    {
        $given = rtrim($given, '/');
        $expected = rtrim($expected, '/');
        if ($expected === '') {
            return false;
        }
        if (! str_contains($given, '://')) {
            $given = 'https://'.$given;
        }
        $pattern = '#^'.str_replace(preg_quote('{tenantid}', '#'), '[^/]+', preg_quote($expected, '#')).'$#';

        return preg_match($pattern, $given) === 1;
    }

    /**
     * The ID token's claims, read without checking its signature: the token comes straight from
     * the token endpoint over TLS (OpenID Connect Core 3.1.3.7), and its nonce, audience and
     * issuer are checked.
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
