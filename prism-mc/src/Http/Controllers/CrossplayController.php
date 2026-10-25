<?php

declare(strict_types=1);

namespace PrismMc\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PrismMc\Support\InstallPlan;
use PrismMc\Support\McJars;
use PrismMc\Support\PlayerData;
use PrismMc\Support\Providers\ModrinthProvider;
use PrismMc\Support\ServerFiles;
use PrismMc\Support\ServerProperties;
use PrismMc\Support\Settings;
use PrismMc\Support\TomlLines;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerVariable;
use RuntimeException;

/**
 * Lets Bedrock players join a Java server: Geyser translates the Bedrock protocol and Floodgate
 * lets them in without a Java account. Bedrock uses the server's own port over UDP, so no
 * extra allocation is needed.
 */
class CrossplayController extends Controller
{
    /** software → [Geyser loader on Modrinth, Floodgate source, folder, Geyser config folders] */
    private const array PLATFORMS = [
        'paper' => ['paper', 'geysermc:spigot', 'plugins', ['plugins/Geyser-Spigot']],
        'purpur' => ['paper', 'geysermc:spigot', 'plugins', ['plugins/Geyser-Spigot']],
        'pufferfish' => ['paper', 'geysermc:spigot', 'plugins', ['plugins/Geyser-Spigot']],
        'leaf' => ['paper', 'geysermc:spigot', 'plugins', ['plugins/Geyser-Spigot']],
        'spigot' => ['spigot', 'geysermc:spigot', 'plugins', ['plugins/Geyser-Spigot']],
        'fabric' => ['fabric', 'modrinth', 'mods', ['config/Geyser-Fabric']],
        'quilt' => ['fabric', 'modrinth', 'mods', ['config/Geyser-Fabric']],
        'neoforge' => ['neoforge', 'modrinth', 'mods', ['config/Geyser-NeoForge']],
        'velocity' => ['velocity', 'geysermc:velocity', 'plugins', ['plugins/geyser', 'plugins/Geyser-Velocity']],
        'waterfall' => ['bungeecord', 'geysermc:bungee', 'plugins', ['plugins/Geyser-BungeeCord']],
        'bungeecord' => ['bungeecord', 'geysermc:bungee', 'plugins', ['plugins/Geyser-BungeeCord']],
    ];

    private const string GEYSER = 'wKkoqHrH';

    private const string FLOODGATE = 'bWrNNfkb';

    public function __construct(private readonly ModrinthProvider $modrinth) {}

    /** @return array{0: array<string, mixed>, 1: array{0: string, 1: string, 2: string, 3: list<string>}|null} */
    private function context(Request $request, Server $server): array
    {
        $info = $this->authorizeFeature($request, $server, 'properties', 'properties');
        abort_unless($info['edition'] === 'java', 404, 'Bedrock servers already accept Bedrock players.');

        return [$info, self::PLATFORMS[$info['software']] ?? null];
    }

    public function show(Request $request, Server $server): JsonResponse
    {
        [$info, $platform] = $this->context($request, $server);
        if ($info['software'] === 'pumpkin') {
            $config = ServerProperties::load($server, $info)->pumpkin();

            return new JsonResponse([
                'supported' => true,
                'native' => true,
                'software' => 'pumpkin',
                'enabled' => $this->pumpkinVariable($server, 'BEDROCK_ENABLED') !== null
                    ? in_array($this->pumpkinVariable($server, 'BEDROCK_ENABLED'), ['1', 'true'], true)
                    : $config?->getRaw('networking.bedrock', 'enabled') === 'true',
                'port' => $server->allocation?->port,
                'job' => null,
            ]);
        }

        if ($platform === null) {
            return new JsonResponse(['supported' => false, 'software' => $info['software']]);
        }

        [, , $folder, $configFolders] = $platform;
        $files = ServerFiles::for($server);
        $jars = array_keys(array_filter($files->list($folder), static fn (array $file): bool => $file['file']));
        $geyser = collect($jars)->first(static fn (string $name): bool => (bool) preg_match('/^geyser.*\.jar$/i', $name));
        $floodgate = collect($jars)->first(static fn (string $name): bool => (bool) preg_match('/^floodgate.*\.jar$/i', $name));

        $config = null;
        foreach ($configFolders as $candidate) {
            $config = $files->read("$candidate/config.yml", 512_000);
            if ($config !== null) {
                break;
            }
        }

        return new JsonResponse([
            'supported' => true,
            'software' => $info['software'],
            'geyser' => $geyser,
            'floodgate' => $floodgate,
            'configured' => $config !== null && preg_match('/^\s*clone-remote-port:\s*true\s*$/m', $config) === 1,
            'port' => $server->allocation?->port,
            'job' => InstallPlan::current($server),
        ]);
    }

    /**
     * Installs Geyser and Floodgate, starts the server once so Geyser writes its config, points
     * Geyser at the server's own port and Floodgate authentication, then restarts.
     */
    public function enable(Request $request, Server $server): JsonResponse
    {
        [$info, $platform] = $this->context($request, $server);
        if ($info['software'] === 'pumpkin') {
            return $this->setPumpkinBedrock($server, $info, true);
        }

        abort_if($platform === null, 422, 'Geyser does not run on '.($info['software'] ?? 'this software').'.');
        abort_unless($this->can($request, $server, $platform[2] === 'mods' ? 'mods' : 'plugins'), 403, 'You also need permission to install '.$platform[2].'.');
        [$loader, $floodgateSource, $folder, $configFolders] = $platform;

        $downloads = [];
        $geyser = $this->modrinthFile(self::GEYSER, $loader, $info['version']);
        $downloads[] = $geyser;

        // Fabric builds need Fabric API, and so on: the required dependencies come along.
        foreach ($geyser['dependencies'] as $dependency) {
            if ($dependency['type'] === 'required' && $dependency['projectId'] !== null && $dependency['projectId'] !== self::FLOODGATE) {
                $downloads[] = $this->modrinthFile($dependency['projectId'], $loader, $info['version']);
            }
        }

        $downloads[] = $floodgateSource === 'modrinth'
            ? $this->modrinthFile(self::FLOODGATE, $loader, $info['version'])
            : $this->geyserMcFile('floodgate', substr($floodgateSource, strlen('geysermc:')));

        $installed = $this->installedFiles($server, $folder);
        $plan = InstallPlan::for($server, 'Setting up Bedrock crossplay')->stopServer();

        foreach ($downloads as $download) {
            // Dependencies already on the server (Fabric API, say) are left alone.
            if (isset($download['project']) && in_array($download['project'], $installed, true)) {
                continue;
            }

            $plan->add('pulls', ['files' => [['url' => $download['url'], 'dir' => $folder, 'file' => $download['filename'], 'size' => $download['size']]]])
                ->add('verify', ['path' => "$folder/{$download['filename']}", 'algorithm' => $download['algorithm'], 'hash' => $download['hash']])
                ->onFailure('delete', ['dir' => $folder, 'files' => [$download['filename']]]);

            if (isset($download['project'])) {
                $plan->add('record', ['key' => "content.$folder.{$download['filename']}", 'value' => [
                    'provider' => 'modrinth',
                    'project' => $download['project'],
                    'version' => $download['version'],
                    'versionNumber' => $download['versionNumber'],
                    'title' => $download['title'],
                    'icon' => $download['icon'],
                    'url' => null,
                    'sha1' => $download['algorithm'] === 'sha1' ? $download['hash'] : null,
                    'size' => $download['size'],
                    'loaders' => [$loader],
                    'gameVersions' => [],
                    'installedAt' => time(),
                ]]);
            }
        }

        $plan->add('property', ['key' => 'enforce-secure-profile', 'value' => 'false'])
            ->add('power', ['action' => 'start'])
            ->add('wait-file', ['candidates' => array_map(static fn (string $dir): string => "$dir/config.yml", $configFolders), 'timeout' => 300])
            ->add('yaml-set', ['candidates' => array_map(static fn (string $dir): string => "$dir/config.yml", $configFolders), 'values' => [
                'clone-remote-port' => 'true',
                'auth-type' => 'floodgate',
            ]])
            ->add('power', ['action' => 'restart']);

        $job = $plan->dispatch($request->user(), 'properties');
        Activity::event('server:prism-mc.crossplay.enable')->property('files', array_column($downloads, 'filename'))->log();

        return new JsonResponse(['job' => $job], 202);
    }

    /**
     * Geyser and Floodgate as installed against their newest builds for this server. Each jar is
     * hashed and compared with the build's published checksum, so it is exact whatever installed it.
     */
    public function updates(Request $request, Server $server): JsonResponse
    {
        [$info, $platform] = $this->context($request, $server);
        abort_if($platform === null || $info['software'] === 'pumpkin', 422, 'There is no Geyser to update here.');

        return new JsonResponse(['components' => array_map(static fn (array $component): array => array_diff_key($component, ['latestFile' => true]), $this->components($server, $info, $platform))]);
    }

    /**
     * Replaces whichever of Geyser and Floodgate has a newer build: the server stops, the old jar
     * is moved aside, the new one is downloaded and checked, the old one is deleted, and the
     * server starts again if it was running. If anything fails the old jar is put back.
     */
    public function update(Request $request, Server $server): JsonResponse
    {
        [$info, $platform] = $this->context($request, $server);
        abort_if($platform === null || $info['software'] === 'pumpkin', 422, 'There is no Geyser to update here.');
        abort_unless($this->can($request, $server, $platform[2] === 'mods' ? 'mods' : 'plugins'), 403, 'You also need permission to install '.$platform[2].'.');
        [$loader, , $folder] = $platform;

        $outdated = array_values(array_filter($this->components($server, $info, $platform), static fn (array $component): bool => $component['installed'] !== null && ! $component['upToDate']));
        abort_if($outdated === [], 422, 'Geyser and Floodgate are up to date.');

        $running = PlayerData::for($server, $info['edition'])->isRunning();
        $plan = InstallPlan::for($server, 'Updating Bedrock crossplay')->stopServer();

        // Every new jar is downloaded and checked before any old one is deleted, so a failure
        // can put each old jar back.
        foreach ($outdated as $component) {
            $old = $component['installed'];
            $new = $component['latestFile'];
            $aside = "$old.prism-old";

            $plan->add('rename', ['dir' => $folder, 'from' => $old, 'to' => $aside]);
            if ($new['filename'] !== $old) {
                $plan->onFailure('delete', ['dir' => $folder, 'files' => [$new['filename']]]);
            }
            $plan->onFailure('rename', ['dir' => $folder, 'from' => $aside, 'to' => $old, 'optional' => true])
                ->add('pulls', ['files' => [['url' => $new['url'], 'dir' => $folder, 'file' => $new['filename'], 'size' => $new['size']]]])
                ->add('verify', ['path' => "$folder/{$new['filename']}", 'algorithm' => $new['algorithm'], 'hash' => $new['hash']]);
        }

        foreach ($outdated as $component) {
            $old = $component['installed'];
            $new = $component['latestFile'];
            $plan->add('delete', ['dir' => $folder, 'files' => ["$old.prism-old"]])
                ->add('forget', ['key' => "content.$folder.$old"]);

            if (isset($new['project'])) {
                $plan->add('record', ['key' => "content.$folder.{$new['filename']}", 'value' => [
                    'provider' => 'modrinth',
                    'project' => $new['project'],
                    'version' => $new['version'],
                    'versionNumber' => $new['versionNumber'],
                    'title' => $new['title'],
                    'icon' => $new['icon'],
                    'url' => null,
                    'sha1' => $new['hash'],
                    'size' => $new['size'],
                    'loaders' => [$loader],
                    'gameVersions' => [],
                    'installedAt' => time(),
                ]]);
            }
        }

        // Running before, running after, whether the update went through or was rolled back.
        if ($running) {
            $plan->add('power', ['action' => 'start'])->onFailure('power', ['action' => 'start']);
        }

        $job = $plan->dispatch($request->user(), 'properties');
        Activity::event('server:prism-mc.crossplay.update')->property('files', array_map(static fn (array $component): string => $component['latestFile']['filename'], $outdated))->log();

        return new JsonResponse(['job' => $job], 202);
    }

    /**
     * Geyser and Floodgate: the jar on the server, the newest build's version and file, and
     * whether the jar is that build.
     *
     * @param  array<string, mixed>  $info
     * @param  array{0: string, 1: string, 2: string, 3: list<string>}  $platform
     * @return list<array{name: string, installed: string|null, latest: string, upToDate: bool, latestFile: array<string, mixed>}>
     */
    private function components(Server $server, array $info, array $platform): array
    {
        [$loader, $floodgateSource, $folder] = $platform;
        $files = ServerFiles::for($server);
        $jars = array_keys(array_filter($files->list($folder), static fn (array $file): bool => $file['file']));
        $latest = [
            'Geyser' => $this->modrinthFile(self::GEYSER, $loader, $info['version']),
            'Floodgate' => $floodgateSource === 'modrinth' ? $this->modrinthFile(self::FLOODGATE, $loader, $info['version']) : $this->geyserMcFile('floodgate', substr($floodgateSource, strlen('geysermc:'))),
        ];

        $components = [];
        foreach ($latest as $name => $file) {
            $installed = collect($jars)->first(static fn (string $jar): bool => (bool) preg_match('/^'.strtolower($name).'.*\.jar$/i', $jar));
            $upToDate = false;
            if ($installed !== null) {
                $content = $files->read("$folder/$installed", 80 * 1024 * 1024);
                $upToDate = $content !== null && hash_equals(strtolower((string) $file['hash']), hash($file['algorithm'], $content));
                unset($content);
            }

            $components[] = [
                'name' => $name,
                'installed' => $installed,
                'latest' => $file['versionNumber'] ?? $file['filename'],
                'upToDate' => $upToDate,
                'latestFile' => $file,
            ];
        }

        return $components;
    }

    /** Removes the Geyser and Floodgate jars. Their config folders stay. */
    public function disable(Request $request, Server $server): JsonResponse
    {
        [$info, $platform] = $this->context($request, $server);
        if ($info['software'] === 'pumpkin') {
            return $this->setPumpkinBedrock($server, $info, false);
        }

        abort_if($platform === null, 404);
        [, , $folder] = $platform;

        $files = ServerFiles::for($server);
        $jars = array_values(array_filter(array_keys($files->list($folder)), static fn (string $name): bool => (bool) preg_match('/^(geyser|floodgate).*\.jar$/i', $name)));
        $files->delete($folder, $jars);
        foreach ($jars as $jar) {
            Settings::server($server)->forget("content.$folder.$jar");
        }

        Activity::event('server:prism-mc.crossplay.disable')->property('files', $jars)->log();

        return new JsonResponse(['removed' => $jars]);
    }

    /**
     * Pumpkin speaks Bedrock itself. Its egg rewrites the Bedrock switch and port from startup
     * variables on every start, so those change too, with the port set to the server's own.
     *
     * @param  array<string, mixed>  $info
     */
    private function setPumpkinBedrock(Server $server, array $info, bool $enabled): JsonResponse
    {
        $port = $server->allocation?->port;
        abort_if($port === null, 422, 'The server has no allocation.');

        $this->setPumpkinVariable($server, 'BEDROCK_ENABLED', $enabled ? '1' : '0');
        if ($enabled && $port >= 1024) {
            $this->setPumpkinVariable($server, 'BEDROCK_PORT', (string) $port);
        }

        $properties = ServerProperties::load($server, $info);
        if ($config = $properties->pumpkin()) {
            $config->setRaw('networking.bedrock', 'enabled', $enabled ? 'true' : 'false');
            if ($enabled) {
                $config->setRaw('networking.bedrock.nethernet', 'address', TomlLines::string('0.0.0.0:'.$port));
            }

            $properties->save();
        }

        Activity::event('server:prism-mc.crossplay.'.($enabled ? 'enable' : 'disable'))->property('native', true)->log();

        return new JsonResponse(['enabled' => $enabled, 'port' => $port]);
    }

    private function pumpkinVariable(Server $server, string $env): ?string
    {
        $variable = $server->variables->firstWhere('env_variable', $env);

        return $variable ? (string) ($variable->server_value ?? $variable->default_value) : null;
    }

    private function setPumpkinVariable(Server $server, string $env, string $value): void
    {
        $variable = $server->egg?->variables()->where('env_variable', $env)->first();
        if ($variable !== null) {
            ServerVariable::query()->updateOrCreate(['server_id' => $server->id, 'variable_id' => $variable->id], ['variable_value' => $value]);
        }
    }

    /** @return list<string> Modrinth project ids already recorded in the folder */
    private function installedFiles(Server $server, string $folder): array
    {
        return array_values(array_filter(array_column(Settings::server($server)->getByPrefix("content.$folder."), 'project')));
    }

    /** @return array<string, mixed> the newest file of a project for a loader and game version */
    private function modrinthFile(string $project, string $loader, ?string $gameVersion): array
    {
        $versions = $this->modrinth->versions($project, [$loader], $gameVersion ? [$gameVersion] : []);
        $version = $versions[0] ?? null;
        abort_if($version === null, 422, sprintf('%s has no build for %s%s yet.', $project === self::GEYSER ? 'Geyser' : 'A required mod', $loader, $gameVersion ? ' '.$gameVersion : ''));

        $file = collect($version['files'])->sortByDesc('primary')->first();
        abort_unless($file && parse_url($file['url'], PHP_URL_HOST) === 'cdn.modrinth.com', 422, 'No downloadable file was found.');
        $meta = $this->modrinth->projects([$project])[$project] ?? null;

        return [
            'url' => $file['url'],
            'filename' => basename($file['filename']),
            'size' => $file['size'],
            'algorithm' => 'sha1',
            'hash' => $file['sha1'],
            'dependencies' => $version['dependencies'],
            'project' => $project,
            'version' => $version['id'],
            'versionNumber' => $version['number'],
            'title' => $meta['title'] ?? $file['filename'],
            'icon' => $meta['icon'] ?? null,
        ];
    }

    /** @return array<string, mixed> the latest build from GeyserMC's own download API */
    private function geyserMcFile(string $project, string $platform): array
    {
        $build = Cache::remember("ext:prism-mc:geysermc:$project", 600, static function () use ($project): array {
            $response = Http::withUserAgent(McJars::USER_AGENT)->timeout(15)->get("https://download.geysermc.org/v2/projects/$project/versions/latest/builds/latest");
            throw_unless($response->successful(), RuntimeException::class, 'GeyserMC did not answer.');

            return $response->json();
        });

        $download = $build['downloads'][$platform] ?? null;
        abort_if(! is_array($download), 422, "There is no $project build for this platform.");

        return [
            'url' => sprintf('https://download.geysermc.org/v2/projects/%s/versions/%s/builds/%d/downloads/%s', $project, $build['version'], $build['build'], $platform),
            'versionNumber' => sprintf('%s build %d', $build['version'], $build['build']),
            'filename' => basename((string) $download['name']),
            'size' => null,
            'algorithm' => 'sha256',
            'hash' => $download['sha256'],
            'dependencies' => [],
        ];
    }
}
