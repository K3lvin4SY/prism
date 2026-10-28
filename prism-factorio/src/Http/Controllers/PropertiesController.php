<?php

declare(strict_types=1);

namespace PrismFactorio\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use PrismFactorio\Support\Detector;
use PrismFactorio\Support\ServerFiles;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerVariable;

/**
 * The server settings: data/server-settings.json, which the egg's startup passes to the game,
 * and the save it opens (the SAVE_NAME startup variable). The egg's file parser writes some of
 * the file's keys from startup variables on every start (name from SERVER_NAME, and so on), so
 * those are saved to their variable as well as to the file.
 */
class PropertiesController extends Controller
{
    public const string FILE = 'data/server-settings.json';

    /** Startup variables that are settings of their own rather than file keys. */
    private const array VARIABLES = ['SAVE_NAME'];

    /** Never sent to the browser; only whether one is saved. */
    private const array SECRETS = ['token'];

    public function show(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'properties', 'properties');
        $settings = ServerFiles::for($server)->readJson(self::FILE);
        $detector = Detector::for($server);
        $bindings = self::bindings($server);

        $values = [];
        $secrets = [];
        foreach (self::definitions() as $key => $definition) {
            $variable = $bindings[$key] ?? null;
            $value = $variable !== null ? $detector->variable($variable) : self::get($settings ?? [], $key);
            // A variable the egg has not set yet: the file has what the game uses.
            $value ??= self::get($settings ?? [], $key);
            if ($value === null) {
                continue;
            }
            if (in_array($key, self::SECRETS, true)) {
                $secrets[$key] = is_string($value) && $value !== '' && $value !== 'undefined';
                $values[$key] = '';

                continue;
            }
            $values[$key] = self::text($value);
        }

        return new JsonResponse([
            'kind' => 'factorio',
            'exists' => $settings !== null,
            'files' => ['data/server-settings.json', 'the startup variables'],
            'values' => (object) $values,
            'eggBindings' => (object) $bindings,
            'secrets' => (object) $secrets,
        ]);
    }

    /** Writes only the keys sent, and keeps everything else in the file as it was. */
    public function update(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'properties', 'properties');
        $data = $request->validate(['values' => ['required', 'array', 'min:1', 'max:40']]);
        $definitions = self::definitions();
        $bindings = self::bindings($server);

        $clean = [];
        foreach ($data['values'] as $key => $raw) {
            $definition = $definitions[$key] ?? throw ValidationException::withMessages(['values' => 'Unknown setting '.$key.'.']);
            abort_if(array_key_exists($key, $bindings) && $bindings[$key] === null, 422, $definition['label'].' is set by the egg on every start.');
            $clean[$key] = self::cast($definition, is_scalar($raw) || $raw === null ? (string) ($raw ?? '') : '');
        }

        $changed = [];
        foreach ($clean as $key => $value) {
            $env = $bindings[$key] ?? null;
            if ($env === null) {
                continue;
            }
            $variable = $server->egg->variables()->where('env_variable', $env)->first();
            abort_if($variable === null, 422, 'The egg has no '.$env.' variable.');
            ServerVariable::query()->updateOrCreate(['server_id' => $server->id, 'variable_id' => $variable->id], ['variable_value' => self::text($value)]);
            $changed[$key] = in_array($key, self::SECRETS, true) ? '' : self::text($value);
        }

        // The file too, so it is right before the next start; startup variables are not file keys.
        $file = array_diff_key($clean, array_flip(self::VARIABLES));
        if ($file !== []) {
            $files = ServerFiles::for($server);
            $settings = $files->readJson(self::FILE);
            abort_if($settings === null, 409, 'data/server-settings.json is missing. Reinstall the server so the egg writes it.');
            foreach ($file as $key => $value) {
                self::set($settings, $key, $value);
                $changed[$key] = in_array($key, self::SECRETS, true) ? '' : self::text($value);
            }
            $files->writeJson(self::FILE, $settings);
        }

        Detector::forget($server);
        Activity::event('server:prism-factorio.properties.update')->property('keys', array_keys($changed))->log();

        return new JsonResponse(['changed' => (object) $changed]);
    }

    /**
     * Settings the egg fills in on start: the startup variable each comes from, or null for a
     * fixed value. Read from the egg's file parser, so a changed egg is followed.
     *
     * @return array<string, string|null>
     */
    private static function bindings(Server $server): array
    {
        $bindings = array_combine(self::VARIABLES, self::VARIABLES);
        $config = json_decode((string) $server->egg?->inherit_config_files, true);
        foreach ($config[self::FILE]['find'] ?? [] as $key => $value) {
            $bindings[(string) $key] = is_string($value) && preg_match('/^\{\{\s*server\.build\.env\.([A-Z0-9_]+)\s*\}\}$/', $value, $match) ? $match[1] : null;
        }

        return $bindings;
    }

    /** A value as the browser shows it, and as a startup variable holds it. */
    private static function text(mixed $value): string
    {
        return match (true) {
            is_bool($value) => $value ? 'true' : 'false',
            is_array($value) => implode(', ', array_map('strval', $value)),
            default => (string) $value,
        };
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
    private static function cast(array $definition, string $value): mixed
    {
        $label = $definition['label'];
        $fail = static fn (string $message) => throw ValidationException::withMessages(['values.'.$definition['key'] => $label.': '.$message]);

        switch ($definition['type']) {
            case 'int':
                if (! preg_match('/^-?\d+$/', trim($value))) {
                    $fail('must be a whole number.');
                }
                $number = (int) $value;
                if ($number < ($definition['min'] ?? PHP_INT_MIN) || $number > ($definition['max'] ?? PHP_INT_MAX)) {
                    $fail('must be between '.$definition['min'].' and '.$definition['max'].'.');
                }

                return $number;
            case 'bool':
                in_array($value, ['true', 'false'], true) || $fail('must be on or off.');

                return $value === 'true';
            case 'enum':
                in_array($value, $definition['options'], true) || $fail('is not one of the choices.');

                // allow_commands is true, false or "admins-only" in the file.
                return match ($value) {
                    'true' => true,
                    'false' => false,
                    default => $value,
                };
            default:
                if (preg_match('/[\r\n]/', $value)) {
                    $fail('must be a single line.');
                }
                if (isset($definition['maxLength']) && mb_strlen($value) > $definition['maxLength']) {
                    $fail('use at most '.$definition['maxLength'].' characters.');
                }
                if (isset($definition['pattern']) && ! preg_match('/'.str_replace('/', '\/', $definition['pattern']).'/', $value)) {
                    $fail('does not have the right shape.');
                }
                if ($definition['key'] === 'tags') {
                    return array_values(array_filter(array_map('trim', explode(',', $value)), static fn (string $tag): bool => $tag !== ''));
                }

                return $value;
        }
    }

    /** A value by its key, where "visibility.public" is a key inside "visibility". */
    private static function get(array $settings, string $key): mixed
    {
        $value = $settings;
        foreach (explode('.', $key) as $part) {
            if (! is_array($value) || ! array_key_exists($part, $value)) {
                return null;
            }
            $value = $value[$part];
        }

        return $value;
    }

    private static function set(array &$settings, string $key, mixed $value): void
    {
        $target = &$settings;
        foreach (explode('.', $key) as $part) {
            if (! isset($target[$part]) || ! is_array($target[$part])) {
                $target[$part] ??= [];
            }
            $target = &$target[$part];
        }
        $target = $value;
    }
}
