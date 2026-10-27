<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PrismCoreKeeper\Support\Detector;
use PrismCoreKeeper\Support\MapSyncs;
use PrismCoreKeeper\Support\Players;
use PrismCoreKeeper\Support\ServerFiles;
use PrismCoreKeeper\Support\ServerMod;
use Pterodactyl\Models\Server;

/** The shared map of the Cartography Table, and who last added their map to it. */
class MapController extends Controller
{
    /** Map files bigger than this are not sent to the browser. */
    private const int MAX_BYTES = 128 * 1024 * 1024;

    public function show(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'world', 'world');
        ['online' => $online, 'history' => $history] = Players::observe($server);
        $mod = ServerMod::for($server);
        $mod->collect();
        $syncs = MapSyncs::for($server);
        $syncs->observe($online, $history);

        $latest = [];
        foreach ($syncs->latest() as $id => $sync) {
            $latest[] = ['id' => (string) $id, 'name' => (string) ($history[$id]['name'] ?? $sync['name']), 'at' => $sync['at'], 'exact' => $sync['exact'], 'online' => isset($online[$id])];
        }
        usort($latest, static fn (array $a, array $b): int => $b['at'] <=> $a['at']);

        $file = $syncs->file();

        return new JsonResponse([
            'slot' => $syncs->slot(),
            'world' => Detector::for($server)->variable('WORLD_NAME'),
            'map' => $file === null ? null : $file + ['tooLarge' => $file['size'] > self::MAX_BYTES],
            'latest' => $latest,
            'serverMod' => $mod->enabled(),
        ]);
    }

    /** The map file itself, drawn in the browser. */
    public function file(Request $request, Server $server): Response
    {
        $this->authorizeFeature($request, $server, 'world', 'world');
        $syncs = MapSyncs::for($server);
        $file = $syncs->file();
        abort_if($file === null, 404, 'Nobody has added their map at a Cartography Table yet.');
        abort_if($file['size'] > self::MAX_BYTES, 413, 'The shared map is too large to draw here.');

        return new Response(ServerFiles::for($server)->read($syncs->path(), self::MAX_BYTES) ?? '', 200, [
            'Content-Type' => 'application/gzip',
            'Cache-Control' => 'no-store',
        ]);
    }
}
