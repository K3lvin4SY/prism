<?php

declare(strict_types=1);

namespace PrismMc\Support;

use Illuminate\Validation\ValidationException;

/**
 * The property definitions in resources/properties.json, shared with the frontend, used here
 * to check every value before it is written.
 */
final class PropertySchema
{
    /** @var array<string, mixed>|null */
    private static ?array $schema = null;

    /** @return array<string, mixed> */
    public static function raw(): array
    {
        return self::$schema ??= json_decode((string) file_get_contents(dirname(__DIR__, 2).'/resources/properties.json'), true, 32, JSON_THROW_ON_ERROR);
    }

    /** @return array<string, array<string, mixed>> definitions for an edition, by key */
    public static function forEdition(string $edition): array
    {
        $definitions = [];
        foreach (self::raw()['properties'] as $definition) {
            if (in_array($edition, $definition['editions'], true)) {
                $definitions[$definition['key']] = $definition;
            }
        }

        return $definitions;
    }

    public static function isHidden(string $key): bool
    {
        return in_array($key, self::raw()['hidden'], true);
    }

    public static function isManaged(string $key): bool
    {
        return in_array($key, self::raw()['managed'], true);
    }

    /**
     * Checks and normalises one value, returning the string to write.
     *
     * @throws ValidationException
     */
    public static function normalize(string $edition, string $key, mixed $value): string
    {
        $fail = static fn (string $message) => throw ValidationException::withMessages(["values.$key" => $message]);

        if (! preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/', $key) || self::isHidden($key)) {
            $fail('This setting cannot be changed here.');
        }

        if (self::isManaged($key)) {
            $fail('This setting is managed by the Panel.');
        }

        $definition = self::forEdition($edition)[$key] ?? null;
        if ($definition === null) {
            if (! is_scalar($value) || mb_strlen((string) $value) > 1024 || preg_match('/[\r\n]/', (string) $value)) {
                $fail('Use a single line of at most 1024 characters.');
            }

            return is_bool($value) ? ($value ? 'true' : 'false') : (string) $value;
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
                if (! is_string($value)) {
                    $fail('Must be text.');
                }

                if ($definition['type'] !== 'motd' && preg_match('/[\r\n]/', $value)) {
                    $fail('Must be a single line.');
                }

                if ($definition['type'] === 'motd' && substr_count($value, "\n") > 1) {
                    $fail('A MOTD has at most two lines.');
                }

                if (mb_strlen($value) > ($definition['maxLength'] ?? 1024)) {
                    $fail(sprintf('Use at most %d characters.', $definition['maxLength'] ?? 1024));
                }

                if (isset($definition['pattern']) && $value !== '' && ! preg_match('/'.$definition['pattern'].'/u', $value)) {
                    $fail('This value is not allowed.');
                }

                return $value;
        }
    }
}
