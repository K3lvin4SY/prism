<?php

declare(strict_types=1);

namespace PrismSatisfactory\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use PrismSatisfactory\Support\Detector;
use PrismSatisfactory\Support\ServerApi;
use PrismSatisfactory\Support\ServerConsole;
use PrismSatisfactory\Support\Settings;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerVariable;
use RuntimeException;
use Throwable;

/**
 * The server settings. Satisfactory keeps most of them itself and changes them through its
 * HTTPS API (the server options, the name and the passwords), so the Panel signs in to it as
 * the admin. The rest are the egg's startup variables, which the egg writes to Game.ini and
 * Engine.ini on every start.
 */
class PropertiesController extends Controller
{
    /** Settings that are startup variables. */
    private const array VARIABLES = ['MAX_PLAYERS', 'NUM_AUTOSAVES', 'INIT_CONNECT_TIMEOUT', 'CONNECT_TIMEOUT'];

    /** Never read back; only set. */
    private const array SECRETS = ['ClientPassword', 'AdminPassword'];

    /** Starting locations for a new game. */
    public const array LOCATIONS = ['Grass Fields', 'Rocky Desert', 'Northern Forest', 'Dune Desert'];

    public function show(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'properties', 'properties');
        $api = ServerApi::for($server);
        $running = ServerConsole::for($server)->isRunning();
        $status = $running ? $api->status() : ['reachable' => false, 'claimed' => null, 'connected' => false];
        $detector = Detector::for($server);

        $values = [];
        foreach (self::VARIABLES as $env) {
            $values[$env] = $detector->variable($env) ?? '';
        }
        $values['ServerName'] = (string) (Settings::server($server)->get('api.name') ?? '');

        $game = null;
        $sessions = [];
        if ($status['connected']) {
            try {
                $options = $api->request('GetServerOptions')['serverOptions'] ?? [];
                foreach ($options as $key => $value) {
                    $values[$key] = match (true) {
                        $value === 'True' => 'true',
                        $value === 'False' => 'false',
                        // "300.0" seconds and minutes are whole numbers here.
                        is_numeric($value) => (string) (int) round((float) $value),
                        default => (string) $value,
                    };
                }
                $state = $api->request('QueryServerState')['serverGameState'] ?? [];
                $game = [
                    'running' => (bool) ($state['isGameRunning'] ?? false),
                    'session' => (string) ($state['activeSessionName'] ?? ''),
                    'autoLoad' => (string) ($state['autoLoadSessionName'] ?? ''),
                    'tier' => (int) ($state['techTier'] ?? 0),
                    'duration' => (int) ($state['totalGameDuration'] ?? 0),
                ];
                foreach ($api->request('EnumerateSessions')['sessions'] ?? [] as $session) {
                    $saves = array_map(static fn (array $save): array => [
                        'name' => (string) ($save['saveName'] ?? ''),
                        'saved' => strtotime((string) ($save['saveDateTime'] ?? '')) ?: null,
                        'playTime' => (int) ($save['playDurationSeconds'] ?? 0),
                    ], array_values(array_filter($session['saveHeaders'] ?? [], 'is_array')));
                    $sessions[] = ['name' => (string) ($session['sessionName'] ?? ''), 'saves' => array_slice($saves, 0, 10)];
                }
            } catch (Throwable $exception) {
                $status['error'] = $exception->getMessage();
            }
        }

        return new JsonResponse([
            'kind' => 'satisfactory',
            'exists' => true,
            'running' => $running,
            'api' => $status,
            'files' => ['the server', 'the startup variables'],
            'values' => (object) $values,
            'eggBindings' => (object) array_combine(self::VARIABLES, self::VARIABLES),
            // Whether there is a join password is not something the API tells.
            'secrets' => (object) ['AdminPassword' => $status['connected']],
            'game' => $game,
            'sessions' => $sessions,
            'locations' => self::LOCATIONS,
        ]);
    }

    /**
     * Saves the keys sent: startup variables directly, the rest through the API. Server options
     * that need a restart apply when the server next restarts.
     */
    public function update(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'properties', 'properties');
        $data = $request->validate(['values' => ['required', 'array', 'min:1', 'max:30']]);
        $definitions = self::definitions();

        $clean = [];
        foreach ($data['values'] as $key => $raw) {
            if ($key === 'autoLoadSessionName') {
                abort_unless(is_string($raw) && mb_strlen($raw) <= 100 && ! preg_match('/[\r\n]/', $raw), 422, 'That is not a session name.');
                $clean[$key] = $raw;

                continue;
            }
            $definition = $definitions[$key] ?? throw ValidationException::withMessages(['values' => 'Unknown setting '.$key.'.']);
            $clean[$key] = self::check($definition, is_scalar($raw) || $raw === null ? (string) ($raw ?? '') : '');
        }

        $changed = [];
        foreach (self::VARIABLES as $env) {
            if (! array_key_exists($env, $clean)) {
                continue;
            }
            $variable = $server->egg->variables()->where('env_variable', $env)->first();
            abort_if($variable === null, 422, 'The egg has no '.$env.' variable.');
            ServerVariable::query()->updateOrCreate(['server_id' => $server->id, 'variable_id' => $variable->id], ['variable_value' => $clean[$env]]);
            $changed[$env] = $clean[$env];
            unset($clean[$env]);
        }

        if ($clean !== []) {
            $api = ServerApi::for($server);
            $this->call(function () use ($api, $server, $clean, &$changed): void {
                $options = [];
                foreach ($clean as $key => $value) {
                    if (str_starts_with($key, 'FG.')) {
                        $options[$key] = match ($value) {
                            'true' => 'True',
                            'false' => 'False',
                            default => $value,
                        };
                        $changed[$key] = $value;
                    }
                }
                if ($options !== []) {
                    $api->request('ApplyServerOptions', ['UpdatedServerOptions' => $options]);
                }
                if (isset($clean['ServerName'])) {
                    $api->request('RenameServer', ['ServerName' => $clean['ServerName']]);
                    Settings::server($server)->set('api.name', $clean['ServerName']);
                    $changed['ServerName'] = $clean['ServerName'];
                }
                if (array_key_exists('ClientPassword', $clean)) {
                    $api->request('SetClientPassword', ['Password' => $clean['ClientPassword']]);
                    $changed['ClientPassword'] = '';
                }
                if (array_key_exists('autoLoadSessionName', $clean)) {
                    $api->request('SetAutoLoadSessionName', ['SessionName' => $clean['autoLoadSessionName']]);
                    $changed['autoLoadSessionName'] = $clean['autoLoadSessionName'];
                }
                // Last: it signs every other token out.
                if (isset($clean['AdminPassword']) && $clean['AdminPassword'] !== '') {
                    $api->changeAdminPassword($clean['AdminPassword']);
                    $changed['AdminPassword'] = '';
                }
            });
        }

        Activity::event('server:prism-satisfactory.properties.update')->property('keys', array_keys($changed))->log();

        return new JsonResponse(['changed' => (object) $changed]);
    }

    /** Signs in to the server's API with its admin password, and keeps the password. */
    public function connect(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'properties', 'properties');
        $data = $request->validate(['password' => ['required', 'string', 'max:100']]);
        $this->call(static fn () => ServerApi::for($server)->connect($data['password']));
        Activity::event('server:prism-satisfactory.api.connect')->log();

        return new JsonResponse(['connected' => true]);
    }

    /** Claims a new server: gives it a name and an admin password, which the Panel keeps. */
    public function claim(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'properties', 'properties');
        $data = $request->validate([
            'name' => ['required', 'string', 'min:1', 'max:100', 'not_regex:/[\r\n]/'],
            'password' => ['required', 'string', 'min:6', 'max:100'],
        ]);
        $this->call(static fn () => ServerApi::for($server)->claim($data['name'], $data['password']));
        Settings::server($server)->set('api.name', $data['name']);
        Activity::event('server:prism-satisfactory.api.claim')->property('name', $data['name'])->log();

        return new JsonResponse(['connected' => true]);
    }

    /** Forgets the admin password; the server keeps it. */
    public function disconnect(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'properties', 'properties');
        ServerApi::for($server)->forgetPassword();
        Activity::event('server:prism-satisfactory.api.disconnect')->log();

        return new JsonResponse(['connected' => false]);
    }

    /** Starts a new game, as the game's server manager does: a session at a starting location. */
    public function newGame(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'properties', 'properties');
        $data = $request->validate([
            'session' => ['required', 'string', 'min:1', 'max:60', 'regex:/^[A-Za-z0-9 _.-]+$/'],
            'location' => ['required', 'string', 'in:'.implode(',', self::LOCATIONS)],
            'skipTutorial' => ['sometimes', 'boolean'],
        ]);
        $this->call(static fn () => ServerApi::for($server)->request('CreateNewGame', ['NewGameData' => [
            'SessionName' => $data['session'],
            'MapName' => '',
            'StartingLocation' => $data['location'],
            'bSkipOnboarding' => (bool) ($data['skipTutorial'] ?? true),
            'AdvancedGameSettings' => (object) [],
            'CustomOptionsOnlyForModding' => (object) [],
            // Builds from 2026 on want this too; empty is the standard game.
            'GameModeSettings' => (object) [],
        ]]));
        Activity::event('server:prism-satisfactory.game.new')->property($data)->log();

        return new JsonResponse(['started' => true]);
    }

    public function saveGame(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'properties', 'properties');
        $data = $request->validate(['name' => ['required', 'string', 'min:1', 'max:60', 'regex:/^[A-Za-z0-9 _.-]+$/']]);
        $this->call(static fn () => ServerApi::for($server)->request('SaveGame', ['SaveName' => $data['name']]));
        Activity::event('server:prism-satisfactory.game.save')->property($data)->log();

        return new JsonResponse(['saved' => true]);
    }

    /**
     * The settings the Properties tab describes, from the same file the browser uses.
     *
     * @return array<string, array<string, mixed>>
     */
    private static function definitions(): array
    {
        static $definitions = null;
        if ($definitions === null) {
            $schema = json_decode((string) file_get_contents(dirname(__DIR__, 3).'/resources/settings.json'), true);
            $definitions = array_column($schema['settings'] ?? [], null, 'key');
        }

        return $definitions;
    }

    /** @param  array<string, mixed>  $definition */
    private static function check(array $definition, string $value): string
    {
        $label = $definition['label'];
        $fail = static fn (string $message) => throw ValidationException::withMessages(['values.'.$definition['key'] => $label.': '.$message]);

        switch ($definition['type']) {
            case 'int':
                if (! preg_match('/^-?\d+$/', trim($value))) {
                    $fail('must be a whole number.');
                }
                if ((int) $value < ($definition['min'] ?? PHP_INT_MIN) || (int) $value > ($definition['max'] ?? PHP_INT_MAX)) {
                    $fail('must be between '.$definition['min'].' and '.$definition['max'].'.');
                }

                return (string) (int) $value;
            case 'bool':
                in_array($value, ['true', 'false'], true) || $fail('must be on or off.');

                return $value;
            case 'enum':
                in_array($value, $definition['options'], true) || $fail('is not one of the choices.');

                return $value;
            default:
                if (preg_match('/[\r\n]/', $value)) {
                    $fail('must be a single line.');
                }
                if (isset($definition['maxLength']) && mb_strlen($value) > $definition['maxLength']) {
                    $fail('use at most '.$definition['maxLength'].' characters.');
                }

                return $value;
        }
    }

    private function call(callable $call): mixed
    {
        try {
            return $call();
        } catch (RuntimeException $exception) {
            abort(502, $exception->getMessage());
        }
    }
}
