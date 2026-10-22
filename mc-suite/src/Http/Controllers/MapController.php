<?php

declare(strict_types=1);

namespace McSuite\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use McSuite\Support\PlayerData;
use Pterodactyl\Models\Server;

/**
 * Region files for the player map. The browser decodes and draws them itself, so this only
 * finds the files and hands them over unchanged.
 */
class MapController extends Controller
{
    private const array DIMENSIONS = ['overworld', 'the_nether', 'the_end'];

    /** Region files are at most a few megabytes; anything far larger is not a region file. */
    private const int MAX_REGION = 40 * 1024 * 1024;

    public function regions(Request $request, Server $server, string $dimension): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'players', 'players-view');
        abort_unless($info['edition'] === 'java', 404, 'The map is only drawn for Java worlds.');
        abort_unless(in_array($dimension, self::DIMENSIONS, true), 404);

        $data = PlayerData::for($server, 'java');
        $folder = $data->regionFolder($dimension);
        $regions = [];

        foreach ($folder === null ? [] : $data->files()->list($folder) as $name => $file) {
            if ($file['file'] && $file['size'] > 8192 && preg_match('/^r\.(-?\d+)\.(-?\d+)\.mca$/', $name, $match)) {
                $regions[] = ['x' => (int) $match[1], 'z' => (int) $match[2], 'size' => $file['size'], 'modified' => $file['modified']];
            }
        }

        return new JsonResponse(['dimension' => $dimension, 'regions' => $regions]);
    }

    public function region(Request $request, Server $server, string $dimension, int $x, int $z): Response
    {
        $info = $this->authorizeFeature($request, $server, 'players', 'players-view');
        abort_unless($info['edition'] === 'java', 404);
        abort_unless(in_array($dimension, self::DIMENSIONS, true) && abs($x) < 100_000 && abs($z) < 100_000, 404);

        $data = PlayerData::for($server, 'java');
        $folder = $data->regionFolder($dimension);
        abort_if($folder === null, 404);

        $bytes = $data->files()->read("$folder/r.$x.$z.mca", self::MAX_REGION);
        abort_if($bytes === null, 404);

        return response($bytes, 200, [
            'Content-Type' => 'application/octet-stream',
            'Cache-Control' => 'private, max-age=120',
        ]);
    }
}
