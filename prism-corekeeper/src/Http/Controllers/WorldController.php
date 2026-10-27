<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PrismCoreKeeper\Support\Detector;
use PrismCoreKeeper\Support\ServerFiles;
use PrismCoreKeeper\Support\Settings;
use PrismCoreKeeper\Support\StartHook;
use Pterodactyl\Models\Server;

class WorldController extends Controller
{
    /**
     * The saved worlds (worlds/<slot>.world.gzip) and any map files the server keeps
     * (<n>.mapparts.gzip, the explored map the game draws), looked for a few folders deep.
     */
    public function show(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'world', 'world');
        $files = ServerFiles::for($server);
        $detector = Detector::for($server);

        $worlds = [];
        foreach ($files->list(StartHook::DATA.'/worlds') as $name => $entry) {
            if ($entry['file'] && preg_match('/^(\d+)\.world\.gzip$/', $name, $match)) {
                $worlds[] = ['slot' => (int) $match[1], 'path' => StartHook::DATA.'/worlds/'.$name, 'size' => $entry['size'], 'modified' => $entry['modified']];
            }
        }
        usort($worlds, static fn (array $a, array $b): int => $a['slot'] <=> $b['slot']);

        $maps = [];
        $walk = function (string $directory, int $depth) use (&$walk, &$maps, $files): void {
            foreach ($files->list($directory) as $name => $entry) {
                $path = ServerFiles::join($directory, $name);
                if (! $entry['file']) {
                    if ($depth < 3 && ! in_array($name, ['mods', 'modloader', 'worlds'], true)) {
                        $walk($path, $depth + 1);
                    }
                } elseif (str_ends_with($name, '.mapparts.gzip') && count($maps) < 50) {
                    $maps[] = ['path' => $path, 'name' => $name, 'size' => $entry['size'], 'modified' => $entry['modified']];
                }
            }
        };
        $walk(StartHook::DATA, 0);

        $config = $files->readJson(StartHook::DATA.'/ServerConfig.json');

        return new JsonResponse([
            'slot' => (int) ($detector->variable('WORLD_INDEX') ?? 0),
            'name' => $detector->variable('WORLD_NAME') ?? ($config['worldName'] ?? null),
            'seed' => $detector->variable('WORLD_SEED') ?? ($config['worldSeed'] ?? null),
            'mode' => (int) ($detector->variable('WORLD_MODE') ?? ($config['worldMode'] ?? 0)),
            'worlds' => $worlds,
            'maps' => $maps,
            'maxBytes' => $this->maxBytes(),
        ]);
    }

    /** A world or map file for the browser: the map is drawn there, and worlds can be downloaded. */
    public function file(Request $request, Server $server): Response
    {
        $this->authorizeFeature($request, $server, 'world', 'world');
        $path = ServerFiles::normalize((string) $request->query('path', ''));
        abort_unless(str_starts_with($path, StartHook::DATA.'/') && ! str_contains($path, '..') && preg_match('/\.(world|mapparts)\.gzip$/', $path), 404, 'That is not a world or map file.');

        $files = ServerFiles::for($server);
        $size = $files->size($path);
        abort_if($size === null, 404, 'That file is gone.');
        abort_if($size > $this->maxBytes(), 413, 'That file is larger than the limit set in Prism Properties.');

        $content = $files->read($path, $this->maxBytes()) ?? '';

        return new Response($content, 200, [
            'Content-Type' => 'application/gzip',
            'Content-Disposition' => 'attachment; filename="'.basename($path).'"',
            'Cache-Control' => 'no-store',
        ]);
    }

    private function maxBytes(): int
    {
        return max(1, (int) Settings::admin('max_world_mb', 256)) * 1024 * 1024;
    }
}
