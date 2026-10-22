<?php

declare(strict_types=1);

namespace McSuite\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Pumpkin builds from its GitHub releases, shaped like mcjars versions and builds so the
 * Versions tab can list them the same way. Release tags read "0.2.0+26.3-26.51": the Pumpkin
 * version, then the Java and Bedrock versions it speaks. The rolling nightly and canary
 * builds track the newest release's Minecraft version.
 */
final class PumpkinReleases
{
    public const string TYPE = 'PUMPKIN';

    private const string API = 'https://api.github.com/repos/Pumpkin-MC/Pumpkin/releases?per_page=30';

    public const string ICON = 'https://avatars.githubusercontent.com/u/193089026?s=128&v=4';

    /** Rolling builds and what they are called. */
    private const array ROLLING = [
        'nightly' => 'Nightly',
        'canary' => 'Canary',
    ];

    /** @return array<string, mixed> the software entry for the Versions tab */
    public static function type(): array
    {
        $releases = self::all();

        return [
            'name' => 'Pumpkin',
            'icon' => self::ICON,
            'color' => '#F28C28',
            'homepage' => 'https://pumpkinmc.org',
            'deprecated' => false,
            'experimental' => true,
            'description' => 'A Minecraft server written from scratch in Rust. Fast, but still missing parts of vanilla. Bukkit plugins run on it through PatchBukkit.',
            'categories' => ['plugins'],
            'compatibility' => [],
            'builds' => count($releases),
            'versions' => ['minecraft' => count(array_unique(array_column($releases, 'minecraft'))), 'project' => count($releases)],
        ];
    }

    /** @return list<array<string, mixed>> one entry per Minecraft version, newest first */
    public static function versions(): array
    {
        $versions = [];
        foreach (self::all() as $release) {
            $id = $release['minecraft'];
            $versions[$id] ??= [
                'id' => $id,
                'type' => 'RELEASE',
                'supported' => true,
                'java' => null,
                'builds' => 0,
                'created' => $release['created'],
                'latest' => self::summarize($release),
            ];
            $versions[$id]['builds']++;
        }

        return array_values($versions);
    }

    /** @return list<array<string, mixed>> */
    public static function builds(string $version): array
    {
        return array_values(array_map(
            self::summarize(...),
            array_filter(self::all(), static fn (array $release): bool => $release['minecraft'] === $version),
        ));
    }

    /** @return array<string, mixed>|null */
    public static function find(int $id): ?array
    {
        foreach (self::all() as $release) {
            if ($release['id'] === $id) {
                return $release;
            }
        }

        return null;
    }

    /**
     * Tagged releases newest first, then the rolling builds, so a version's latest is a release.
     *
     * @return list<array{id: int, tag: string, name: string, minecraft: string, pumpkin: string|null, rolling: bool, created: string|null, notes: string|null}>
     */
    public static function all(): array
    {
        return Cache::remember('ext:mc-suite:pumpkin:releases', 3600, function (): array {
            $response = Http::withUserAgent(McJars::USER_AGENT)->acceptJson()->timeout(15)->get(self::API);
            throw_unless($response->successful() && is_array($response->json()), RuntimeException::class, 'GitHub did not answer: '.$response->status());

            $tagged = [];
            $rolling = [];
            foreach ($response->json() as $release) {
                $tag = (string) ($release['tag_name'] ?? '');
                if (! is_int($release['id'] ?? null) || ($release['draft'] ?? false)) {
                    continue;
                }

                if (isset(self::ROLLING[$tag])) {
                    $rolling[] = $release;
                } elseif (preg_match('/^([0-9][^+]*)\+(\d+\.\d+(?:\.\d+)?)/', $tag, $match)) {
                    $tagged[] = [
                        'id' => $release['id'],
                        'tag' => $tag,
                        'name' => $match[1],
                        'minecraft' => $match[2],
                        'pumpkin' => $match[1],
                        'rolling' => false,
                        'created' => $release['published_at'] ?? null,
                        'notes' => self::firstLine($release['body'] ?? null),
                    ];
                }
            }

            usort($tagged, static fn (array $a, array $b): int => version_compare($b['minecraft'], $a['minecraft']) ?: strcmp((string) $b['created'], (string) $a['created']));
            $newest = $tagged[0]['minecraft'] ?? null;
            if ($newest === null) {
                return [];
            }

            $builds = [];
            foreach ($rolling as $release) {
                $builds[] = [
                    'id' => $release['id'],
                    'tag' => $release['tag_name'],
                    'name' => self::ROLLING[$release['tag_name']],
                    'minecraft' => $newest,
                    'pumpkin' => null,
                    'rolling' => true,
                    // Rolling releases keep their first date; their assets are what changes.
                    'created' => $release['updated_at'] ?? $release['published_at'] ?? null,
                    'notes' => $release['tag_name'] === 'nightly' ? 'Built from master every day.' : 'Every commit to master, without optimisations.',
                ];
            }

            return [...$tagged, ...$builds];
        });
    }

    /**
     * @param  array<string, mixed>  $release
     * @return array<string, mixed>
     */
    private static function summarize(array $release): array
    {
        return [
            'id' => $release['id'],
            'type' => self::TYPE,
            'versionId' => $release['minecraft'],
            'projectVersionId' => $release['pumpkin'],
            'name' => $release['name'],
            'buildNumber' => null,
            'experimental' => $release['rolling'],
            'size' => null,
            'changes' => $release['notes'] !== null ? [$release['notes']] : [],
            'created' => $release['created'],
        ];
    }

    private static function firstLine(?string $body): ?string
    {
        foreach (preg_split('/\r?\n/', (string) $body) as $line) {
            // Headings ("## 0.2.0 Release Notes") say nothing the build name does not.
            if (preg_match('/^\s*#/', $line)) {
                continue;
            }

            $line = trim((string) preg_replace('/^[*\-\s]+/', '', $line));
            if ($line !== '') {
                return mb_substr($line, 0, 200);
            }
        }

        return null;
    }
}
