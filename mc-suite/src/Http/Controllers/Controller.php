<?php

declare(strict_types=1);

namespace McSuite\Http\Controllers;

use Illuminate\Http\Request;
use McSuite\Support\Detector;
use Pterodactyl\Models\Server;

abstract class Controller
{
    /**
     * Stops the request unless the server has the feature and the user holds the permission.
     * Server owners and root admins pass every permission check.
     *
     * @return array<string, mixed> the server's detection result
     */
    protected function authorizeFeature(Request $request, Server $server, string $feature, string $permission): array
    {
        abort_unless($request->user()->can('ext.mc-suite.'.$permission, $server), 403, 'You do not have permission to do this.');

        $info = Detector::for($server)->info();
        abort_unless(($info['features'][$feature] ?? false) === true, 404, 'This is not available for this server.');

        return $info;
    }

    protected function can(Request $request, Server $server, string $permission): bool
    {
        return $request->user()->can(str_contains($permission, '.') ? $permission : 'ext.mc-suite.'.$permission, $server);
    }
}
