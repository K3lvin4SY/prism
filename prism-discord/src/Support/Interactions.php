<?php

declare(strict_types=1);

namespace PrismDiscord\Support;

use PrismDiscord\Models\Link;
use Pterodactyl\Contracts\Servers\ReadsServerState;
use Pterodactyl\Contracts\Servers\SendsServerPower;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Illuminate\Support\Facades\Auth;
use Throwable;

/**
 * Answers Discord's interactions: the commands and the server autocomplete. Every answer is
 * ephemeral, seen only by whoever typed the command, and mentions nobody.
 */
final class Interactions
{
    private const int PONG = 1;

    private const int MESSAGE = 4;

    private const int CHOICES = 8;

    private const int EPHEMERAL = 64;

    /** Power commands and the permission each needs. */
    private const array POWER = ['start' => 'control.start', 'stop' => 'control.stop', 'restart' => 'control.restart'];

    /**
     * Whether Discord signed the request: Ed25519 over the timestamp and the body, with the
     * application's public key. Requests older than five minutes are refused.
     */
    public static function verify(string $publicKey, string $signature, string $timestamp, string $body): bool
    {
        if (! ctype_xdigit($publicKey) || strlen($publicKey) !== 64 || ! ctype_xdigit($signature) || strlen($signature) !== 128 || ! ctype_digit($timestamp)) {
            return false;
        }
        if (abs(time() - (int) $timestamp) > 300) {
            return false;
        }

        try {
            return sodium_crypto_sign_verify_detached((string) hex2bin($signature), $timestamp.$body, (string) hex2bin($publicKey));
        } catch (Throwable) {
            return false;
        }
    }

    /**
     * @param  array<string, mixed>  $interaction
     * @return array<string, mixed>
     */
    public static function handle(array $interaction): array
    {
        $type = (int) ($interaction['type'] ?? 0);
        if ($type === 1) {
            return ['type' => self::PONG];
        }

        $discord = $interaction['member']['user'] ?? $interaction['user'] ?? [];
        $discordId = (string) ($discord['id'] ?? '');
        $name = (string) ($discord['global_name'] ?? $discord['username'] ?? '');
        $command = (string) ($interaction['data']['name'] ?? '');
        $options = collect($interaction['data']['options'] ?? [])->keyBy('name');

        if ($type === 4) {
            $user = $discordId === '' ? null : Accounts::user($discordId);

            return ['type' => self::CHOICES, 'data' => ['choices' => $user === null ? [] : self::choices($user, (string) ($options['server']['value'] ?? ''))]];
        }
        if ($type !== 2 || $discordId === '') {
            return self::reply('That is not something this panel answers.');
        }

        if (! Settings::bool('enabled')) {
            return self::reply('Discord commands are turned off on this panel.');
        }
        if ($command === 'link') {
            return self::reply(sprintf('Your code is **%s**. Enter it on your panel account, under Discord, within 10 minutes: %s/account/discord', Accounts::code($discordId, $name), rtrim((string) config('app.url'), '/')));
        }

        $user = Accounts::user($discordId);
        if ($command === 'unlink') {
            $removed = Link::query()->where('discord_id', $discordId)->delete();

            return self::reply($removed > 0 ? 'This Discord account is no longer linked to your panel account.' : (Accounts::viaAuth($discordId) !== null ? 'You sign in to the panel with this Discord account, so it stays linked. Remove Discord from your panel account\'s sign-in methods to unlink it.' : 'This Discord account is not linked.'));
        }
        if ($user === null) {
            return self::reply('This Discord account is not linked to a panel account yet. Type /link to get a code.');
        }

        $server = self::server($user, (string) ($options['server']['value'] ?? ''));
        if ($server === null) {
            return self::reply('No server of yours goes by that name. Pick one from the list as you type.');
        }

        if ($command === 'status') {
            try {
                $state = app(ReadsServerState::class)->read($server)->state;
            } catch (Throwable) {
                return self::reply(sprintf('%s could not be reached right now.', Events::escape($server->name)));
            }

            return self::reply(sprintf('%s is %s.', Events::escape($server->name), $state));
        }

        if (isset(self::POWER[$command])) {
            if (! $user->can(self::POWER[$command], $server)) {
                return self::reply(sprintf('You may not %s %s.', $command, Events::escape($server->name)));
            }
            if ($server->isSuspended() || ! $server->isInstalled()) {
                return self::reply(sprintf('%s is suspended or not installed yet.', Events::escape($server->name)));
            }
            try {
                // Recorded in the activity log as theirs, like a press of the button on the panel.
                Auth::setUser($user);
                app(SendsServerPower::class)->send($server, $command);
                Activity::event('server:prism-discord.command')->subject($server)->property(['command' => $command, 'discord' => $name])->log();
            } catch (Throwable) {
                return self::reply(sprintf('The node did not take the %s for %s. Try again in a moment.', $command, Events::escape($server->name)));
            }

            return self::reply(match ($command) {
                'start' => sprintf('Starting %s.', Events::escape($server->name)),
                'stop' => sprintf('Stopping %s.', Events::escape($server->name)),
                default => sprintf('Restarting %s.', Events::escape($server->name)),
            });
        }

        return self::reply('That command is not known here.');
    }

    /** @return array<string, mixed> */
    private static function reply(string $content): array
    {
        return ['type' => self::MESSAGE, 'data' => ['content' => $content, 'flags' => self::EPHEMERAL, 'allowed_mentions' => ['parse' => []]]];
    }

    /**
     * Up to 25 of the user's servers whose name or short id has the typed text.
     *
     * @return list<array{name: string, value: string}>
     */
    private static function choices(User $user, string $typed): array
    {
        $typed = trim($typed);

        return $user->accessibleServers()
            ->when($typed !== '', fn ($query) => $query->where(fn ($query) => $query->where('servers.name', 'like', '%'.addcslashes($typed, '%_\\').'%')->orWhere('servers.uuidShort', 'like', addcslashes($typed, '%_\\').'%')))
            ->orderBy('servers.name')->limit(25)->get()
            ->map(static fn (Server $server): array => ['name' => mb_substr($server->name.' ('.$server->uuidShort.')', 0, 100), 'value' => $server->uuidShort])
            ->values()->all();
    }

    /** One of the user's servers, by short id (as autocomplete fills it in) or exact name. */
    private static function server(User $user, string $value): ?Server
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        return $user->accessibleServers()->where('servers.uuidShort', $value)->first()
            ?? $user->accessibleServers()->where('servers.name', $value)->first();
    }
}
