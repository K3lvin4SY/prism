<?php

declare(strict_types=1);

namespace PrismShare\Support;

use PrismShare\Models\Link;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/**
 * What a link may allow, and the panel permissions its maker needs for each. A link can never
 * do more than its maker may: this is checked when it is saved and again every time it is used,
 * so a maker who loses a permission takes it from their links too.
 */
final class Capabilities
{
    /** Option => the panel permissions it needs, and the admin setting that may switch it off. */
    public const array OPTIONS = [
        'console' => ['permissions' => ['websocket.connect'], 'setting' => null],
        'command' => ['permissions' => ['websocket.connect', 'control.console'], 'setting' => 'allow_commands'],
        'start' => ['permissions' => ['control.start'], 'setting' => 'allow_power'],
        'stop' => ['permissions' => ['control.stop'], 'setting' => 'allow_power'],
        'restart' => ['permissions' => ['control.restart'], 'setting' => 'allow_power'],
        'files' => ['permissions' => ['file.read', 'file.read-content'], 'setting' => 'allow_files'],
        'backups' => ['permissions' => ['backup.read', 'backup.download'], 'setting' => 'allow_backups'],
    ];

    /**
     * Each option, and why it cannot be given when it cannot.
     *
     * @return array<string, string|null> option => null when the user may give it, else the reason
     */
    public static function grantable(User $user, Server $server): array
    {
        $result = [];
        foreach (self::OPTIONS as $option => $definition) {
            $result[$option] = match (true) {
                $definition['setting'] !== null && ! Settings::bool($definition['setting']) => 'Your administrator does not allow this.',
                ! self::holds($user, $server, $definition['permissions']) => 'You do not have this permission on the server.',
                default => null,
            };
        }

        return $result;
    }

    /**
     * The options a link has right now: what it was given, less anything its maker or the admin
     * has since taken away.
     *
     * @return list<string>
     */
    public static function effective(Link $link): array
    {
        $grantable = self::grantable($link->user, $link->server);

        return array_values(array_filter(
            self::clean($link->permissions),
            static fn (string $option): bool => ($grantable[$option] ?? 'unknown') === null,
        ));
    }

    /**
     * Known options only, once each, in a fixed order; a command box needs the console.
     *
     * @param  array<mixed>  $options
     * @return list<string>
     */
    public static function clean(array $options): array
    {
        $clean = array_values(array_intersect(array_keys(self::OPTIONS), $options));
        if (in_array('command', $clean, true) && ! in_array('console', $clean, true)) {
            $clean = array_values(array_diff($clean, ['command']));
        }

        return $clean;
    }

    /** @param  list<string>  $permissions */
    private static function holds(User $user, Server $server, array $permissions): bool
    {
        foreach ($permissions as $permission) {
            if (! $user->can($permission, $server)) {
                return false;
            }
        }

        return true;
    }
}
