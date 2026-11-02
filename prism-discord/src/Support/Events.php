<?php

declare(strict_types=1);

namespace PrismDiscord\Support;

use PrismDiscord\Jobs\SendDiscordMessage;
use PrismDiscord\Models\Hook;
use Pterodactyl\Models\Server;

/** The events a webhook can post, their default text and color, and sending one to a server's webhooks. */
final class Events
{
    /** Event => [label, default text, embed color]. */
    public const array ALL = [
        'start' => ['Server started', '{server} is online.', 0x22C55E],
        'stop' => ['Server stopped', '{server} was stopped.', 0x64748B],
        'crash' => ['Server crashed', '{server} crashed: it went down without anyone asking it to stop.', 0xEF4444],
        'backup.complete' => ['Backup finished', 'The backup "{backup}" of {server} finished.', 0x3B82F6],
        'backup.fail' => ['Backup failed', 'The backup "{backup}" of {server} failed.', 0xF59E0B],
        'install' => ['Install finished', '{server} finished installing.', 0xA855F7],
        'player.join' => ['Player joined', '{player} joined {server}.', 0x22C55E],
        'player.leave' => ['Player left', '{player} left {server}.', 0x94A3B8],
    ];

    /** Events read from the console, which only some games print. */
    public const array PLAYERS = ['player.join', 'player.leave'];

    /** Events the minute tick watches for. */
    public const array STATE = ['start', 'stop', 'crash'];

    /**
     * Queues the event for each of the server's enabled webhooks that posts it.
     *
     * @param  array<string, string>  $values  placeholders such as player and backup
     */
    public static function fire(Server $server, string $event, array $values = []): int
    {
        if (! Settings::bool('enabled') || ! isset(self::ALL[$event]) || (in_array($event, self::PLAYERS, true) && ! Settings::bool('players'))) {
            return 0;
        }

        $hooks = Hook::query()->where('server_id', $server->id)->where('enabled', true)->whereJsonContains('events', $event)->pluck('id');
        foreach ($hooks as $id) {
            SendDiscordMessage::dispatch((int) $id, $event, ['server' => $server->name, ...$values]);
        }

        return $hooks->count();
    }

    /**
     * The message for an event: its text with placeholders filled, each value escaped so a
     * player name cannot format the message or mention anyone.
     *
     * @param  array<string, string>  $values
     */
    public static function text(Hook $hook, string $event, array $values): string
    {
        $template = $hook->templates[$event] ?? self::ALL[$event][1] ?? '{server}';

        return preg_replace_callback('/\{(server|player|backup|event)\}/', static function (array $match) use ($values, $event): string {
            $value = $match[1] === 'event' ? (self::ALL[$event][0] ?? $event) : ($values[$match[1]] ?? '');

            return self::escape($value);
        }, $template) ?? $template;
    }

    /** Discord markdown and mention characters made literal. */
    public static function escape(string $value): string
    {
        return preg_replace('/([\\\\*_~`|>#\[\]()@<:-])/', '\\\\$1', $value) ?? $value;
    }
}
