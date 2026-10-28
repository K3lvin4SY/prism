<?php

declare(strict_types=1);

namespace PrismAuth\Support\Providers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use PrismAuth\Models\AuthProvider;
use Throwable;

/**
 * Steam signs in with OpenID 2.0: the answer is checked by asking Steam whether it sent it.
 * Steam shares no email address. With a Steam Web API key (the secret field) the name and
 * avatar are filled in too.
 */
final class SteamProvider implements Provider
{
    private const string ENDPOINT = 'https://steamcommunity.com/openid/login';

    public function __construct(private readonly AuthProvider $provider) {}

    private function returnTo(string $state): string
    {
        return $this->provider->callbackUrl().'?state='.rawurlencode($state);
    }

    public function redirect(array $state): string
    {
        return self::ENDPOINT.'?'.http_build_query([
            'openid.ns' => 'http://specs.openid.net/auth/2.0',
            'openid.mode' => 'checkid_setup',
            'openid.return_to' => $this->returnTo($state['state']),
            'openid.realm' => url('/'),
            'openid.identity' => 'http://specs.openid.net/auth/2.0/identifier_select',
            'openid.claimed_id' => 'http://specs.openid.net/auth/2.0/identifier_select',
        ]);
    }

    public function user(Request $request, array $state): ExternalUser
    {
        // PHP turns the dots of openid.* into underscores, so the raw query is read instead.
        $params = [];
        foreach (explode('&', (string) $request->server('QUERY_STRING')) as $pair) {
            [$key, $value] = explode('=', $pair, 2) + [1 => ''];
            $key = urldecode($key);
            if (str_starts_with($key, 'openid.')) {
                $params[$key] = urldecode($value);
            }
        }

        if (($params['openid.mode'] ?? '') === 'cancel') {
            throw new SignInFailed('cancelled');
        }
        if (($params['openid.return_to'] ?? '') !== $this->returnTo($state['state']) || ($params['openid.op_endpoint'] ?? '') !== self::ENDPOINT) {
            throw new SignInFailed('state', 'The Steam answer was not for this sign-in.');
        }
        if (($params['openid.ns'] ?? '') !== 'http://specs.openid.net/auth/2.0' || ($params['openid.mode'] ?? '') !== 'id_res') {
            throw new SignInFailed('provider', 'Steam sent an answer that is not a sign-in.');
        }
        if (! preg_match('#^https://steamcommunity\.com/openid/id/(\d{17})$#', $params['openid.claimed_id'] ?? '', $match) || ($params['openid.identity'] ?? '') !== $params['openid.claimed_id']) {
            throw new SignInFailed('provider', 'Steam gave no Steam ID.');
        }
        // Steam's check only covers the signed fields, so the ones read here must be among them.
        $signed = explode(',', $params['openid.signed'] ?? '');
        if (array_diff(['op_endpoint', 'return_to', 'response_nonce', 'assoc_handle', 'claimed_id', 'identity'], $signed) !== []) {
            throw new SignInFailed('provider', 'Steam did not sign the Steam ID.');
        }

        try {
            $check = Http::asForm()->timeout(10)->post(self::ENDPOINT, ['openid.mode' => 'check_authentication'] + $params);
        } catch (Throwable $exception) {
            throw new SignInFailed('unreachable', $exception->getMessage());
        }
        if (! preg_match('/^is_valid\s*:\s*true\s*$/m', $check->body())) {
            throw new SignInFailed('provider', 'Steam did not confirm the sign-in.');
        }

        [$name, $avatar] = $this->summary($match[1]);

        return new ExternalUser(subject: $match[1], email: null, emailVerified: false, name: $name, username: null, avatar: $avatar);
    }

    /** @return array{0: string|null, 1: string|null} */
    private function summary(string $id): array
    {
        $key = $this->provider->secret;
        if ($key === null || $key === '') {
            return [null, null];
        }

        try {
            $player = Http::timeout(8)->get('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/', ['key' => $key, 'steamids' => $id])->json('response.players.0');
        } catch (Throwable) {
            return [null, null];
        }

        return is_array($player) ? [isset($player['personaname']) ? (string) $player['personaname'] : null, isset($player['avatarfull']) ? (string) $player['avatarfull'] : null] : [null, null];
    }
}
