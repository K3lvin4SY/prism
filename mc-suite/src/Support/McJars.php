<?php

declare(strict_types=1);

namespace McSuite\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Server software, versions and builds from mcjars.app, cached on the Panel.
 */
final class McJars
{
    private const string BASE = 'https://mcjars.app';

    public const string USER_AGENT = 'Donkare/mc-suite/0.1.0 (Pterodactyl Panel extension)';

    /** @return array<string, mixed> */
    public static function types(): array
    {
        return Cache::remember('ext:mc-suite:mcjars:types', 3600, fn (): array => self::get('/api/v2/types')['types']);
    }

    /** @return array<string, mixed> versions keyed by Minecraft version, newest first */
    public static function versions(string $type): array
    {
        $type = self::type($type);

        return Cache::remember("ext:mc-suite:mcjars:versions:$type", 900, function () use ($type): array {
            $builds = self::get("/api/v2/builds/$type")['builds'];
            $versions = [];
            foreach (array_reverse($builds, true) as $version => $data) {
                $latest = $data['latest'] ?? [];
                $versions[] = [
                    'id' => (string) $version,
                    'type' => $data['type'] ?? 'RELEASE',
                    'supported' => (bool) ($data['supported'] ?? false),
                    'java' => $data['java'] ?? null,
                    'builds' => (int) ($data['builds'] ?? 0),
                    'created' => $data['created'] ?? null,
                    'latest' => self::summarize($latest),
                ];
            }

            return $versions;
        });
    }

    /** @return list<array<string, mixed>> builds of one version, newest first */
    public static function builds(string $type, string $version): array
    {
        $type = self::type($type);
        abort_unless(preg_match('/^[A-Za-z0-9._+-]{1,64}$/', $version) === 1, 422, 'Invalid version.');

        return Cache::remember("ext:mc-suite:mcjars:builds:$type:$version", 900, fn (): array => array_map(
            self::summarize(...),
            self::get('/api/v2/builds/'.$type.'/'.rawurlencode($version))['builds'] ?? [],
        ));
    }

    /** @return array<string, mixed> one build with its installation steps */
    public static function build(int $id): array
    {
        return Cache::remember("ext:mc-suite:mcjars:build:$id", 900, fn (): array => self::get("/api/v1/build/$id")['build']);
    }

    /**
     * @param  array<string, mixed>  $build
     * @return array<string, mixed>
     */
    private static function summarize(array $build): array
    {
        return [
            'id' => $build['id'] ?? null,
            'type' => $build['type'] ?? null,
            'versionId' => $build['versionId'] ?? null,
            'projectVersionId' => $build['projectVersionId'] ?? null,
            'name' => $build['name'] ?? null,
            'buildNumber' => $build['buildNumber'] ?? null,
            'experimental' => (bool) ($build['experimental'] ?? false),
            'size' => $build['jarSize'] ?? $build['zipSize'] ?? null,
            'changes' => array_slice($build['changes'] ?? [], 0, 10),
            'created' => $build['created'] ?? null,
        ];
    }

    private static function type(string $type): string
    {
        $type = strtoupper($type);
        abort_unless(preg_match('/^[A-Z0-9_]{2,32}$/', $type) === 1, 422, 'Invalid software type.');

        return $type;
    }

    /** @return array<string, mixed> */
    private static function get(string $path): array
    {
        $response = Http::withUserAgent(self::USER_AGENT)->acceptJson()->timeout(15)->get(self::BASE.$path);
        $data = $response->json();

        if (! $response->successful() || ! is_array($data) || ($data['success'] ?? false) !== true) {
            throw new RuntimeException('mcjars.app did not answer: '.$response->status());
        }

        return $data;
    }
}
