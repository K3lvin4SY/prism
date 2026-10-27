<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PrismCoreKeeper\Support\Branches;
use PrismCoreKeeper\Support\Detector;
use PrismCoreKeeper\Support\InstallPlan;
use PrismCoreKeeper\Support\ServerConsole;
use PrismCoreKeeper\Support\ServerFiles;
use PrismCoreKeeper\Support\StartHook;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;

class VersionsController extends Controller
{
    /** The builds there are, which one is installed and which one is chosen. */
    public function index(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'versions', 'versions');
        $installed = Detector::for($server)->installed();
        $chosen = trim((string) (ServerFiles::for($server)->read('.cks/branch') ?? '')) ?: null;
        $branches = Branches::all();
        $current = null;
        foreach ($branches as $branch) {
            if ($branch['build'] !== null && $branch['build'] === $installed['build']) {
                $current = $branch['id'];
            }
        }
        $current ??= $installed['branch'];
        $public = Branches::find('public');

        return new JsonResponse([
            'branches' => $branches,
            'installed' => ['build' => $installed['build'], 'branch' => $current, 'version' => $info['version']],
            'chosen' => $chosen,
            // A newer public build than the one installed.
            'update' => $current === 'public' && $public !== null && $public['build'] !== null && $installed['build'] !== null && (int) $public['build'] > (int) $installed['build'],
            'autoUpdate' => Detector::for($server)->variable('AUTO_UPDATE') !== '0',
            'hookMissing' => $chosen !== null && ! StartHook::installed($server->fresh()),
            'running' => ServerConsole::for($server)->isRunning(),
            'job' => InstallPlan::current($server),
        ]);
    }

    /**
     * Switches the build. The server does it at its next start (the start step runs SteamCMD
     * with the branch), so this stops the server, sets the branch and starts it again. Legacy
     * builds turn the egg's update on boot off, or it would put the newest build back.
     */
    public function install(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'versions', 'versions');
        $data = $request->validate([
            'branch' => ['required', 'string', 'max:40', 'regex:/^[A-Za-z0-9._-]+$/'],
            'backup' => ['sometimes', 'boolean'],
            'start' => ['sometimes', 'boolean'],
        ]);
        $branch = Branches::find($data['branch']);
        abort_if($branch === null, 422, 'That build is not available.');

        $running = ServerConsole::for($server)->isRunning();
        $plan = InstallPlan::for($server, $data['branch'] === 'public' ? 'Updating to the latest build' : 'Switching to the '.$data['branch'].' build');
        $plan->stopServer();

        // A copy of the worlds folder before going to another build.
        if ($data['backup'] ?? false) {
            $plan->add('archive', ['dir' => StartHook::DATA, 'files' => ['worlds'], 'optional' => true]);
        }

        StartHook::steps($plan)
            ->add('write', ['path' => '.cks/branch', 'content' => base64_encode($data['branch']."\n")])
            // Asking again for the same build makes the start step run SteamCMD once more.
            ->add('delete', ['dir' => '.cks', 'files' => ['branch-installed']])
            ->add('variable', ['env' => 'AUTO_UPDATE', 'value' => $data['branch'] === 'public' ? '1' : '0', 'optional' => true])
            ->add('refresh');

        if ($running || ($data['start'] ?? true)) {
            $plan->add('power', ['action' => 'start']);
        }

        $job = $plan->dispatch($request->user(), 'versions');
        Activity::event('server:prism-corekeeper.versions.install')->property(['branch' => $data['branch'], 'build' => $branch['build']])->log();

        return new JsonResponse(['job' => $job], 202);
    }
}
