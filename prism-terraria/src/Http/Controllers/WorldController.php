<?php

declare(strict_types=1);

namespace PrismTerraria\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Pterodactyl\Models\Server;
use PrismTerraria\Support\Releases;
use PrismTerraria\Support\ServerFiles;
use PrismTerraria\Support\Settings;
use PrismTerraria\Support\Worlds;

/**
 * The world file. The browser reads it itself, for the details and the map, so the Panel
 * only says where it is and hands it over.
 */
class WorldController extends Controller
{
    public function show(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'world', 'world');
        $kind = $info['kind'];
        $folder = Worlds::folder($kind);
        $name = Worlds::name($server);
        $entries = ServerFiles::for($server)->list($folder);
        $world = $entries[$name.'.wld'] ?? null;
        $version = $world !== null ? Worlds::version($server, $kind) : null;

        return new JsonResponse([
            'name' => $name,
            'path' => Worlds::path($server, $kind),
            'exists' => $world !== null,
            'size' => $world['size'] ?? null,
            'modified' => $world['modified'] ?? null,
            'version' => $version,
            'terraria' => $version !== null ? Releases::terrariaForWorld($version) : null,
            'maxBytes' => $this->maxBytes(),
            // tModLoader keeps modded tiles and items in a .twld beside the world.
            'modData' => isset($entries[$name.'.twld']),
            'backup' => isset($entries[$name.'.wld.bak']),
        ]);
    }

    public function file(Request $request, Server $server): Response
    {
        $info = $this->authorizeFeature($request, $server, 'world', 'world');
        $path = Worlds::path($server, $info['kind']);
        $files = ServerFiles::for($server);

        $size = $files->size($path);
        abort_if($size === null, 404, 'The world has not been created yet. Start the server once to make it.');
        abort_if($size > $this->maxBytes(), 413, sprintf('The world file is %d MB, more than the %d MB an administrator allowed for the map.', (int) ceil($size / 1048576), (int) ($this->maxBytes() / 1048576)));

        $bytes = $files->read($path, $this->maxBytes());
        abort_if($bytes === null, 404, 'The world file could not be read.');

        return new Response($bytes, 200, [
            'Content-Type' => 'application/octet-stream',
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function maxBytes(): int
    {
        return max(4, min(512, (int) Settings::admin('max_world_mb', 256))) * 1048576;
    }
}
