<?php

declare(strict_types=1);

namespace PrismMc\Support;

use RuntimeException;

/**
 * Reads the string tags at the top of a little-endian (Bedrock) NBT compound. That is all
 * the player index records need; the full player data is decoded in the browser.
 */
final class BedrockNbt
{
    /** @return array<string, string> */
    public static function topLevelStrings(string $bytes): array
    {
        $offset = 0;
        throw_unless(ord($bytes[0] ?? "\0") === 10, RuntimeException::class, 'Not an NBT compound.');
        $offset++;
        self::string($bytes, $offset);

        $strings = [];
        while ($offset < strlen($bytes)) {
            $type = ord($bytes[$offset++]);
            if ($type === 0) {
                break;
            }

            $name = self::string($bytes, $offset);
            if ($type === 8) {
                $strings[$name] = self::string($bytes, $offset);
            } else {
                self::skip($bytes, $offset, $type);
            }
        }

        return $strings;
    }

    private static function string(string $bytes, int &$offset): string
    {
        $length = unpack('v', substr($bytes, $offset, 2))[1];
        $value = substr($bytes, $offset + 2, $length);
        $offset += 2 + $length;

        return $value;
    }

    private static function skip(string $bytes, int &$offset, int $type, int $depth = 0): void
    {
        throw_if($depth > 64, RuntimeException::class, 'NBT nests too deeply.');

        switch ($type) {
            case 1: $offset += 1; break;
            case 2: $offset += 2; break;
            case 3: case 5: $offset += 4; break;
            case 4: case 6: $offset += 8; break;
            case 7: $offset += 4 + unpack('V', substr($bytes, $offset, 4))[1]; break;
            case 8: self::string($bytes, $offset); break;
            case 9:
                $itemType = ord($bytes[$offset]);
                $count = unpack('V', substr($bytes, $offset + 1, 4))[1];
                $offset += 5;
                for ($i = 0; $i < $count; $i++) {
                    self::skip($bytes, $offset, $itemType, $depth + 1);
                }
                break;
            case 10:
                while ($offset < strlen($bytes)) {
                    $child = ord($bytes[$offset++]);
                    if ($child === 0) {
                        break;
                    }

                    self::string($bytes, $offset);
                    self::skip($bytes, $offset, $child, $depth + 1);
                }
                break;
            case 11: $offset += 4 + 4 * unpack('V', substr($bytes, $offset, 4))[1]; break;
            case 12: $offset += 4 + 8 * unpack('V', substr($bytes, $offset, 4))[1]; break;
            default: throw new RuntimeException("Unknown NBT tag type $type.");
        }
    }
}
