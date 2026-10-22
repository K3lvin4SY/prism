<?php

declare(strict_types=1);

namespace TerrariaSuite\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use TerrariaSuite\Support\Detector;
use TerrariaSuite\Support\EggConfig;
use TerrariaSuite\Support\SettingsSchema;
use TerrariaSuite\Support\TerrariaSettings;

class SettingsController extends Controller
{
    public function show(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'properties', 'properties');
        $settings = TerrariaSettings::load($server, $info['kind']);
        $bindings = EggConfig::bindings($server, $info['kind']);

        // What applies is the startup variable the egg passes on start, not the file.
        $values = $settings->all();
        $detector = Detector::for($server);
        foreach ($bindings as $key => $env) {
            $value = $env !== null ? $detector->variable($env) : null;
            if ($value !== null) {
                $values[$key] = EggConfig::settingValue($key, $value);
            }
        }

        return new JsonResponse([
            'kind' => $info['kind'],
            'exists' => $settings->exists(),
            'files' => $info['kind'] === 'tshock' ? array_values(TerrariaSettings::JSON_FILES) : [TerrariaSettings::SERVERCONFIG],
            'values' => (object) $values,
            // Keys the egg sets on start: from a startup variable, or fixed (null).
            'eggBindings' => (object) $bindings,
        ]);
    }

    /** Writes only the keys sent; every other line or key stays as it was. */
    public function update(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'properties', 'properties');
        $data = $request->validate(['values' => ['required', 'array', 'min:1', 'max:100']]);

        $settings = TerrariaSettings::load($server, $info['kind']);
        abort_unless($settings->exists(), 409, 'Start the server once so TShock writes its config files, then change them here.');

        $bindings = EggConfig::bindings($server, $info['kind']);
        $changed = [];
        foreach ($data['values'] as $key => $value) {
            $key = (string) $key;
            abort_if(array_key_exists($key, $bindings) && $bindings[$key] === null, 422, 'The egg sets '.$key.' itself on every start.');
            $normalized = SettingsSchema::normalize($info['kind'], $key, $value);

            // The egg passes this value on start, so its startup variable changes too.
            if (($bindings[$key] ?? null) !== null) {
                EggConfig::setVariable($server, $key, $bindings[$key], $normalized);
            }

            if ($settings->get($key) !== $normalized) {
                $settings->set($key, $normalized);
                $changed[$key] = $normalized;
            }
        }

        if ($changed !== []) {
            $settings->save();
            Activity::event('server:terraria-suite.settings.update')->property('keys', array_keys($changed))->log();
        }

        return new JsonResponse(['changed' => (object) $changed]);
    }
}
