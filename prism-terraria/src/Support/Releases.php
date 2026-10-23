<?php

declare(strict_types=1);

namespace PrismTerraria\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * The builds each kind of server can switch to, newest first, in one shape:
 *   {id, name, terraria, channel (stable|preview), dotnet, published, notes}
 *
 *  - TShock: Pryaxis/TShock releases. Names say the Terraria version ("for Terraria 1.4.5.8");
 *    TShock 6 runs on .NET 9, TShock 5 on .NET 6.
 *  - tModLoader: tModLoader/tModLoader releases, stable and preview, all on .NET 8.
 *  - Terraria: Re-Logic's dedicated server zips on terraria.org, by version number.
 */
final class Releases
{
    /** Vanilla server builds terraria.org still serves (tried one by one; a few answer 502). */
    private const array VANILLA = ['1.4.5.8', '1.4.5.7', '1.4.5.6', '1.4.5.5', '1.4.5.0', '1.4.4.9', '1.4.4.8', '1.4.4.7', '1.4.4.4', '1.4.4.2', '1.4.4.1', '1.4.3.6', '1.4.3.5', '1.4.2.3'];

    /** World file versions of Terraria releases, to tell whether a build can open a world. */
    public const array WORLD_VERSIONS = ['1.4.4.9' => 279, '1.4.5.8' => 326];

    /** @return list<array<string, mixed>> */
    public static function for(string $kind): array
    {
        return match ($kind) {
            'tshock' => self::tshock(),
            'tmodloader' => self::tmodloader(),
            default => self::vanilla(),
        };
    }

    /** @return array<string, mixed>|null */
    public static function find(string $kind, string $id): ?array
    {
        foreach (self::for($kind) as $release) {
            if ($release['id'] === $id) {
                return $release;
            }
        }

        return null;
    }

    /**
     * Whether a build can open a world saved with a file version. Terraria refuses worlds from
     * newer releases. Unknown versions on either side give the benefit of the doubt.
     */
    public static function opensWorld(?string $terraria, ?int $worldVersion): bool
    {
        if ($terraria === null || $worldVersion === null) {
            return true;
        }

        $saved = self::terrariaForWorld($worldVersion);
        if ($saved !== null) {
            return version_compare($terraria, $saved, '>=');
        }

        $target = self::WORLD_VERSIONS[$terraria] ?? null;

        return $target === null || $worldVersion <= $target;
    }

    /** The zip of a vanilla server build. */
    public static function vanillaUrl(string $version): string
    {
        return 'https://terraria.org/api/download/pc-dedicated-server/terraria-server-'.str_replace('.', '', $version).'.zip';
    }

    /**
     * The Terraria version that saved a world, from its file version, or null when Prism Terraria
     * does not know that file version.
     */
    public static function terrariaForWorld(int $worldVersion): ?string
    {
        $found = array_search($worldVersion, self::WORLD_VERSIONS, true);

        return $found === false ? null : $found;
    }

    /** @return list<array<string, mixed>> */
    private static function tshock(): array
    {
        return Cache::remember('ext:prism-terraria:releases:tshock', 3600, static function (): array {
            $releases = [];
            foreach (self::github('Pryaxis/TShock') as $release) {
                $tag = (string) $release['tag_name'];
                $hasLinux = collect($release['assets'] ?? [])->contains(static fn (array $asset): bool => (bool) preg_match('/linux-(x64|amd64)/i', (string) $asset['name']));
                if (! $hasLinux) {
                    continue;
                }

                $major = (int) ltrim(explode('.', $tag)[0], 'v');
                $releases[] = [
                    'id' => $tag,
                    'name' => 'TShock '.ltrim($tag, 'v'),
                    'terraria' => preg_match('/Terraria (\d+\.\d+\.\d+(?:\.\d+)?)/i', (string) $release['name'], $match) ? $match[1] : null,
                    'channel' => ($release['prerelease'] ?? false) ? 'preview' : 'stable',
                    'dotnet' => $major >= 6 ? 9 : 6,
                    'published' => $release['published_at'] ?? null,
                    'notes' => (string) $release['name'],
                ];
            }

            return $releases;
        });
    }

    /** @return list<array<string, mixed>> */
    private static function tmodloader(): array
    {
        return Cache::remember('ext:prism-terraria:releases:tmodloader', 3600, static function (): array {
            $releases = [];
            foreach (self::github('tModLoader/tModLoader') as $release) {
                $tag = (string) $release['tag_name'];
                // Only 1.4 builds ship tModLoader.zip; the 1.3 legacy releases are left out.
                if (! preg_match('/^v20\d\d\./', $tag) || ! collect($release['assets'] ?? [])->contains('name', 'tModLoader.zip')) {
                    continue;
                }

                $releases[] = [
                    'id' => $tag,
                    'name' => 'tModLoader '.ltrim($tag, 'v'),
                    'terraria' => preg_match('/^(\d\.\d\.\d)/', (string) $release['name'], $match) ? $match[1].'.9' : '1.4.4.9',
                    'channel' => str_contains((string) $release['name'], 'preview') || ($release['prerelease'] ?? false) ? 'preview' : 'stable',
                    'dotnet' => 8,
                    'published' => $release['published_at'] ?? null,
                    'notes' => (string) $release['name'],
                ];
            }

            return $releases;
        });
    }

    /** @return list<array<string, mixed>> */
    private static function vanilla(): array
    {
        return array_map(static fn (string $version): array => [
            'id' => $version,
            'name' => 'Terraria '.$version,
            'terraria' => $version,
            'channel' => 'stable',
            'dotnet' => null,
            'published' => null,
            'notes' => null,
        ], self::VANILLA);
    }

    /** @return list<array<string, mixed>> */
    private static function github(string $repository): array
    {
        $response = Http::withUserAgent(Settings::USER_AGENT)->acceptJson()->timeout(15)->get("https://api.github.com/repos/$repository/releases", ['per_page' => 40]);
        throw_unless($response->successful() && is_array($response->json()), RuntimeException::class, 'GitHub did not answer: '.$response->status());

        return array_values(array_filter($response->json(), static fn (mixed $release): bool => is_array($release) && ! ($release['draft'] ?? false)));
    }
}
