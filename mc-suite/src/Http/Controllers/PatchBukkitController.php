<?php

declare(strict_types=1);

namespace McSuite\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use McSuite\Support\Detector;
use McSuite\Support\InstallPlan;
use McSuite\Support\PatchBukkit;
use McSuite\Support\PumpkinReleases;
use McSuite\Support\Settings;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * PatchBukkit on Pumpkin servers: whether it is there, whether the image has the Java it
 * needs, and installing or updating it to the build that matches the server's Pumpkin.
 */
class PatchBukkitController extends Controller
{
    public function show(Request $request, Server $server): JsonResponse
    {
        $this->pumpkin($request, $server);
        $patchBukkit = PatchBukkit::for($server);

        try {
            $release = $patchBukkit->release($this->pumpkinTag($server));
        } catch (Throwable) {
            $release = null;
        }

        $images = array_filter($server->egg?->docker_images ?? [], static fn (string $image): bool => (PatchBukkit::javaOf($image) ?? 0) >= PatchBukkit::JAVA);

        return new JsonResponse([
            'installed' => $patchBukkit->installed(),
            'record' => $patchBukkit->record(),
            'available' => $release ? ['tag' => $release['tag'], 'name' => $release['name'], 'size' => $release['size']] : null,
            'folder' => $patchBukkit->pluginFolder(),
            // The musl build cannot load native plugins; MC Suite switches the egg to glibc.
            'glibc' => $this->usesGlibc($server),
            'canSwitchBuild' => $this->downloadVariable($server) !== false,
            // PatchBukkit is built against Pumpkin's releases; the rolling builds can crash with it.
            'rolling' => in_array($this->pumpkinTag($server), ['nightly', 'canary'], true),
            'java' => [
                'needed' => PatchBukkit::JAVA,
                'image' => $server->image,
                'version' => $patchBukkit->imageJava(),
                // Images of the egg that have new enough Java, by display name.
                'images' => (object) $images,
                'canChange' => $request->user()->can('startup.docker-image', $server),
            ],
            'job' => InstallPlan::current($server),
        ]);
    }

    public function install(Request $request, Server $server): JsonResponse
    {
        $this->pumpkin($request, $server);
        $patchBukkit = PatchBukkit::for($server);
        $release = $patchBukkit->release($this->pumpkinTag($server));

        $plan = InstallPlan::for($server, 'Installing PatchBukkit '.$release['name'])->addSteps($patchBukkit->steps($release));

        // Pumpkin's musl build cannot load PatchBukkit: reinstall it as the glibc build.
        $tag = $this->pumpkinTag($server);
        if ($tag !== null && ! $this->usesGlibc($server) && $this->downloadVariable($server) !== false && $server->canBeReinstalled()) {
            $plan->stopServer()
                ->add('variable', ['env' => PatchBukkit::DOWNLOAD_VARIABLE, 'value' => PatchBukkit::glibcBinary($tag)])
                ->add('reinstall')
                ->add('wait-installed')
                ->add('refresh');
        }

        $job = $plan->dispatch($request->user(), 'plugins');

        Activity::event('server:mc-suite.plugins.patchbukkit')->property(['tag' => $release['tag']])->log();

        return new JsonResponse(['job' => $job], 202);
    }

    /** @return array<string, mixed> */
    private function pumpkin(Request $request, Server $server): array
    {
        $info = $this->authorizeFeature($request, $server, 'plugins', 'plugins');
        abort_unless($info['software'] === 'pumpkin', 404, 'PatchBukkit is for Pumpkin servers.');

        return $info;
    }

    private function usesGlibc(Server $server): bool
    {
        $value = $this->downloadVariable($server);

        return is_string($value) && str_ends_with($value, '/pumpkin-X64-Linux');
    }

    /** The egg's DL_PATH value, null when empty, or false when the egg has none or an admin set it by hand. */
    private function downloadVariable(Server $server): string|false|null
    {
        if (! $server->egg?->variables()->where('env_variable', PatchBukkit::DOWNLOAD_VARIABLE)->exists()) {
            return false;
        }

        $value = Detector::for($server)->variable(PatchBukkit::DOWNLOAD_VARIABLE);

        return PatchBukkit::isOurDownload($value) ? $value : false;
    }

    /**
     * The Pumpkin release tag the server runs, such as 0.2.0+26.3-26.51 or nightly: from what
     * MC Suite installed, or else the egg's version variable.
     */
    private function pumpkinTag(Server $server): ?string
    {
        $record = Settings::server($server)->get('software');
        if (is_array($record) && ($record['software'] ?? null) === 'pumpkin' && is_string($record['tag'] ?? null)) {
            return $record['tag'];
        }

        $tag = Detector::for($server)->variable(Detector::PUMPKIN_VARIABLE);
        if ($tag === 'latest') {
            foreach (PumpkinReleases::all() as $release) {
                if (! $release['rolling']) {
                    return $release['tag'];
                }
            }
        }

        return $tag;
    }
}
