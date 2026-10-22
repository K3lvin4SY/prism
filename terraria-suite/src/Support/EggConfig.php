<?php

declare(strict_types=1);

namespace TerrariaSuite\Support;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerVariable;

/**
 * Settings the egg decides itself, so Terraria Suite has to change them through the egg:
 *  - keys its config parser writes into serverconfig.txt on every start (the vanilla egg), and
 *  - start-up arguments such as -motd "{{MOTD}}", which override the config file.
 */
final class EggConfig
{
    /** Start-up flags and the setting each one overrides. */
    private const array FLAGS = [
        'maxplayers' => 'maxplayers',
        'players' => 'maxplayers',
        'password' => 'password',
        'pass' => 'password',
        'motd' => 'motd',
        'lang' => 'language',
        'worldname' => 'worldname',
        'autocreate' => 'autocreate',
        'seed' => 'seed',
        'port' => 'port',
        'world' => 'world',
    ];

    /** TShock reads these from its own config, but the start-up arguments win. */
    private const array TSHOCK_FLAGS = [
        'maxplayers' => 'tshock.MaxSlots',
        'players' => 'tshock.MaxSlots',
        'port' => 'tshock.ServerPort',
        'password' => 'tshock.ServerPassword',
    ];

    /**
     * Keys the egg sets: key → the startup variable it comes from, or null when it is fixed.
     *
     * @return array<string, string|null>
     */
    public static function bindings(Server $server, string $kind): array
    {
        $bindings = [];

        $config = json_decode((string) ($server->egg?->inherit_config_files ?? ''), true);
        foreach ($config['serverconfig.txt']['find'] ?? [] as $key => $value) {
            // The "file" parser replaces whole lines, so its values repeat the key: "difficulty={{…}}".
            $value = is_string($value) ? (string) preg_replace('/^'.preg_quote((string) $key, '/').'\s*=/', '', $value) : '';
            $bindings[(string) $key] = self::variableIn($value);
        }

        $flags = $kind === 'tshock' ? self::TSHOCK_FLAGS : self::FLAGS;
        preg_match_all('/(?:^|\s)-([a-z]+)\s+("[^"]*"|\S+)/i', (string) $server->startup, $matches, PREG_SET_ORDER);
        foreach ($matches as [, $flag, $value]) {
            $key = $flags[strtolower($flag)] ?? null;
            if ($key !== null) {
                $bindings[$key] = self::variableIn(trim($value, '"'));
            }
        }

        return $bindings;
    }

    /** The variable a value is made of, when it is exactly one variable. */
    private static function variableIn(string $value): ?string
    {
        return preg_match('/^\{\{\s*(?:server\.build\.)?(?:env\.)?([A-Z0-9_]+)\s*\}\}$/', $value, $match) && $match[1] !== 'SERVER_PORT' ? $match[1] : null;
    }

    /** -lang takes Terraria's language numbers, the config file its language codes. */
    private const array LANGUAGE_NUMBERS = ['en-US' => '1', 'de-DE' => '2', 'it-IT' => '3', 'fr-FR' => '4', 'es-ES' => '5', 'ru-RU' => '6', 'zh-Hans' => '7', 'pt-BR' => '8', 'pl-PL' => '9'];

    /** The value as the egg's variable takes it. */
    public static function variableValue(string $key, string $value): string
    {
        return $key === 'language' ? (self::LANGUAGE_NUMBERS[$value] ?? $value) : $value;
    }

    /** The setting's value from a variable, the other way round. */
    public static function settingValue(string $key, string $value): string
    {
        return $key === 'language' ? (array_search($value, self::LANGUAGE_NUMBERS, true) ?: $value) : $value;
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

        $value = self::variableValue($key, $value);
        $validator = Validator::make(['value' => $value], ['value' => $variable->rules ?: 'nullable|string']);
        if ($validator->fails()) {
            throw ValidationException::withMessages(["values.$key" => 'The egg does not accept this value: '.$validator->errors()->first('value')]);
        }

        ServerVariable::query()->updateOrCreate(['server_id' => $server->id, 'variable_id' => $variable->id], ['variable_value' => $value]);
    }
}
