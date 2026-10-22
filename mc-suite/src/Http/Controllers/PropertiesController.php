<?php

declare(strict_types=1);

namespace McSuite\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use McSuite\Support\Detector;
use McSuite\Support\EggConfig;
use McSuite\Support\PropertySchema;
use McSuite\Support\PumpkinConfig;
use McSuite\Support\ServerFiles;
use McSuite\Support\ServerProperties;
use McSuite\Support\TomlLines;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;

class PropertiesController extends Controller
{
    private const int MAX_ICON = 256_000;

    public function show(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'properties', 'properties');
        $files = ServerFiles::for($server);
        $properties = ServerProperties::load($server, $info);

        $values = [];
        foreach ($properties->all() as $key => $value) {
            if (! PropertySchema::isHidden($key)) {
                $values[$key] = $value;
            }
        }

        $icon = null;
        if ($info['edition'] === 'java') {
            $png = $files->read($this->iconFile($properties), self::MAX_ICON);
            $icon = $png !== null ? 'data:image/png;base64,'.base64_encode($png) : null;
        }

        return new JsonResponse([
            'exists' => $properties->exists,
            'edition' => $info['edition'],
            // Which keys apply: Pumpkin has its own set, mapped onto pumpkin.toml.
            'schema' => $properties->schema($info['edition']),
            'file' => $properties->file,
            'software' => $info['software'],
            'values' => (object) $values,
            'icon' => $icon,
            'serverName' => $server->name,
            'canRename' => $request->user()->can('settings.rename', $server),
            // Keys the egg rewrites on start: from a startup variable, or fixed (null).
            'eggBindings' => (object) EggConfig::propertyBindings($server),
        ]);
    }

    /**
     * Writes only the keys sent. Everything else in the file keeps its exact text.
     */
    public function update(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'properties', 'properties');
        $data = $request->validate(['values' => ['required', 'array', 'min:1', 'max:100']]);

        $properties = ServerProperties::load($server, $info);
        $schema = $properties->schema($info['edition']);
        abort_if($properties->isPumpkin() && ! $properties->exists, 409, 'Start the server once so Pumpkin writes pumpkin.toml, then change its settings here.');

        $bindings = EggConfig::propertyBindings($server);
        $changed = [];
        foreach ($data['values'] as $key => $value) {
            $key = (string) $key;
            abort_if(array_key_exists($key, $bindings) && $bindings[$key] === null, 422, 'The egg sets '.$key.' itself on every start.');
            abort_if($properties->isPumpkin() && ! PumpkinConfig::supports($key), 422, 'Pumpkin has no '.$key.' setting.');
            $normalized = PropertySchema::normalize($schema, $key, $value);

            // The egg writes this key from a startup variable on start, so the variable changes too.
            if (($bindings[$key] ?? null) !== null) {
                EggConfig::setVariable($server, $key, $bindings[$key], $normalized);
            }
            if ($properties->get($key) !== $normalized) {
                $properties->set($key, $normalized);
                $changed[$key] = $normalized;
            }
        }

        // Pumpkin's line-editing console swallows what the Panel types into it, Stop included.
        if ($properties->isPumpkin() && $properties->get('console-tty') !== 'false') {
            $properties->set('console-tty', 'false');
            $changed['console-tty'] = 'false';
        }

        if ($changed !== []) {
            $properties->save();
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

        $properties = ServerProperties::load($server, $info);
        ServerFiles::for($server)->write($this->iconFile($properties), $png);
        if ($pumpkin = $properties->pumpkin()) {
            $pumpkin->setRaw('', 'use_favicon', 'true');
            $pumpkin->setRaw('', 'favicon_path', TomlLines::string($this->iconFile($properties)));
            $properties->save();
        }

        Activity::event('server:mc-suite.properties.icon')->log();

        return response()->noContent();
    }

    public function deleteIcon(Request $request, Server $server): Response
    {
        $info = $this->authorizeFeature($request, $server, 'properties', 'properties');
        abort_unless($info['edition'] === 'java', 404);

        $properties = ServerProperties::load($server, $info);
        ServerFiles::for($server)->delete('', [$this->iconFile($properties)]);
        // Without a path Pumpkin falls back to its own icon.
        if ($pumpkin = $properties->pumpkin()) {
            $pumpkin->removeRaw('', 'favicon_path');
            $properties->save();
        }

        Activity::event('server:mc-suite.properties.icon')->property('removed', true)->log();

        return response()->noContent();
    }

    /** Pumpkin reads its icon from favicon_path; MC Suite uses server-icon.png there too. */
    private function iconFile(ServerProperties $properties): string
    {
        $path = TomlLines::scalar($properties->pumpkin()?->getRaw('', 'favicon_path'));

        return $path !== null && $path !== '' ? ServerFiles::normalize($path) : 'server-icon.png';
    }
}
