<?php

declare(strict_types=1);

namespace McSuite\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use McSuite\Support\InstallPlan;
use McSuite\Support\PatchBukkit;
use McSuite\Support\Providers\ContentProvider;
use McSuite\Support\Providers\ModrinthProvider;
use McSuite\Support\Providers\PumpkinMarketProvider;
use McSuite\Support\ServerFiles;
use McSuite\Support\Settings;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * Plugins and mods: the same browser, installer and file list, pointed at plugins/ or mods/.
 */
class ContentController extends Controller
{
    /** kind → [feature/permission, directory, provider project type] */
    private const array KINDS = [
        'plugins' => ['plugins', 'plugins', 'plugin'],
        'mods' => ['mods', 'mods', 'mod'],
        // Browse only: modpacks install through ModpacksController.
        'modpacks' => ['modpacks', '', 'modpack'],
    ];

    /** Loaders that belong to each kind, used to refuse a mod on a plugin server and the reverse. */
    private const array KIND_LOADERS = [
        'plugins' => ['pumpkin', 'paper', 'spigot', 'bukkit', 'purpur', 'folia', 'velocity', 'bungeecord', 'waterfall', 'sponge'],
        'mods' => ['fabric', 'quilt', 'forge', 'neoforge'],
        'modpacks' => ['fabric', 'quilt', 'forge', 'neoforge'],
    ];

    /** Hosts files may be downloaded from. */
    private const array DOWNLOAD_HOSTS = ['cdn.modrinth.com', 'market.pumpkinmc.org'];

    /** Installable file names: Java plugin and mod jars, and Pumpkin's WASM plugins. */
    private const string FILE = '/^[^\/\\\\\0]{1,150}\.(jar|wasm)$/i';

    private const int IDENTIFY_MAX_FILE = 15 * 1024 * 1024;

    private const int IDENTIFY_MAX_TOTAL = 150 * 1024 * 1024;

    public function __construct(private readonly ModrinthProvider $modrinth, private readonly PumpkinMarketProvider $market) {}

    /** The source of a project or version id: the Pumpkin Market's carry a prefix, the rest are Modrinth's. */
    private function provider(?string $id = null): ContentProvider
    {
        return PumpkinMarketProvider::owns($id) ? $this->market : $this->modrinth;
    }

    /** Where a file goes: WASM plugins in Pumpkin's plugins/, jars in the kind's folder. */
    private function folderFor(string $file, string $directory): string
    {
        return str_ends_with(strtolower($file), '.wasm') ? 'plugins' : $directory;
    }

    /**
     * @return array{0: array<string, mixed>, 1: string, 2: string, 3: list<string>}
     *                                                                         info, directory, project type, loaders for this server
     */
    private function context(Request $request, Server $server, string $kind): array
    {
        abort_unless(isset(self::KINDS[$kind]), 404);
        [$feature, $directory, $type] = self::KINDS[$kind];
        $info = $this->authorizeFeature($request, $server, $feature, $feature);
        $loaders = $kind === 'plugins' ? $info['pluginLoaders'] : $info['modLoaders'];

        // Pumpkin's own plugins/ holds native plugins; Bukkit jars go to PatchBukkit's folder.
        if ($kind === 'plugins' && $info['software'] === 'pumpkin') {
            $directory = PatchBukkit::for($server)->pluginFolder();
        }

        return [$info, $directory, $type, $loaders];
    }

    public function search(Request $request, Server $server, string $kind): JsonResponse
    {
        [$info, , $type, $loaders] = $this->context($request, $server, $kind);
        $data = $request->validate([
            'query' => ['nullable', 'string', 'max:100'],
            'categories' => ['nullable', 'array', 'max:10'],
            'categories.*' => ['string', 'max:40', 'regex:/^[a-z0-9-]+$/'],
            'exclude' => ['nullable', 'array', 'max:10'],
            'exclude.*' => ['string', 'max:40', 'regex:/^[a-z0-9-]+$/'],
            'loaders' => ['nullable', 'array', 'max:10'],
            'loaders.*' => ['string', 'max:40', 'regex:/^[a-z0-9-]+$/'],
            'gameVersions' => ['nullable', 'array', 'max:20'],
            'gameVersions.*' => ['string', 'max:32', 'regex:/^[A-Za-z0-9._-]+$/'],
            'sort' => ['nullable', 'string', 'in:relevance,downloads,follows,newest,updated'],
            'page' => ['nullable', 'integer', 'min:1', 'max:500'],
            'limit' => ['nullable', 'integer', 'in:10,20,50,100'],
        ]);

        $limit = (int) ($data['limit'] ?? 20);
        // Left out, loaders and versions default to the server's; sent empty, they mean "any".
        $selected = $request->has('loaders') ? ($data['loaders'] ?? []) : $loaders;
        $search = [
            'type' => $type,
            'query' => $data['query'] ?? '',
            'categories' => $data['categories'] ?? [],
            'excludeCategories' => $data['exclude'] ?? [],
            'loaders' => array_values(array_diff($selected, [PumpkinMarketProvider::LOADER])),
            'gameVersions' => $request->has('gameVersions') ? ($data['gameVersions'] ?? []) : array_filter([$info['version']]),
            'sort' => $data['sort'] ?? 'relevance',
            'offset' => ((int) ($data['page'] ?? 1) - 1) * $limit,
            'limit' => $limit,
            'serverSide' => $kind !== 'plugins',
        ];
        $result = $kind === 'plugins' && in_array(PumpkinMarketProvider::LOADER, $selected, true)
            ? $this->searchWithMarket($search, $search['loaders'] !== [] || $selected === [])
            : $this->modrinth->search($search);

        $installed = $kind === 'modpacks'
            ? array_filter([Settings::server($server)->get('modpack')['project'] ?? null])
            : array_column($this->records($server, $kind), 'project');

        foreach ($result['hits'] as &$hit) {
            $hit['installed'] = in_array($hit['id'], $installed, true);
        }

        return new JsonResponse([...$result, 'page' => (int) ($data['page'] ?? 1), 'limit' => $limit]);
    }

    /**
     * Why Pumpkin did not load plugins at its last start, by file name, from its log: a WASM
     * plugin built for another plugin API version is the usual reason.
     *
     * @return array<string, string>
     */
    private function pumpkinLoadErrors(Server $server): array
    {
        try {
            $files = ServerFiles::for($server);
            $size = $files->size('logs/latest.log');
            $log = $size !== null && $size <= 4_000_000 ? ($files->read('logs/latest.log', 4_000_000) ?? '') : '';
        } catch (Throwable) {
            return [];
        }

        preg_match_all('/Failed to load plugin from "\.?\/?plugins\/([^"\/]+)": (.+)$/m', (string) preg_replace('/\e\[[0-9;]*m/', '', $log), $matches, PREG_SET_ORDER);
        $errors = [];
        foreach ($matches as [, $file, $reason]) {
            $errors[$file] = mb_substr(trim($reason), 0, 300);
        }

        return $errors;
    }

    /**
     * Pumpkin Market plugins first, then Modrinth's, as one list. The Market's matches are
     * counted in full, so every page knows where Modrinth's part starts.
     *
     * @param  array<string, mixed>  $search
     * @return array{hits: list<array<string, mixed>>, total: int}
     */
    private function searchWithMarket(array $search, bool $withModrinth): array
    {
        $market = $this->market->search($search);
        if (! $withModrinth) {
            return $market;
        }

        $room = $search['limit'] - count($market['hits']);
        $modrinth = $this->modrinth->search([
            ...$search,
            'offset' => max(0, $search['offset'] - $market['total']),
            'limit' => max(1, $room),
        ]);

        return [
            'hits' => [...$market['hits'], ...($room > 0 ? $modrinth['hits'] : [])],
            'total' => $market['total'] + $modrinth['total'],
        ];
    }

    public function categories(Request $request, Server $server, string $kind): JsonResponse
    {
        [$info, , $type, $loaders] = $this->context($request, $server, $kind);

        // The loaders this kind is about come first, in their usual order; others follow.
        $available = $this->modrinth->loaders($type);
        if ($kind === 'plugins') {
            $available[] = PumpkinMarketProvider::loader();
        }

        usort($available, static function (array $a, array $b) use ($kind): int {
            $order = array_flip(self::KIND_LOADERS[$kind]);

            return ($order[$a['name']] ?? 99) <=> ($order[$b['name']] ?? 99) ?: strcmp($a['name'], $b['name']);
        });

        return new JsonResponse([
            'categories' => $this->modrinth->categories($type),
            'loaders' => array_values(array_filter($available, static fn (array $loader): bool => $kind === 'plugins'
                || (! in_array($loader['name'], self::KIND_LOADERS['plugins'], true) && $loader['name'] !== 'geyser'))),
            'gameVersions' => $this->modrinth->gameVersions(),
            'serverLoaders' => $loaders,
            'serverVersion' => $info['version'],
        ]);
    }

    public function project(Request $request, Server $server, string $kind, string $project): JsonResponse
    {
        [$info, , , $loaders] = $this->context($request, $server, $kind);
        $all = $request->boolean('all');

        $versions = $this->provider($project)->versions(
            $project,
            $all ? [] : $loaders,
            $all || $info['version'] === null ? [] : [$info['version']],
        );

        return new JsonResponse([
            'project' => $this->provider($project)->project($project),
            'versions' => array_slice($versions, 0, 100),
            'installed' => collect($this->records($server, $kind))->firstWhere('project', $project),
        ]);
    }

    /**
     * What installing a version brings with it: its required dependencies that are not
     * installed yet, each resolved to the newest compatible version.
     */
    public function dependencies(Request $request, Server $server, string $kind, string $version): JsonResponse
    {
        [$info, , , $loaders] = $this->context($request, $server, $kind);
        $resolved = $this->resolveDependencies($server, $kind, $this->provider($version)->version($version), $loaders, $info['version']);
        $projects = $this->provider($version)->projects(array_column($resolved, 'projectId'));

        return new JsonResponse(['dependencies' => array_map(static fn (array $dependency): array => [
            ...$dependency,
            'project' => $projects[$dependency['projectId']] ?? null,
        ], $resolved)]);
    }

    public function installed(Request $request, Server $server, string $kind): JsonResponse
    {
        [$info, $directory] = $this->context($request, $server, $kind);
        $records = $this->records($server, $kind);
        $files = ServerFiles::for($server)->list($directory);

        // Pumpkin's own WASM plugins sit in plugins/, next to PatchBukkit's library.
        $loadErrors = [];
        if ($kind === 'plugins' && $info['software'] === 'pumpkin') {
            foreach (ServerFiles::for($server)->list('plugins') as $name => $file) {
                if (preg_match('/\.wasm(\.disabled)?$/i', $name)) {
                    $files[$name] = $file;
                }
            }

            $loadErrors = $this->pumpkinLoadErrors($server);
        }

        $entries = [];
        foreach ($files as $name => $file) {
            if (! $file['file'] || ! preg_match('/\.(jar|wasm)(\.disabled)?$/i', $name)) {
                continue;
            }

            $base = preg_replace('/\.disabled$/i', '', $name);
            $record = $records[$base] ?? null;
            $entries[] = [
                'file' => $base,
                'enabled' => ! str_ends_with(strtolower($name), '.disabled'),
                'size' => $file['size'],
                'modified' => $file['modified'],
                'downloading' => $record !== null && isset($record['size']) && $file['size'] < $record['size'],
                'record' => $record,
                'loadError' => $loadErrors[$base] ?? null,
            ];
        }

        // Files still on their way from a pull show up as soon as Wings creates them; until then list them as pending.
        foreach ($records as $base => $record) {
            if (! isset($files[$base]) && ! isset($files[$base.'.disabled']) && (time() - ($record['installedAt'] ?? 0)) < 300) {
                $entries[] = ['file' => $base, 'enabled' => true, 'size' => 0, 'modified' => null, 'downloading' => true, 'record' => $record];
            }
        }

        usort($entries, static fn (array $a, array $b): int => strcasecmp($a['record']['title'] ?? $a['file'], $b['record']['title'] ?? $b['file']));

        return new JsonResponse(['files' => $entries, 'job' => InstallPlan::current($server)]);
    }

    public function install(Request $request, Server $server, string $kind): JsonResponse
    {
        [$info, $directory, , $loaders] = $this->context($request, $server, $kind);
        $data = $request->validate([
            'version' => ['required', 'string', 'max:64'],
            'dependencies' => ['nullable', 'array', 'max:25'],
            'dependencies.*' => ['string', 'max:64'],
            'force' => ['sometimes', 'boolean'],
        ]);

        $versions = [$this->provider($data['version'])->version($data['version'])];
        foreach ($data['dependencies'] ?? [] as $dependency) {
            $versions[] = $this->provider($dependency)->version($dependency);
        }

        $projects = [];
        foreach ($versions as $version) {
            $projects += $this->provider($version['projectId'])->projects([$version['projectId']]);
        }

        $records = $this->records($server, $kind);
        $files = ServerFiles::for($server);
        $pulls = [];

        foreach ($versions as $index => $version) {
            if ($index === 0 && ! ($data['force'] ?? false) && array_intersect($version['loaders'], self::KIND_LOADERS[$kind]) === []) {
                abort(422, sprintf('This file is made for %s, not for %s.', implode(', ', $version['loaders']), $kind));
            }

            $file = $this->pickFile($version);
            $folder = $this->folderFor($file['filename'], $directory);

            // Updating: the old file of the same project goes first.
            foreach ($records as $existing => $record) {
                if (($record['project'] ?? null) === $version['projectId']) {
                    $this->removeFile($server, $kind, $this->folderFor($existing, $directory), $existing);
                    unset($records[$existing]);
                }
            }

            $existing = $files->list($folder);
            if (isset($existing[$file['filename']])) {
                $files->delete($folder, [$file['filename']]);
            }

            $pulls[] = ['url' => $file['url'], 'dir' => $folder, 'file' => $file['filename'], 'size' => $file['size']];
            $project = $projects[$version['projectId']] ?? null;
            $this->saveRecord($server, $kind, $file['filename'], [
                'provider' => $this->provider($version['projectId'])->id(),
                'project' => $version['projectId'],
                'version' => $version['id'],
                'versionNumber' => $version['number'],
                'title' => $project['title'] ?? $file['filename'],
                'icon' => $project['icon'] ?? null,
                'url' => $project['url'] ?? null,
                'sha1' => $file['sha1'],
                'size' => $file['size'],
                'loaders' => $version['loaders'],
                'gameVersions' => array_slice($version['gameVersions'], -5),
                'installedAt' => time(),
            ]);
        }

        $job = null;
        if (count($pulls) > 3) {
            $plan = InstallPlan::for($server, sprintf('Installing %d %s', count($pulls), $kind))->add('pulls', ['files' => $pulls]);
            $job = $plan->dispatch($request->user(), self::KINDS[$kind][0]);
        } else {
            foreach (array_unique(array_column($pulls, 'dir')) as $folder) {
                if ($folder !== '') {
                    $files->makeDirectory($folder);
                }
            }

            foreach ($pulls as $pull) {
                $files->pull($pull['url'], $pull['dir'], $pull['file']);
            }
        }

        Activity::event('server:mc-suite.'.$kind.'.install')
            ->property('files', array_column($pulls, 'file'))
            ->log();

        return new JsonResponse(['job' => $job, 'files' => array_column($pulls, 'file')], 202);
    }

    /**
     * Newer compatible versions for installed files that MC Suite knows the hash of.
     */
    public function updates(Request $request, Server $server, string $kind): JsonResponse
    {
        [$info, , , $loaders] = $this->context($request, $server, $kind);
        $records = array_filter($this->records($server, $kind), static fn (array $record): bool => is_string($record['sha1'] ?? null));

        $latest = $this->modrinth->latestForHashes(array_values(array_column($records, 'sha1')), $loaders, $info['version'] ? [$info['version']] : []);

        $updates = [];
        // Market listings have one current file; a different version number is an update.
        foreach ($this->records($server, $kind) as $file => $record) {
            if (($record['provider'] ?? null) === PumpkinMarketProvider::ID) {
                $current = $this->market->currentVersion((string) $record['project']);
                if ($current !== null && $current !== ($record['versionNumber'] ?? null)) {
                    $updates[$file] = ['id' => $record['project'], 'number' => $current, 'name' => $record['title'].' '.$current, 'published' => null];
                }
            }
        }

        foreach ($records as $file => $record) {
            $version = $latest[$record['sha1']] ?? null;
            if ($version !== null && $version['id'] !== $record['version']) {
                $updates[$file] = ['id' => $version['id'], 'number' => $version['number'], 'name' => $version['name'], 'published' => $version['published']];
            }
        }

        return new JsonResponse(['updates' => (object) $updates]);
    }

    /**
     * Matches installed files MC Suite did not install to their Modrinth project by hash,
     * so they get names, icons and update checks too. Large files are skipped.
     */
    public function identify(Request $request, Server $server, string $kind): JsonResponse
    {
        [, $directory] = $this->context($request, $server, $kind);
        $records = $this->records($server, $kind);
        $files = ServerFiles::for($server);

        $hashes = [];
        $total = 0;
        foreach ($files->list($directory) as $name => $file) {
            $base = preg_replace('/\.disabled$/i', '', $name);
            if (! $file['file'] || isset($records[$base]) || ! preg_match('/\.jar$/i', $base) || $file['size'] > self::IDENTIFY_MAX_FILE) {
                continue;
            }

            if ($total + $file['size'] > self::IDENTIFY_MAX_TOTAL) {
                break;
            }

            try {
                $content = $files->read(ServerFiles::join($directory, $name), self::IDENTIFY_MAX_FILE);
            } catch (Throwable) {
                continue;
            }

            if ($content !== null) {
                $total += strlen($content);
                $hashes[sha1($content)] = $base;
            }
        }

        $versions = $this->modrinth->versionsForHashes(array_keys($hashes));
        $projects = $this->modrinth->projects(array_values(array_filter(array_column($versions, 'projectId'))));

        $identified = 0;
        foreach ($versions as $hash => $version) {
            $base = $hashes[$hash] ?? null;
            if ($base === null) {
                continue;
            }

            $project = $projects[$version['projectId']] ?? null;
            $this->saveRecord($server, $kind, $base, [
                'provider' => $this->modrinth->id(),
                'project' => $version['projectId'],
                'version' => $version['id'],
                'versionNumber' => $version['number'],
                'title' => $project['title'] ?? $base,
                'icon' => $project['icon'] ?? null,
                'url' => $project['url'] ?? null,
                'sha1' => $hash,
                'loaders' => $version['loaders'],
                'gameVersions' => array_slice($version['gameVersions'], -5),
                'installedAt' => 0,
                'identified' => true,
            ]);
            $identified++;
        }

        return new JsonResponse(['checked' => count($hashes), 'identified' => $identified]);
    }

    public function toggle(Request $request, Server $server, string $kind, string $file): Response
    {
        [, $directory] = $this->context($request, $server, $kind);
        $data = $request->validate(['enabled' => ['required', 'boolean']]);
        $file = $this->assertFile($file);
        $directory = $this->folderFor($file, $directory);
        $files = ServerFiles::for($server);
        $existing = $files->list($directory);

        if ($data['enabled'] && isset($existing[$file.'.disabled'])) {
            $files->rename($directory, $file.'.disabled', $file);
        } elseif (! $data['enabled'] && isset($existing[$file])) {
            $files->rename($directory, $file, $file.'.disabled');
        }

        Activity::event('server:mc-suite.'.$kind.'.'.($data['enabled'] ? 'enable' : 'disable'))->property('file', $file)->log();

        return response()->noContent();
    }

    public function destroy(Request $request, Server $server, string $kind, string $file): Response
    {
        [, $directory] = $this->context($request, $server, $kind);
        $file = $this->assertFile($file);
        $this->removeFile($server, $kind, $this->folderFor($file, $directory), $file);
        Activity::event('server:mc-suite.'.$kind.'.remove')->property('file', $file)->log();

        return response()->noContent();
    }

    private function removeFile(Server $server, string $kind, string $directory, string $file): void
    {
        $files = ServerFiles::for($server);
        $existing = $files->list($directory);
        $files->delete($directory, array_values(array_filter([$file, $file.'.disabled'], static fn (string $name): bool => isset($existing[$name]))));
        Settings::server($server)->forget($this->recordKey($kind, $file));
    }

    /**
     * @param  array<string, mixed>  $version
     * @param  list<string>  $loaders
     * @return list<array<string, mixed>>
     */
    private function resolveDependencies(Server $server, string $kind, array $version, array $loaders, ?string $gameVersion): array
    {
        $installed = array_column($this->records($server, $kind), 'project');
        $result = [];

        foreach ($version['dependencies'] as $dependency) {
            if ($dependency['type'] !== 'required' || in_array($dependency['projectId'], $installed, true)) {
                continue;
            }

            try {
                if ($dependency['versionId'] !== null) {
                    $resolved = $this->provider($dependency['versionId'])->version($dependency['versionId']);
                } elseif ($dependency['projectId'] !== null) {
                    $candidates = $this->provider($dependency['projectId'])->versions($dependency['projectId'], $loaders, $gameVersion ? [$gameVersion] : []);
                    $resolved = $candidates[0] ?? null;
                } else {
                    $resolved = null;
                }
            } catch (Throwable) {
                $resolved = null;
            }

            $result[] = [
                'projectId' => $resolved['projectId'] ?? $dependency['projectId'],
                'version' => $resolved === null ? null : ['id' => $resolved['id'], 'number' => $resolved['number'], 'name' => $resolved['name']],
            ];
        }

        return $result;
    }

    /**
     * @param  array<string, mixed>  $version
     * @return array{url: string, filename: string, size: int, sha1: string|null}
     */
    private function pickFile(array $version): array
    {
        $files = $version['files'];
        usort($files, static fn (array $a, array $b): int => (int) $b['primary'] <=> (int) $a['primary']);

        foreach ($files as $file) {
            $host = parse_url($file['url'], PHP_URL_HOST);
            if (! str_starts_with($file['url'], 'https://') || ! in_array($host, self::DOWNLOAD_HOSTS, true)) {
                continue;
            }

            if (preg_match(self::FILE, $file['filename']) && $file['filename'][0] !== '.') {
                return $file;
            }
        }

        abort(422, 'This version has no server file MC Suite can install.');
    }

    private function assertFile(string $file): string
    {
        abort_unless(preg_match(self::FILE, $file) && $file[0] !== '.', 422, 'Invalid file name.');

        return $file;
    }

    /** @return array<string, array<string, mixed>> records by file name */
    private function records(Server $server, string $kind): array
    {
        return Settings::server($server)->getByPrefix('content.'.$kind.'.');
    }

    /** @param array<string, mixed> $record */
    private function saveRecord(Server $server, string $kind, string $file, array $record): void
    {
        Settings::server($server)->set($this->recordKey($kind, $file), $record);
    }

    private function recordKey(string $kind, string $file): string
    {
        return 'content.'.$kind.'.'.$file;
    }
}
