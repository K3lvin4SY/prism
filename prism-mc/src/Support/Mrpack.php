<?php

declare(strict_types=1);

namespace PrismMc\Support;

use Illuminate\Support\Facades\Http;
use PrismMc\Support\Providers\ModrinthProvider;
use Pterodactyl\Models\Server;
use RuntimeException;
use Throwable;
use ZipArchive;

/**
 * Reads a Modrinth modpack (.mrpack) and turns it into install-plan steps: server-side files
 * are pulled by Wings, overrides are written from the archive, and the pack's loader is
 * installed through mcjars.
 */
final class Mrpack
{
    /** Hosts the Modrinth pack format allows file downloads from. */
    private const array HOSTS = ['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com'];

    private const array OVERRIDES = ['overrides/', 'server-overrides/'];

    private const int MAX_OVERRIDE_FILE = 64 * 1024 * 1024;

    /** Folders a clean install empties first. Worlds and server settings are never touched. */
    public const array CLEAN = ['mods', 'config', 'defaultconfigs', 'kubejs'];

    /** mrpack dependency name → mcjars type */
    private const array LOADERS = [
        'fabric-loader' => 'FABRIC',
        'quilt-loader' => 'QUILT',
        'forge' => 'FORGE',
        'neoforge' => 'NEOFORGE',
    ];

    public static function archivePath(string $jobId): string
    {
        return Relay::directory().'/mrpack-'.preg_replace('/[^A-Za-z0-9-]/', '', $jobId).'.zip';
    }

    /**
     * @param  array{url: string, size: int|null, clean: bool, start: bool, pack: array<string, mixed>}  $step
     * @return list<array<string, mixed>>
     */
    public static function expand(Server $server, array $step, string $jobId): array
    {
        $archive = self::download($step['url'], $jobId);
        $zip = new ZipArchive;
        throw_unless($zip->open($archive) === true, RuntimeException::class, 'The modpack archive could not be opened.');

        try {
            $index = json_decode((string) $zip->getFromName('modrinth.index.json'), true);
            throw_unless(is_array($index) && ($index['game'] ?? null) === 'minecraft', RuntimeException::class, 'This is not a Minecraft modpack.');

            $pulls = [];
            foreach ($index['files'] ?? [] as $file) {
                if (($file['env']['server'] ?? 'required') === 'unsupported') {
                    continue;
                }

                $path = ServerFiles::normalize((string) ($file['path'] ?? ''));
                throw_if($path === '' || str_contains($path, ':'), RuntimeException::class, 'The modpack contains an invalid path.');

                $url = collect($file['downloads'] ?? [])->first(static fn (string $url): bool => str_starts_with($url, 'https://') && in_array(parse_url($url, PHP_URL_HOST), self::HOSTS, true));
                throw_if($url === null, RuntimeException::class, 'The modpack downloads '.$path.' from a site Prism MC does not trust.');

                $pulls[] = [
                    'url' => $url,
                    'dir' => str_contains($path, '/') ? dirname($path) : '',
                    'file' => basename($path),
                    'size' => isset($file['fileSize']) ? (int) $file['fileSize'] : null,
                    'sha1' => $file['hashes']['sha1'] ?? null,
                ];
            }

            $overrides = 0;
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $stat = $zip->statIndex($i);
                foreach (self::OVERRIDES as $prefix) {
                    if (str_starts_with($stat['name'], $prefix) && ! str_ends_with($stat['name'], '/')) {
                        throw_if($stat['size'] > self::MAX_OVERRIDE_FILE, RuntimeException::class, 'An override file in the modpack is too large.');
                        ServerFiles::normalize(substr($stat['name'], strlen($prefix)));
                        $overrides++;
                    }
                }
            }
        } finally {
            $zip->close();
        }

        $dependencies = $index['dependencies'] ?? [];
        $minecraft = (string) ($dependencies['minecraft'] ?? '');
        throw_if($minecraft === '', RuntimeException::class, 'The modpack does not say which Minecraft version it needs.');

        $steps = [['type' => 'power', 'action' => 'stop'], ['type' => 'wait-offline']];

        if ($step['clean']) {
            $steps[] = ['type' => 'delete', 'dir' => '', 'files' => self::CLEAN];
            $steps[] = ['type' => 'forget-prefix', 'prefix' => 'content.mods.'];
        }

        $steps[] = ['type' => 'mkdir', 'path' => 'mods'];

        if ($pulls !== []) {
            $steps[] = ['type' => 'pulls', 'files' => array_map(static fn (array $pull): array => array_diff_key($pull, ['sha1' => true]), $pulls)];
        }

        if ($overrides > 0) {
            $steps[] = ['type' => 'archive-write', 'archive' => basename($archive), 'prefixes' => self::OVERRIDES, 'count' => $overrides];
        }

        $build = self::loaderBuild($dependencies, $minecraft);
        if ($build !== null) {
            foreach (McJarsInstaller::steps($build, Detector::for($server)->jarFile()) as $loaderStep) {
                $steps[] = $loaderStep;
            }
        }

        foreach (self::modRecords($pulls) as $file => $record) {
            $steps[] = ['type' => 'record', 'key' => 'content.mods.'.$file, 'value' => $record];
        }

        $steps[] = ['type' => 'record', 'key' => 'modpack', 'value' => [
            ...$step['pack'],
            'name' => $index['name'] ?? ($step['pack']['title'] ?? null),
            'versionId' => $index['versionId'] ?? null,
            'minecraft' => $minecraft,
            'loader' => $build === null ? null : ['type' => $build['type'], 'version' => $build['projectVersionId'] ?? $build['name'] ?? null],
            'files' => count($pulls),
            'installed' => now()->toAtomString(),
        ]];
        $steps[] = ['type' => 'remove-local', 'file' => basename($archive)];
        $steps[] = ['type' => 'refresh'];

        if ($step['start']) {
            $steps[] = ['type' => 'power', 'action' => 'start'];
        }

        return $steps;
    }

    /**
     * Writes override files from the archive, resuming at $start, until $deadline passes.
     * Returns the index to resume at, or null when every file is written.
     *
     * @param  list<string>  $prefixes
     */
    public static function writeOverrides(Server $server, string $archive, array $prefixes, int $start, int $deadline): ?int
    {
        $path = Relay::directory().'/'.basename($archive);
        $zip = new ZipArchive;
        throw_unless($zip->open($path) === true, RuntimeException::class, 'The modpack archive is gone.');
        $files = ServerFiles::for($server);
        $made = [];

        try {
            // server-overrides come after overrides in the archive order we walk, so they win.
            $entries = [];
            foreach ($prefixes as $prefix) {
                for ($i = 0; $i < $zip->numFiles; $i++) {
                    $name = (string) $zip->getNameIndex($i);
                    if (str_starts_with($name, $prefix) && ! str_ends_with($name, '/')) {
                        $entries[] = [$i, ServerFiles::normalize(substr($name, strlen($prefix)))];
                    }
                }
            }

            for ($n = $start; $n < count($entries); $n++) {
                if (time() >= $deadline) {
                    return $n;
                }

                [$index, $target] = $entries[$n];
                $directory = str_contains($target, '/') ? dirname($target) : '';
                if ($directory !== '' && ! isset($made[$directory])) {
                    $files->makeDirectory($directory);
                    $made[$directory] = true;
                }

                $files->write($target, (string) $zip->getFromIndex($index));
            }
        } finally {
            $zip->close();
        }

        return null;
    }

    private static function download(string $url, string $jobId): string
    {
        throw_unless(str_starts_with($url, 'https://') && parse_url($url, PHP_URL_HOST) === 'cdn.modrinth.com', RuntimeException::class, 'Modpacks are only downloaded from Modrinth.');

        if (! is_dir(Relay::directory())) {
            mkdir(Relay::directory(), 0700, true);
        }

        $path = self::archivePath($jobId);
        $limit = (int) Settings::admin('modpack_max_mb', 2000) * 1024 * 1024;
        $response = Http::withUserAgent(McJars::USER_AGENT)->timeout(55)->sink($path)->get($url);

        if (! $response->successful() || ! is_file($path) || filesize($path) === 0) {
            @unlink($path);
            throw new RuntimeException('The modpack could not be downloaded ('.$response->status().').');
        }

        if (filesize($path) > $limit) {
            @unlink($path);
            throw new RuntimeException('The modpack is larger than the '.($limit >> 20).' MB limit set by the administrator.');
        }

        return $path;
    }

    /**
     * The mcjars build of the pack's loader, matched to its exact loader version when mcjars has it.
     *
     * @param  array<string, string>  $dependencies
     * @return array<string, mixed>|null
     */
    private static function loaderBuild(array $dependencies, string $minecraft): ?array
    {
        foreach (self::LOADERS as $name => $type) {
            if (! isset($dependencies[$name])) {
                continue;
            }

            $builds = McJars::builds($type, $minecraft);
            throw_if($builds === [], RuntimeException::class, sprintf('No %s server is available for Minecraft %s.', strtolower($type), $minecraft));

            $wanted = (string) $dependencies[$name];
            $match = collect($builds)->first(static fn (array $build): bool => ($build['projectVersionId'] ?? null) === $wanted || ($build['name'] ?? null) === $wanted);

            return McJars::build((int) ($match ?? $builds[0])['id']);
        }

        // A vanilla pack: Minecraft itself.
        $builds = McJars::builds('VANILLA', $minecraft);

        return $builds === [] ? null : McJars::build((int) $builds[0]['id']);
    }

    /**
     * Names and icons for the pack's mods, looked up by hash so the Mods tab shows them properly.
     *
     * @param  list<array<string, mixed>>  $pulls
     * @return array<string, array<string, mixed>>
     */
    private static function modRecords(array $pulls): array
    {
        $mods = array_values(array_filter($pulls, static fn (array $pull): bool => $pull['dir'] === 'mods' && is_string($pull['sha1'])));
        if ($mods === []) {
            return [];
        }

        try {
            $provider = app(ModrinthProvider::class);
            $versions = $provider->versionsForHashes(array_column($mods, 'sha1'));
            $projects = $provider->projects(array_values(array_filter(array_column($versions, 'projectId'))));
        } catch (Throwable) {
            return [];
        }

        $records = [];
        foreach ($mods as $mod) {
            $version = $versions[$mod['sha1']] ?? null;
            if ($version === null) {
                continue;
            }

            $project = $projects[$version['projectId']] ?? null;
            $records[$mod['file']] = [
                'provider' => 'modrinth',
                'project' => $version['projectId'],
                'version' => $version['id'],
                'versionNumber' => $version['number'],
                'title' => $project['title'] ?? $mod['file'],
                'icon' => $project['icon'] ?? null,
                'url' => $project['url'] ?? null,
                'sha1' => $mod['sha1'],
                'size' => $mod['size'],
                'loaders' => $version['loaders'],
                'gameVersions' => array_slice($version['gameVersions'], -5),
                'installedAt' => 0,
                'modpack' => true,
            ];
        }

        return $records;
    }
}
