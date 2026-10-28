<?php

declare(strict_types=1);

namespace PrismSatisfactory\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Models\Server;
use RuntimeException;
use Throwable;

/**
 * The dedicated server's HTTPS API, on the game port (POST /api/v1 with {function, data}). Its
 * certificate is self-signed, so it is not verified.
 *
 * The Panel signs in as the server's administrator with the admin password, kept encrypted in the
 * server's metadata, and keeps the token it gets until the API turns it down. A new server has
 * no admin yet: claiming it names it and sets that password.
 */
final class ServerApi
{
    private const string PASSWORD = 'api.password';

    public function __construct(private readonly Server $server) {}

    public static function for(Server $server): self
    {
        return new self($server);
    }

    /**
     * Whether the API answers, and whether the server has an admin yet and the Panel can sign in.
     *
     * @return array{reachable: bool, claimed: bool|null, connected: bool}
     */
    public function status(): array
    {
        try {
            $this->call('HealthCheck', ['clientCustomData' => ''], null);
        } catch (Throwable) {
            return ['reachable' => false, 'claimed' => null, 'connected' => false];
        }

        // Only a server without an admin lets anyone in as its first admin.
        try {
            $this->call('PasswordlessLogin', ['MinimumPrivilegeLevel' => 'InitialAdmin'], null);
            $claimed = false;
        } catch (Throwable) {
            $claimed = true;
        }

        $connected = false;
        if ($claimed && $this->password() !== null) {
            try {
                $this->token();
                $connected = true;
            } catch (Throwable) {
                $connected = false;
            }
        }

        return ['reachable' => true, 'claimed' => $claimed, 'connected' => $connected];
    }

    /** Names a server that has no admin yet, and makes the Panel its admin with this password. */
    public function claim(string $name, string $password): void
    {
        try {
            $initial = $this->call('PasswordlessLogin', ['MinimumPrivilegeLevel' => 'InitialAdmin'], null)['authenticationToken'] ?? null;
        } catch (RuntimeException) {
            $initial = null;
        }
        throw_unless(is_string($initial), RuntimeException::class, 'The server already has an admin. Connect with its admin password instead.');
        $this->call('ClaimServer', ['ServerName' => $name, 'AdminPassword' => $password], $initial);
        $this->remember($password);
    }

    /** Signs in with the server's admin password, and keeps it for later. */
    public function connect(string $password): void
    {
        $this->login($password);
        $this->remember($password);
    }

    public function forgetPassword(): void
    {
        Settings::server($this->server)->forget(self::PASSWORD);
        Cache::forget($this->tokenKey());
    }

    /** Changes the admin password on the server, and the one the Panel keeps. */
    public function changeAdminPassword(string $password): void
    {
        $this->request('SetAdminPassword', ['Password' => $password, 'AuthenticationToken' => '']);
        $this->remember($password);
    }

    /**
     * A call as the administrator. A token the API no longer takes (after a restart or a new
     * admin password) is replaced once.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function request(string $function, array $data = []): array
    {
        try {
            return $this->call($function, $data, $this->token());
        } catch (UnauthorizedException) {
            Cache::forget($this->tokenKey());

            return $this->call($function, $data, $this->token());
        }
    }

    /** Where the API answers: the allocation's address, or the node's when that is 0.0.0.0. */
    private function url(): string
    {
        $allocation = $this->server->allocation;
        $ip = (string) $allocation?->ip;
        $host = $ip === '' || $ip === '0.0.0.0' || str_starts_with($ip, '127.') || $ip === '::' ? (string) $this->server->node->fqdn : $ip;

        return 'https://'.(str_contains($host, ':') ? '['.$host.']' : $host).':'.$allocation?->port.'/api/v1';
    }

    private function token(): string
    {
        $password = $this->password() ?? throw new RuntimeException('Connect the Panel to the server first, in Properties.');

        return Cache::remember($this->tokenKey(), 21600, fn (): string => $this->login($password));
    }

    private function login(string $password): string
    {
        $token = $this->call('PasswordLogin', ['MinimumPrivilegeLevel' => 'Administrator', 'Password' => $password], null)['authenticationToken'] ?? null;
        throw_unless(is_string($token), RuntimeException::class, 'The server did not accept the admin password.');

        return $token;
    }

    private function password(): ?string
    {
        $stored = Settings::server($this->server)->get(self::PASSWORD);
        if (! is_string($stored)) {
            return null;
        }

        try {
            return Crypt::decryptString($stored);
        } catch (Throwable) {
            return null;
        }
    }

    private function remember(string $password): void
    {
        Settings::server($this->server)->set(self::PASSWORD, Crypt::encryptString($password));
        Cache::forget($this->tokenKey());
    }

    private function tokenKey(): string
    {
        return 'ext:prism-satisfactory:token:'.$this->server->uuid;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function call(string $function, array $data, ?string $token): array
    {
        try {
            $response = Http::withoutVerifying()->acceptJson()->timeout(10)->connectTimeout(4)
                ->withHeaders($token !== null ? ['Authorization' => 'Bearer '.$token] : [])
                ->post($this->url(), ['function' => $function, 'data' => (object) $data]);
        } catch (Throwable $exception) {
            throw new RuntimeException('The server\'s API did not answer. Is the server running?', 0, $exception);
        }

        // Failures can come with any status, 200 included; the errorCode says what went wrong.
        $error = $response->json('errorCode');
        if ($response->status() === 401 || $response->status() === 403 || in_array($error, ['invalid_token', 'token_expired', 'insufficient_scope', 'wrong_password'], true)) {
            throw new UnauthorizedException((string) ($response->json('errorMessage') ?? 'Not allowed.'));
        }
        if (is_string($error)) {
            throw new RuntimeException('The server answered: '.($response->json('errorMessage') ?? $error));
        }
        // Calls that return nothing answer 204.
        if ($response->status() === 204) {
            return [];
        }
        if (! $response->successful()) {
            throw new RuntimeException('The server answered: '.($response->json('errorMessage') ?? $response->status()));
        }

        return (array) ($response->json('data') ?? []);
    }
}
