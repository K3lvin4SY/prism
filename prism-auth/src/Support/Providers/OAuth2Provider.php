<?php

declare(strict_types=1);

namespace PrismAuth\Support\Providers;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use PrismAuth\Models\AuthProvider;
use Throwable;

/**
 * The authorization code flow with PKCE (S256), shared by every OAuth 2 and OpenID Connect
 * provider. Subclasses give the endpoints and read the profile.
 */
abstract class OAuth2Provider implements Provider
{
    public function __construct(protected readonly AuthProvider $provider) {}

    abstract protected function authorizeUrl(): string;

    abstract protected function tokenUrl(): string;

    abstract protected function defaultScopes(): string;

    /**
     * @param  array<string, mixed>  $token
     * @param  array{state: string, verifier: string, nonce: string}  $state
     */
    abstract protected function profile(array $token, array $state): ExternalUser;

    /**
     * Extra query values for the authorize address.
     *
     * @param  array{state: string, verifier: string, nonce: string}  $state
     * @return array<string, string>
     */
    protected function authorizeParameters(array $state): array
    {
        return [];
    }

    protected function scopes(): string
    {
        $scopes = trim((string) $this->provider->scopes);

        return $scopes !== '' ? $scopes : $this->defaultScopes();
    }

    public function redirect(array $state): string
    {
        $query = http_build_query([
            'response_type' => 'code',
            'client_id' => $this->provider->client_id,
            'redirect_uri' => $this->provider->callbackUrl(),
            'scope' => $this->scopes(),
            'state' => $state['state'],
            'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $state['verifier'], true)), '+/', '-_'), '='),
            'code_challenge_method' => 'S256',
            ...$this->authorizeParameters($state),
        ], '', '&', PHP_QUERY_RFC3986);

        $url = $this->authorizeUrl();

        return $url.(str_contains($url, '?') ? '&' : '?').$query;
    }

    public function user(Request $request, array $state): ExternalUser
    {
        if ($request->filled('error')) {
            throw new SignInFailed($request->query('error') === 'access_denied' ? 'cancelled' : 'provider', (string) $request->query('error_description', (string) $request->query('error')));
        }

        $code = $request->query('code');
        if (! is_string($code) || $code === '') {
            throw new SignInFailed('provider', 'The provider sent no code.');
        }

        try {
            $response = $this->http()->asForm()->post($this->tokenUrl(), [
                'grant_type' => 'authorization_code',
                'code' => $code,
                'redirect_uri' => $this->provider->callbackUrl(),
                'client_id' => $this->provider->client_id,
                'client_secret' => $this->provider->secret,
                'code_verifier' => $state['verifier'],
            ]);
        } catch (Throwable $exception) {
            throw new SignInFailed('unreachable', $exception->getMessage());
        }

        $token = $response->json();
        if (! $response->successful() || ! is_array($token) || ! is_string($token['access_token'] ?? null)) {
            throw new SignInFailed('provider', 'The provider refused the code: '.mb_substr($response->body(), 0, 300));
        }

        return $this->profile($token, $state);
    }

    protected function http(): PendingRequest
    {
        return Http::acceptJson()->timeout(10)->withUserAgent('Pterodactyl Prism Auth');
    }

    /** @return array<mixed> */
    protected function getJson(string $url, string $accessToken): array
    {
        try {
            $response = $this->http()->withToken($accessToken)->get($url);
        } catch (Throwable $exception) {
            throw new SignInFailed('unreachable', $exception->getMessage());
        }

        $data = $response->json();
        if (! $response->successful() || ! is_array($data)) {
            throw new SignInFailed('provider', 'The provider would not say who signed in: '.mb_substr($response->body(), 0, 300));
        }

        return $data;
    }

    protected static function string(mixed $value): ?string
    {
        return is_scalar($value) && (string) $value !== '' ? (string) $value : null;
    }
}
