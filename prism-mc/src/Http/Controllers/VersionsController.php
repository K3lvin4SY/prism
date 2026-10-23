<?php

declare(strict_types=1);

namespace PrismMc\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PrismMc\Support\Detector;
use PrismMc\Support\InstallPlan;
use PrismMc\Support\McJars;
use PrismMc\Support\McJarsInstaller;
use PrismMc\Support\PatchBukkit;
use PrismMc\Support\PumpkinReleases;
use PrismMc\Support\WorldVersion;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use Throwable;

class VersionsController extends Controller
{
    private const string BEDROCK_VERSIONS = 'https://raw.githubusercontent.com/Bedrock-OSS/BDS-Versions/main/versions.json';

    private const string BEDROCK_CDN = 'https://www.minecraft.net/bedrockdedicatedserver';

    /** The version variable of the common Bedrock eggs. */
    private const string BEDROCK_VARIABLE = 'BEDROCK_VERSION';

    /** Files a Bedrock update must never overwrite. */
    private const array BEDROCK_KEEP = ['server.properties', 'allowlist.json', 'permissions.json', 'whitelist.json'];

    /**
     * The server's current software and build, the software catalogue, and whether an install is running.
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'versions', 'versions');

        return new JsonResponse([
            'info' => $info,
            'types' => $info['edition'] === 'java' ? $this->types() : null,
            // Pumpkin and the Java servers start differently, so only the egg can switch between them.
            'pumpkinEgg' => $this->hasPumpkinEgg($server),
            // What the world was last saved as: Pumpkin refuses worlds newer than a build knows.
            'worldDataVersion' => $info['software'] === 'pumpkin' ? WorldVersion::dataVersion($server) : null,
            'job' => InstallPlan::current($server),
            'dockerImage' => $server->image,
            'dockerImages' => $server->egg?->docker_images ?? [],
            'canChangeImage' => $request->user()->can('startup.docker-image', $server),
        ]);
    }

    public function versions(Request $request, Server $server, string $type): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'versions', 'versions');

        if ($info['edition'] === 'bedrock') {
            return new JsonResponse(['versions' => $this->bedrockVersions()]);
        }

        if (strtoupper($type) === PumpkinReleases::TYPE) {
            return new JsonResponse(['versions' => PumpkinReleases::versions()]);
        }

        return new JsonResponse(['versions' => McJars::versions($type)]);
    }

    public function builds(Request $request, Server $server, string $type, string $version): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'versions', 'versions');

        if (strtoupper($type) === PumpkinReleases::TYPE) {
            return new JsonResponse(['builds' => PumpkinReleases::builds($version)]);
        }

        return new JsonResponse(['builds' => McJars::builds($type, $version)]);
    }

    /**
     * Swaps the server software for an mcjars build: stops the server, moves the old jar aside,
     * runs the build's install steps on Wings and records what was installed.
     */
    public function install(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'versions', 'versions');
        $data = $request->validate([
            'build' => ['required_without:bedrock', 'integer', 'min:1'],
            'type' => ['sometimes', 'string', 'max:32'],
            'newWorld' => ['sometimes', 'boolean'],
            'keepBackup' => ['sometimes', 'boolean'],
            'bedrock' => ['required_without:build', 'string', 'regex:/^\d+\.\d+\.\d+\.\d+$/'],
            'preview' => ['sometimes', 'boolean'],
            'start' => ['sometimes', 'boolean'],
        ]);

        if ($info['edition'] === 'bedrock') {
            abort_unless(isset($data['bedrock']), 422, 'Pick a Bedrock version.');

            return $this->installBedrock($request, $server, $data['bedrock'], (bool) ($data['preview'] ?? false), (bool) ($data['start'] ?? false));
        }

        abort_unless(isset($data['build']), 422, 'Pick a build.');

        if (strtoupper($data['type'] ?? '') === PumpkinReleases::TYPE) {
            return $this->installPumpkin($request, $server, (int) $data['build'], (bool) ($data['start'] ?? false), (bool) ($data['newWorld'] ?? false), (bool) ($data['keepBackup'] ?? true));
        }

        abort_if($this->hasPumpkinEgg($server), 422, 'This server uses the Pumpkin egg, which only starts Pumpkin. Ask an administrator to change the egg to switch to Java server software.');
        $build = McJars::build((int) $data['build']);
        $software = McJarsInstaller::softwareFor($build);

        $jar = Detector::for($server)->jarFile();
        $plan = InstallPlan::for($server, sprintf('Installing %s %s', $build['type'], $build['versionId'] ?? $build['projectVersionId'] ?? $build['name'] ?? ''))
            ->stopServer()
            ->addSteps(McJarsInstaller::steps($build, $jar))
            // If the new jar never arrived, the old one goes back.
            ->onFailure('rename', ['dir' => dirname($jar) === '.' ? '' : dirname($jar), 'from' => basename($jar).'.old', 'to' => basename($jar), 'optional' => true, 'ifMissing' => true]);

        if ($data['start'] ?? false) {
            $plan->add('power', ['action' => 'start']);
        }

        $job = $plan->dispatch($request->user(), 'versions');
        Activity::event('server:prism-mc.version.install')->property(['software' => $software, 'version' => $build['versionId'] ?? null, 'build' => $build['id'] ?? null])->log();

        return new JsonResponse(['job' => $job], 202);
    }

    private function installBedrock(Request $request, Server $server, string $version, bool $preview, bool $start): JsonResponse
    {
        $known = $this->bedrockVersions();
        abort_unless(in_array($version, $preview ? $known['preview'] : $known['versions'], true), 422, 'Unknown Bedrock version.');

        // Eggs with a version variable download the server themselves, with a browser-like client,
        // and keep server.properties, permissions and the allowlist. That works on every node.
        if (! $preview && $server->egg?->variables()->where('env_variable', self::BEDROCK_VARIABLE)->exists() && $server->canBeReinstalled()) {
            $plan = InstallPlan::for($server, 'Installing Bedrock '.$version)
                ->stopServer()
                ->add('variable', ['env' => self::BEDROCK_VARIABLE, 'value' => $version])
                ->add('reinstall')
                ->add('wait-installed')
                ->add('record', ['key' => 'software', 'value' => ['software' => 'bedrock', 'version' => $version, 'build' => null, 'buildId' => null, 'installed' => now()->toAtomString()]])
                ->add('refresh');

            if ($start) {
                $plan->add('power', ['action' => 'start']);
            }

            $job = $plan->dispatch($request->user(), 'versions');
            Activity::event('server:prism-mc.version.install')->property(['software' => 'bedrock', 'version' => $version, 'method' => 'egg'])->log();

            return new JsonResponse(['job' => $job], 202);
        }

        $folder = $preview ? 'bin-linux-preview' : 'bin-linux';
        $zip = '.prism-mc-bedrock.zip';
        $plan = InstallPlan::for($server, 'Installing Bedrock '.$version)->stopServer()->add('mkdir', ['path' => '.prism-mc-keep']);

        foreach (self::BEDROCK_KEEP as $file) {
            $plan->add('rename', ['dir' => '', 'from' => $file, 'to' => '.prism-mc-keep/'.$file, 'optional' => true]);
            // On failure the kept files go back, replacing any the archive brought.
            $plan->onFailure('rename', ['dir' => '', 'from' => '.prism-mc-keep/'.$file, 'to' => $file, 'optional' => true]);
        }

        $plan->onFailure('delete', ['dir' => '', 'files' => ['.prism-mc-keep', $zip]]);

        $plan->add('relay', ['url' => sprintf('%s/%s/bedrock-server-%s.zip', self::BEDROCK_CDN, $folder, $version), 'dir' => '', 'file' => $zip])
            ->add('unzip', ['dir' => '', 'file' => $zip])
            ->add('delete', ['dir' => '', 'files' => [$zip]]);

        foreach (self::BEDROCK_KEEP as $file) {
            $plan->add('rename', ['dir' => '', 'from' => '.prism-mc-keep/'.$file, 'to' => $file, 'optional' => true]);
        }

        $plan->add('delete', ['dir' => '', 'files' => ['.prism-mc-keep']])
            ->add('record', ['key' => 'software', 'value' => [
                'software' => 'bedrock',
                'version' => $version,
                'build' => $preview ? 'preview' : null,
                'buildId' => null,
                'installed' => now()->toAtomString(),
            ]])
            ->add('refresh');

        if ($start) {
            $plan->add('power', ['action' => 'start']);
        }

        $job = $plan->dispatch($request->user(), 'versions');
        Activity::event('server:prism-mc.version.install')->property(['software' => 'bedrock', 'version' => $version])->log();

        return new JsonResponse(['job' => $job], 202);
    }

    /**
     * Pumpkin builds come from the egg's own install script: the version variable picks the
     * release, and a reinstall downloads it. The world and pumpkin.toml are left alone.
     */
    private function installPumpkin(Request $request, Server $server, int $id, bool $start, bool $newWorld, bool $keepBackup = true): JsonResponse
    {
        $release = PumpkinReleases::find($id);
        abort_if($release === null, 422, 'Unknown Pumpkin build.');
        abort_unless($this->hasPumpkinEgg($server), 422, 'Pumpkin needs the Pumpkin egg, which starts the Pumpkin binary instead of a jar. Ask an administrator to change the egg.');
        abort_unless($server->canBeReinstalled(), 409, 'The server is busy. Try again in a moment.');

        // A world saved by a newer build does not open on an older one, and the server would not start.
        $range = PumpkinReleases::worldRange($release['tag']);
        $world = WorldVersion::dataVersion($server);
        $opens = $range === null || $world === null || ($world >= $range[0] && $world <= $range[1]);
        abort_if(! $opens && ! $newWorld, 422, sprintf(
            'This world was saved as data version %d, and Pumpkin %s opens %d to %d. Pick a build that opens it, or start a new world.',
            $world, $release['name'], $range[0] ?? 0, $range[1] ?? 0,
        ));

        $plan = InstallPlan::for($server, 'Installing Pumpkin '.$release['name'])->stopServer();

        $backup = null;
        if (! $opens) {
            // The old world moves aside under a name of its own; if anything fails, it comes back.
            $level = WorldVersion::levelName($server);
            $folder = dirname($level) === '.' ? '' : dirname($level);
            $backup = ['dir' => $folder, 'name' => basename($level).'-backup-'.now()->format('Ymd-His')];
            $plan->add('rename', ['dir' => $folder, 'from' => basename($level), 'to' => $backup['name']])
                ->onFailure('rename', ['dir' => $folder, 'from' => $backup['name'], 'to' => basename($level), 'optional' => true, 'ifMissing' => true]);
        }

        $plan->add('variable', ['env' => Detector::PUMPKIN_VARIABLE, 'value' => $release['tag']]);

        // With PatchBukkit, Pumpkin has to be the glibc build, which the egg only installs from
        // a download URL. A URL an administrator set by hand is left alone.
        $download = $server->egg?->variables()->where('env_variable', PatchBukkit::DOWNLOAD_VARIABLE)->exists()
            ? Detector::for($server)->variable(PatchBukkit::DOWNLOAD_VARIABLE)
            : false;
        if ($download !== false && PatchBukkit::isOurDownload($download)) {
            $plan->add('variable', ['env' => PatchBukkit::DOWNLOAD_VARIABLE, 'value' => PatchBukkit::for($server)->installed() !== null ? PatchBukkit::glibcBinary($release['tag']) : '']);
        }

        $plan
            ->add('reinstall')
            ->add('wait-installed')
            // With its line-editing console on, Pumpkin never reads the Panel's stop command.
            ->add('property', ['key' => 'console-tty', 'value' => 'false'])
            ->add('record', ['key' => 'software', 'value' => [
                'software' => 'pumpkin',
                'version' => $release['minecraft'],
                'build' => $release['name'],
                'buildId' => $release['id'],
                'tag' => $release['tag'],
                'installed' => now()->toAtomString(),
            ]])
            ->add('refresh');

        // Without a backup, the old world goes only once the new build is in place.
        if ($backup !== null && ! $keepBackup) {
            $plan->add('delete', ['dir' => $backup['dir'], 'files' => [$backup['name']]]);
        }

        if ($start) {
            $plan->add('power', ['action' => 'start']);
        }

        $job = $plan->dispatch($request->user(), 'versions');
        Activity::event('server:prism-mc.version.install')->property(['software' => 'pumpkin', 'version' => $release['minecraft'], 'build' => $release['tag']])->log();

        return new JsonResponse(['job' => $job], 202);
    }

    /** The mcjars catalogue with Pumpkin added to the experimental group. */
    private function types(): array
    {
        $types = McJars::types();
        try {
            $types['experimental'][PumpkinReleases::TYPE] = PumpkinReleases::type();
        } catch (\Throwable) {
            // GitHub is unreachable; the rest of the catalogue still works.
        }

        return $types;
    }

    private function hasPumpkinEgg(Server $server): bool
    {
        return $server->egg?->variables()->where('env_variable', Detector::PUMPKIN_VARIABLE)->exists() ?? false;
    }

    /** @return array{stable: string|null, preview: list<string>, versions: list<string>, latestPreview: string|null} */
    private function bedrockVersions(): array
    {
        return Cache::remember('ext:prism-mc:bedrock:versions', 3600, function (): array {
            $data = Http::withUserAgent(McJars::USER_AGENT)->timeout(15)->get(self::BEDROCK_VERSIONS)->json('linux') ?? [];
            $versions = array_values(array_filter($data['versions'] ?? [], 'is_string'));
            $previews = array_values(array_filter($data['preview_versions'] ?? [], 'is_string'));

            return [
                'stable' => $data['stable'] ?? null,
                'latestPreview' => $data['preview'] ?? null,
                'versions' => array_reverse($versions),
                'preview' => array_reverse($previews),
            ];
        });
    }

}
