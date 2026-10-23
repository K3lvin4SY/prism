<?php

declare(strict_types=1);

namespace PrismMc\Support;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerVariable;

/**
 * The egg's own rules for server.properties. Wings rewrites these keys on every start, either
 * from a startup variable or from a fixed value, so Prism MC has to follow them.
 */
final class EggConfig
{
    /**
     * Keys the egg sets on start: key → the startup variable it comes from, or null for a fixed value.
     *
     * @return array<string, string|null>
     */
    public static function propertyBindings(Server $server): array
    {
        $config = json_decode((string) ($server->egg?->inherit_config_files ?? ''), true);
        $find = $config['server.properties']['find'] ?? null;
        if (! is_array($find)) {
            return [];
        }

        $bindings = [];
        foreach ($find as $key => $value) {
            $bindings[(string) $key] = is_string($value) && preg_match('/^\{\{\s*(?:server\.build\.)?env\.([A-Za-z0-9_]+)\s*\}\}$/', $value, $match) ? $match[1] : null;
        }

        return $bindings;
    }

    /**
     * Saves a value into the startup variable a key comes from, checked against the variable's rules.
     *
     * @throws ValidationException
     */
    public static function setVariable(Server $server, string $key, string $env, string $value): void
    {
        $variable = $server->egg->variables()->where('env_variable', $env)->first();
        if ($variable === null) {
            return;
        }

        $validator = Validator::make(['value' => $value], ['value' => $variable->rules ?: 'nullable|string']);
        if ($validator->fails()) {
            throw ValidationException::withMessages(["values.$key" => 'The egg does not accept this value: '.$validator->errors()->first('value')]);
        }

        ServerVariable::query()->updateOrCreate(['server_id' => $server->id, 'variable_id' => $variable->id], ['variable_value' => $value]);
    }
}
