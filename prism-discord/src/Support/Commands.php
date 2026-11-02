<?php

declare(strict_types=1);

namespace PrismDiscord\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * The slash commands, and putting them on the administrator's Discord application. The minute
 * tick does it whenever the application, its token or the commands change.
 */
final class Commands
{
    /** Raised when the commands change, so they are put on Discord again. */
    private const int VERSION = 1;

    public const string API = 'https://discord.com/api/v10';

    /** @return list<array<string, mixed>> */
    public static function definitions(): array
    {
        $server = static fn (string $description): array => [['type' => 3, 'name' => 'server', 'description' => $description, 'required' => true, 'autocomplete' => true]];

        return [
            ['name' => 'start', 'description' => 'Start one of your servers.', 'type' => 1, 'options' => $server('The server to start')],
            ['name' => 'stop', 'description' => 'Stop one of your servers.', 'type' => 1, 'options' => $server('The server to stop')],
            ['name' => 'restart', 'description' => 'Restart one of your servers.', 'type' => 1, 'options' => $server('The server to restart')],
            ['name' => 'status', 'description' => 'Whether one of your servers is running.', 'type' => 1, 'options' => $server('The server to check')],
            ['name' => 'link', 'description' => 'Link this Discord account to your panel account.', 'type' => 1],
            ['name' => 'unlink', 'description' => 'Unlink this Discord account from your panel account.', 'type' => 1],
        ];
    }

    /** Whether the administrator filled in the application, its public key and its bot token. */
    public static function configured(): bool
    {
        return self::appId() !== '' && self::publicKey() !== '' && self::token() !== '';
    }

    public static function appId(): string
    {
        return trim((string) Settings::get('app_id'));
    }

    public static function publicKey(): string
    {
        return strtolower(trim((string) Settings::get('public_key')));
    }

    public static function token(): string
    {
        return trim((string) Settings::get('bot_token'));
    }

    /**
     * Puts the commands on Discord when they are not there yet for this application and token.
     * A failure is kept for the account page and tried again an hour later.
     */
    public static function sync(): void
    {
        if (! Settings::bool('enabled') || ! self::configured()) {
            return;
        }

        $want = hash('sha256', self::VERSION.'|'.self::appId().'|'.self::token());
        $state = Cache::get('prism-discord:commands');
        if (is_array($state) && ($state['hash'] ?? '') === $want && ($state['ok'] || time() - (int) $state['at'] < 3600)) {
            return;
        }

        try {
            $response = Http::timeout(15)->acceptJson()->withHeaders(['Authorization' => 'Bot '.self::token()])
                ->put(self::API.'/applications/'.self::appId().'/commands', self::definitions());
            $ok = $response->successful();
            $error = $ok ? null : 'Discord answered '.$response->status().($response->status() === 401 ? ': the bot token is wrong.' : '.');
        } catch (Throwable $exception) {
            $ok = false;
            $error = 'Discord could not be reached: '.mb_substr($exception->getMessage(), 0, 120);
        }

        Cache::forever('prism-discord:commands', ['hash' => $want, 'ok' => $ok, 'error' => $error, 'at' => time()]);
    }

    /** @return array{configured: bool, registered: bool, error: string|null} */
    public static function status(): array
    {
        $state = Cache::get('prism-discord:commands');
        $current = is_array($state) && ($state['hash'] ?? '') === hash('sha256', self::VERSION.'|'.self::appId().'|'.self::token());

        return [
            'configured' => self::configured(),
            'registered' => $current && (bool) $state['ok'],
            'error' => $current ? $state['error'] : null,
        ];
    }
}
