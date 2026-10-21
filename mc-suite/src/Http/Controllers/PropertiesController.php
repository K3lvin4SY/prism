<?php

declare(strict_types=1);

namespace McSuite\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use McSuite\Support\Detector;
use McSuite\Support\PropertiesFile;
use McSuite\Support\PropertySchema;
use McSuite\Support\ServerFiles;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;

class PropertiesController extends Controller
{
    private const int MAX_FILE = 256_000;

    private const int MAX_ICON = 256_000;

    public function show(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'properties', 'properties');
        $files = ServerFiles::for($server);
        $content = $files->read('server.properties', self::MAX_FILE);
        $properties = new PropertiesFile($content ?? '', $info['edition'] === 'java');

        $values = [];
        foreach ($properties->all() as $key => $value) {
            if (! PropertySchema::isHidden($key)) {
                $values[$key] = $value;
            }
        }

        $icon = null;
        if ($info['edition'] === 'java') {
            $png = $files->read('server-icon.png', self::MAX_ICON);
            $icon = $png !== null ? 'data:image/png;base64,'.base64_encode($png) : null;
        }

        return new JsonResponse([
            'exists' => $content !== null,
            'edition' => $info['edition'],
            'software' => $info['software'],
            'values' => (object) $values,
            'icon' => $icon,
            'serverName' => $server->name,
            'canRename' => $request->user()->can('settings.rename', $server),
        ]);
    }

    /**
     * Writes only the keys sent. Everything else in the file keeps its exact text.
     */
    public function update(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'properties', 'properties');
        $data = $request->validate(['values' => ['required', 'array', 'min:1', 'max:100']]);

        $files = ServerFiles::for($server);
        $properties = new PropertiesFile($files->read('server.properties', self::MAX_FILE) ?? '', $info['edition'] === 'java');

        $changed = [];
        foreach ($data['values'] as $key => $value) {
            $key = (string) $key;
            $normalized = PropertySchema::normalize($info['edition'], $key, $value);
            if ($properties->get($key) !== $normalized) {
                $properties->set($key, $normalized);
                $changed[$key] = $normalized;
            }
        }

        if ($changed !== []) {
            $files->write('server.properties', $properties->toString());
            Activity::event('server:mc-suite.properties.update')->property('keys', array_keys($changed))->log();

            if (array_key_exists('level-name', $changed)) {
                Detector::forget($server);
            }
        }

        return new JsonResponse(['changed' => (object) $changed]);
    }

    /**
     * Stores a 64×64 PNG as server-icon.png. The browser crops and scales the image first.
     */
    public function updateIcon(Request $request, Server $server): Response
    {
        $info = $this->authorizeFeature($request, $server, 'properties', 'properties');
        abort_unless($info['edition'] === 'java', 404);

        $data = $request->validate(['image' => ['required', 'string', 'max:400000']]);
        $png = base64_decode((string) preg_replace('#^data:image/png;base64,#', '', $data['image']), true);

        abort_if($png === false || strlen($png) > self::MAX_ICON || ! str_starts_with($png, "\x89PNG\r\n\x1a\n"), 422, 'The icon must be a PNG image.');
        $size = @getimagesizefromstring($png);
        abort_unless($size !== false && $size[0] === 64 && $size[1] === 64, 422, 'The icon must be 64×64 pixels.');

        ServerFiles::for($server)->write('server-icon.png', $png);
        Activity::event('server:mc-suite.properties.icon')->log();

        return response()->noContent();
    }

    public function deleteIcon(Request $request, Server $server): Response
    {
        $info = $this->authorizeFeature($request, $server, 'properties', 'properties');
        abort_unless($info['edition'] === 'java', 404);

        ServerFiles::for($server)->delete('', ['server-icon.png']);
        Activity::event('server:mc-suite.properties.icon')->property('removed', true)->log();

        return response()->noContent();
    }
}
