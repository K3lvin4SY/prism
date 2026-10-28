<?php

declare(strict_types=1);

namespace PrismSatisfactory\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Pterodactyl\Models\Server;
use PrismSatisfactory\Support\Detector;

class InfoController extends Controller
{
    /**
     * What the server runs and which tabs it gets. Any user with access to the server may read
     * this, since the navigation needs it.
     */
    public function show(Request $request, Server $server): JsonResponse
    {
        return new JsonResponse(Detector::for($server)->info($request->boolean('refresh')));
    }
}
