<?php

declare(strict_types=1);

namespace PrismTerraria\Support;

use Illuminate\Validation\ValidationException;

/**
 * The setting definitions in resources/settings.json, shared with the frontend, used here to
 * check every value before it is written.
 */
final class SettingsSchema
{
    /** @var array<string, mixed>|null */
    private static ?array $schema = null;

    /** @return array<string, mixed> */
    public static function raw(): array
    {
        return self::$schema ??= json_decode((string) file_get_contents(dirname(__DIR__, 2).'/resources/settings.json'), true, 32, JSON_THROW_ON_ERROR);
    }

    /** @return array<string, array<string, mixed>> definitions for a server type, by key */
    public static function forKind(string $kind): array
    {
        $definitions = [];
        foreach (self::raw()['settings'] as $definition) {
            if (in_array($kind, $definition['kinds'], true)) {
                $definitions[$definition['key']] = $definition;
            }
        }

        return $definitions;
    }

    public static function isManaged(string $key): bool
    {
        return in_array($key, self::raw()['managed'], true);
    }

    /**
     * Checks one value and returns it as the string written for it.
     *
     * @throws ValidationException
     */
    public static function normalize(string $kind, string $key, mixed $value): string
    {
        $fail = static fn (string $message) => throw ValidationException::withMessages(["values.$key" => $message]);

        $definition = self::forKind($kind)[$key] ?? null;
        if ($definition === null || self::isManaged($key)) {
            $fail('This setting cannot be changed here.');
        }

        switch ($definition['type']) {
            case 'bool':
                if (! is_bool($value) && ! in_array($value, ['true', 'false'], true)) {
                    $fail('Must be on or off.');
                }

                return ($value === true || $value === 'true') ? 'true' : 'false';

            case 'int':
                if (is_string($value) && preg_match('/^-?\d+$/', trim($value))) {
                    $value = (int) trim($value);
                }

                if (! is_int($value)) {
                    $fail('Must be a whole number.');
                }

                if ($value < $definition['min'] || $value > $definition['max']) {
                    $fail(sprintf('Must be between %d and %d.', $definition['min'], $definition['max']));
                }

                return (string) $value;

            case 'enum':
                $value = is_scalar($value) ? (string) $value : '';
                if (! in_array($value, $definition['options'], true)) {
                    $fail('Pick one of the listed options.');
                }

                return $value;

            default:
                if (! is_string($value) || preg_match('/[\r\n]/', $value)) {
                    $fail('Must be a single line of text.');
                }

                if (mb_strlen($value) > ($definition['maxLength'] ?? 256)) {
                    $fail(sprintf('Use at most %d characters.', $definition['maxLength'] ?? 256));
                }

                return $value;
        }
    }

    /** The definition's type, for writing values into JSON with the right type. */
    public static function type(string $kind, string $key): string
    {
        return self::forKind($kind)[$key]['type'] ?? 'string';
    }
}
