<?php

declare(strict_types=1);

namespace PrismBackups\Support;

use Illuminate\Http\Request;
use Pterodactyl\Models\Server;

final class Access
{
    public static function can(Request $request, Server $server, string $permission): bool
    {
        return (bool) $request->user()?->can($permission, $server);
    }

    public static function require(Request $request, Server $server, string $permission, string $message): void
    {
        abort_unless(self::can($request, $server, $permission), 403, $message);
    }

    /** Profiles, browsing and the rest; the admin can keep them to server owners. */
    public static function extras(Request $request, Server $server): bool
    {
        if (! Settings::bool('owners_only', false)) {
            return true;
        }

        $user = $request->user();

        return $user !== null && ($user->root_admin || $user->id === $server->owner_id);
    }

    /** Stops the request unless the admin allows the feature and this person gets the extras. */
    public static function feature(Request $request, Server $server, string $feature): void
    {
        abort_unless(Settings::bool('enabled', true) && Settings::bool($feature, true) && self::extras($request, $server), 403, 'The administrator has turned this off.');
    }
}
