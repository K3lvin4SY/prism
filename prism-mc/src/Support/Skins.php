<?php

declare(strict_types=1);

namespace PrismMc\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Finds a player's skin texture: Mojang for Java accounts, GeyserMC for Bedrock players
 * (by xuid, or by Floodgate UUID), and Steve when nothing is found. Results are cached.
 */
final class Skins
{
    /** Steve, Minecraft's default skin, on Mojang's texture server. */
    private const string STEVE = 'https://textures.minecraft.net/texture/31f477eb1a7beee631c2ca64d06f8f68fa93a3386d04452ab27f43acdf1b60cb';

    private const string TEXTURES = 'textures.minecraft.net';

    /**
     * @return array{png: string, slim: bool, cape: string|null}
     */
    public static function find(string $key): array
    {
        return Cache::remember('ext:prism-mc:skin:'.sha1($key), 21_600, static function () use ($key): array {
            $found = null;
            try {
                $found = self::lookup($key);
            } catch (Throwable) {
                // Fall back to Steve below.
            }

            $png = $found !== null ? self::download($found['url']) : null;
            $cape = $found !== null && $found['cape'] !== null ? self::download($found['cape']) : null;

            return [
                'png' => base64_encode($png ?? self::download(self::STEVE) ?? ''),
                'slim' => $png !== null && $found['slim'],
                'cape' => $cape !== null ? base64_encode($cape) : null,
            ];
        });
    }

    /** @return array{url: string, slim: bool, cape: string|null}|null */
    private static function lookup(string $key): ?array
    {
        if (preg_match('/^\d{1,20}$/', $key)) {
            return self::geyser($key);
        }

        if (preg_match(PlayerData::UUID, $key)) {
            // Floodgate gives Bedrock players 00000000-0000-0000-xxxx-xxxxxxxxxxxx, the xuid in hex.
            if (str_starts_with($key, '00000000-0000-0000-')) {
                return self::geyser((string) hexdec(str_replace('-', '', substr($key, 19))));
            }

            // Version 4 UUIDs are Mojang accounts; offline-mode UUIDs (version 3) have no profile.
            if ($key[14] === '4') {
                return self::mojang(str_replace('-', '', $key));
            }

            return null;
        }

        if (preg_match('/^[A-Za-z0-9_]{1,16}$/', $key)) {
            $profile = Http::timeout(5)->get('https://api.mojang.com/users/profiles/minecraft/'.$key)->json();

            return is_string($profile['id'] ?? null) ? self::mojang($profile['id']) : null;
        }

        return null;
    }

    /** @return array{url: string, slim: bool, cape: string|null}|null */
    private static function mojang(string $id): ?array
    {
        $profile = Http::timeout(5)->get('https://sessionserver.mojang.com/session/minecraft/profile/'.$id)->json();
        foreach ($profile['properties'] ?? [] as $property) {
            if (($property['name'] ?? null) !== 'textures') {
                continue;
            }

            $textures = json_decode((string) base64_decode((string) $property['value'], true), true)['textures'] ?? [];
            $skin = $textures['SKIN'] ?? null;
            if (! is_string($skin['url'] ?? null)) {
                return null;
            }

            return [
                'url' => $skin['url'],
                'slim' => ($skin['metadata']['model'] ?? null) === 'slim',
                'cape' => is_string($textures['CAPE']['url'] ?? null) ? $textures['CAPE']['url'] : null,
            ];
        }

        return null;
    }

    /** @return array{url: string, slim: bool, cape: string|null}|null */
    private static function geyser(string $xuid): ?array
    {
        $skin = Http::timeout(5)->get('https://api.geysermc.org/v2/skin/'.$xuid)->json();
        $texture = $skin['texture_id'] ?? null;

        return is_string($texture) && preg_match('/^[0-9a-f]{20,80}$/', $texture)
            ? ['url' => 'https://'.self::TEXTURES.'/texture/'.$texture, 'slim' => (bool) ($skin['is_steve'] ?? true) === false, 'cape' => null]
            : null;
    }

    private static function download(string $url): ?string
    {
        $url = preg_replace('#^http://#', 'https://', $url);
        if (parse_url((string) $url, PHP_URL_HOST) !== self::TEXTURES) {
            return null;
        }

        $response = Http::timeout(5)->get((string) $url);
        $body = $response->body();

        return $response->successful() && str_starts_with($body, "\x89PNG") && strlen($body) < 200_000 ? $body : null;
    }
}
