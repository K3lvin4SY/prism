<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PrismCoreKeeper\Support\Detector;
use PrismCoreKeeper\Support\ServerFiles;
use PrismCoreKeeper\Support\StartHook;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerVariable;

/**
 * The world and server settings. The egg passes world name, slot, seed, mode, players and Game
 * ID on start, so those are its startup variables; the rest live in ServerConfig.json, which the
 * server reads on start and fills with what the egg passed.
 */
class PropertiesController extends Controller
{
    public const string CONFIG = StartHook::DATA.'/ServerConfig.json';

    /** Startup variable keys, with the ServerConfig.json key the server mirrors each into. */
    private const array VARIABLES = ['WORLD_NAME' => 'worldName', 'WORLD_INDEX' => 'world', 'WORLD_SEED' => 'worldSeed', 'WORLD_MODE' => 'worldMode', 'MAX_PLAYERS' => 'maxNumberPlayers', 'GAME_ID' => 'gameId'];

    private const array FILE_KEYS = ['password', 'seasonOverride', 'networkSendRate', 'maxNumberPacketsSentPerFrame'];

    public function show(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'properties', 'properties');
        $config = ServerFiles::for($server)->readJson(self::CONFIG);
        $detector = Detector::for($server);

        $values = [];
        foreach (self::FILE_KEYS as $key) {
            if (isset($config[$key])) {
                $values[$key] = (string) $config[$key];
            }
        }
        foreach (array_keys(self::VARIABLES) as $env) {
            $values[$env] = $detector->variable($env) ?? '';
        }

        return new JsonResponse([
            'kind' => 'corekeeper',
            'exists' => $config !== null,
            'files' => ['ServerConfig.json', 'the startup variables'],
            'values' => (object) $values,
            'eggBindings' => (object) array_combine(array_keys(self::VARIABLES), array_keys(self::VARIABLES)),
        ]);
    }

    /** Writes only the keys sent. */
    public function update(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'properties', 'properties');
        $data = $request->validate([
            'values' => ['required', 'array', 'min:1', 'max:20'],
            'values.WORLD_NAME' => ['sometimes', 'string', 'min:3', 'max:100', 'not_regex:/["`$\\\\\r\n]/'],
            'values.WORLD_INDEX' => ['sometimes', 'integer', 'min:0', 'max:29'],
            'values.WORLD_SEED' => ['sometimes', 'integer', 'min:0', 'max:4294967295'],
            'values.WORLD_MODE' => ['sometimes', 'in:0,1'],
            'values.MAX_PLAYERS' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'values.GAME_ID' => ['sometimes', 'nullable', 'regex:/^[A-NP-XZa-wz1-9]{28}$/'],
            'values.password' => ['sometimes', 'nullable', 'string', 'max:28', 'not_regex:/[\r\n"]/'],
            'values.seasonOverride' => ['sometimes', 'integer', 'min:-1', 'max:7'],
            'values.networkSendRate' => ['sometimes', 'integer', 'min:1', 'max:60'],
            'values.maxNumberPacketsSentPerFrame' => ['sometimes', 'integer', 'min:1', 'max:10'],
        ], [
            'values.GAME_ID.regex' => 'A Game ID is 28 letters and numbers, without Y, y, x, 0 or O.',
            'values.WORLD_NAME.not_regex' => 'The world name cannot have quotes, $, ` or backslashes.',
        ]);

        $values = $data['values'];
        $changed = [];
        foreach (self::VARIABLES as $env => $configKey) {
            if (! array_key_exists($env, $values)) {
                continue;
            }
            $variable = $server->egg->variables()->where('env_variable', $env)->first();
            abort_if($variable === null, 422, 'The egg has no '.$env.' variable.');
            ServerVariable::query()->updateOrCreate(['server_id' => $server->id, 'variable_id' => $variable->id], ['variable_value' => (string) ($values[$env] ?? '')]);
            $changed[$env] = (string) ($values[$env] ?? '');
        }

        $file = array_intersect_key($values, array_flip(self::FILE_KEYS));
        if ($file !== []) {
            $files = ServerFiles::for($server);
            $config = $files->readJson(self::CONFIG);
            abort_if($config === null, 409, 'Start the server once so it writes ServerConfig.json, then change these here.');
            foreach ($file as $key => $value) {
                $config[$key] = $key === 'password' ? (string) ($value ?? '') : (int) $value;
                $changed[$key] = (string) ($value ?? '');
            }
            $files->writeJson(self::CONFIG, $config);
        }

        Activity::event('server:prism-corekeeper.properties.update')->property('keys', array_keys($changed))->log();

        return new JsonResponse(['changed' => (object) $changed]);
    }
}
