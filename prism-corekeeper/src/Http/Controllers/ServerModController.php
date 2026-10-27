<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PrismCoreKeeper\Support\ServerConsole;
use PrismCoreKeeper\Support\ServerMod;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;

/** Turns the Prism server mod on or off for a server (the Properties tab). */
class ServerModController extends Controller
{
    public function show(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'properties', 'properties');

        return new JsonResponse($this->state($server));
    }

    public function update(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'properties', 'properties');
        $enabled = (bool) $request->validate(['enabled' => ['required', 'boolean']])['enabled'];

        $mod = ServerMod::for($server);
        $enabled ? $mod->install() : $mod->remove();
        Activity::event('server:prism-corekeeper.servermod.'.($enabled ? 'enable' : 'disable'))->log();

        return new JsonResponse($this->state($server));
    }

    /** @return array<string, mixed> */
    private function state(Server $server): array
    {
        $mod = ServerMod::for($server);
        $installed = $mod->installedVersion();

        return [
            'enabled' => $mod->enabled(),
            'installed' => $installed,
            'version' => ServerMod::VERSION,
            'outdated' => $mod->enabled() && $installed !== ServerMod::VERSION,
            'running' => ServerConsole::for($server)->isRunning(),
        ];
    }
}
