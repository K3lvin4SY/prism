<?php

declare(strict_types=1);

namespace McSuite\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use McSuite\Support\Detector;
use McSuite\Support\MinecraftPing;
use Pterodactyl\Models\Server;
use Throwable;

class InfoController extends Controller
{
    /**
     * What the server runs and which MC Suite tabs it gets. Any user with access to the
     * server may read this, since the navigation needs it.
     */
    public function show(Request $request, Server $server): JsonResponse
    {
        return new JsonResponse(Detector::for($server)->info($request->boolean('refresh')));
    }

    /**
     * A server-list ping: online players, slots, MOTD and version as players see them.
     */
    public function status(Request $request, Server $server): JsonResponse
    {
        $info = Detector::for($server)->info();
        abort_unless($info['minecraft'], 404);

        try {
            $status = MinecraftPing::for($server, $info['edition'])->status();
        } catch (Throwable) {
            $status = null;
        }

        return new JsonResponse(['online' => $status !== null, 'status' => $status]);
    }
}
