<?php

declare(strict_types=1);

namespace McSuite\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use McSuite\Support\Detector;
use McSuite\Support\InstallPlan;
use McSuite\Support\McJars;
use McSuite\Support\ServerFiles;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;

class VersionsController extends Controller
{
    private const string BEDROCK_VERSIONS = 'https://raw.githubusercontent.com/Bedrock-OSS/BDS-Versions/main/versions.json';

    private const string BEDROCK_CDN = 'https://www.minecraft.net/bedrockdedicatedserver';

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
            'types' => $info['edition'] === 'java' ? McJars::types() : null,
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

        return new JsonResponse(['versions' => McJars::versions($type)]);
    }

    public function builds(Request $request, Server $server, string $type, string $version): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'versions', 'versions');

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
            'bedrock' => ['required_without:build', 'string', 'regex:/^\d+\.\d+\.\d+\.\d+$/'],
            'preview' => ['sometimes', 'boolean'],
            'start' => ['sometimes', 'boolean'],
        ]);

        if ($info['edition'] === 'bedrock') {
            abort_unless(isset($data['bedrock']), 422, 'Pick a Bedrock version.');

            return $this->installBedrock($request, $server, $data['bedrock'], (bool) ($data['preview'] ?? false), (bool) ($data['start'] ?? false));
        }

        abort_unless(isset($data['build']), 422, 'Pick a build.');
        $build = McJars::build((int) $data['build']);
        $type = (string) ($build['type'] ?? '');
        $groups = $build['installation'] ?? [];
        abort_if(! is_array($groups) || $groups === [], 422, 'This build cannot be installed automatically.');

        $software = Detector::softwareForMcJars($type);
        abort_if($software === null || $software === 'bedrock', 422, 'This software is not supported.');

        $jar = Detector::for($server)->jarFile();
        $plan = InstallPlan::for($server, sprintf('Installing %s %s', $build['type'], $build['versionId'] ?? ''))
            ->stopServer()
            ->add('rename', ['dir' => dirname($jar) === '.' ? '' : dirname($jar), 'from' => basename($jar), 'to' => basename($jar).'.old', 'optional' => true]);

        foreach ($groups as $group) {
            foreach ($group as $step) {
                match ($step['type'] ?? null) {
                    'download' => $plan->add('pull', [
                        'url' => self::httpsUrl($step['url'] ?? ''),
                        'dir' => self::directoryOf($step['file'] === 'server.jar' ? $jar : $step['file']),
                        'file' => basename($step['file'] === 'server.jar' ? $jar : ServerFiles::normalize($step['file'])),
                        'size' => $step['size'] ?? null,
                    ]),
                    'unzip' => $plan->add('unzip', ['dir' => ServerFiles::normalize($step['location'] ?? ''), 'file' => ServerFiles::normalize($step['file'])]),
                    'remove' => $plan->add('delete', ['dir' => self::directoryOf($step['location']), 'files' => [basename(ServerFiles::normalize($step['location']))]]),
                    default => abort(422, 'This build uses an install step MC Suite does not know.'),
                };
            }
        }

        if ($jar !== 'server.jar') {
            $plan->add('rename', ['dir' => '', 'from' => 'server.jar', 'to' => $jar, 'optional' => true]);
        }

        $plan->add('record', ['key' => 'software', 'value' => [
            'software' => $software,
            'version' => $build['versionId'] ?? null,
            'build' => $build['projectVersionId'] ?? $build['name'] ?? null,
            'buildId' => $build['id'] ?? null,
            'installed' => now()->toAtomString(),
        ]])->add('refresh');

        if ($data['start'] ?? false) {
            $plan->add('power', ['action' => 'start']);
        }

        $job = $plan->dispatch($request->user(), 'versions');
        Activity::event('server:mc-suite.version.install')->property(['software' => $software, 'version' => $build['versionId'] ?? null, 'build' => $build['id'] ?? null])->log();

        return new JsonResponse(['job' => $job], 202);
    }

    private function installBedrock(Request $request, Server $server, string $version, bool $preview, bool $start): JsonResponse
    {
        $known = $this->bedrockVersions();
        abort_unless(in_array($version, $preview ? $known['preview'] : $known['versions'], true), 422, 'Unknown Bedrock version.');

        $folder = $preview ? 'bin-linux-preview' : 'bin-linux';
        $zip = '.mcsuite-bedrock.zip';
        $plan = InstallPlan::for($server, 'Installing Bedrock '.$version)->stopServer()->add('mkdir', ['path' => '.mcsuite-keep']);

        foreach (self::BEDROCK_KEEP as $file) {
            $plan->add('rename', ['dir' => '', 'from' => $file, 'to' => '.mcsuite-keep/'.$file, 'optional' => true]);
        }

        $plan->add('relay', ['url' => sprintf('%s/%s/bedrock-server-%s.zip', self::BEDROCK_CDN, $folder, $version), 'dir' => '', 'file' => $zip])
            ->add('unzip', ['dir' => '', 'file' => $zip])
            ->add('delete', ['dir' => '', 'files' => [$zip]]);

        foreach (self::BEDROCK_KEEP as $file) {
            $plan->add('rename', ['dir' => '', 'from' => '.mcsuite-keep/'.$file, 'to' => $file, 'optional' => true]);
        }

        $plan->add('delete', ['dir' => '', 'files' => ['.mcsuite-keep']])
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
        Activity::event('server:mc-suite.version.install')->property(['software' => 'bedrock', 'version' => $version])->log();

        return new JsonResponse(['job' => $job], 202);
    }

    /** @return array{stable: string|null, preview: list<string>, versions: list<string>, latestPreview: string|null} */
    private function bedrockVersions(): array
    {
        return Cache::remember('ext:mc-suite:bedrock:versions', 3600, function (): array {
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

    private static function directoryOf(string $path): string
    {
        $path = ServerFiles::normalize($path);

        return str_contains($path, '/') ? dirname($path) : '';
    }

    private static function httpsUrl(string $url): string
    {
        abort_unless(preg_match('#^https://[^\s/]+/\S+$#', $url) === 1, 422, 'The build has an invalid download link.');

        return $url;
    }
}
