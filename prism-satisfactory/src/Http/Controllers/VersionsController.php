<?php

declare(strict_types=1);

namespace PrismSatisfactory\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PrismSatisfactory\Support\Branches;
use PrismSatisfactory\Support\Detector;
use PrismSatisfactory\Support\InstallPlan;
use PrismSatisfactory\Support\ServerConsole;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;

class VersionsController extends Controller
{
    /** The builds there are, which one is installed and which branch the egg follows. */
    public function index(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'versions', 'versions');
        $detector = Detector::for($server);
        $installed = $detector->installed();
        $chosen = $detector->variable('SRCDS_BETAID') ?? 'public';
        $current = Branches::find($chosen);
        // SteamCMD only writes the branch to the app manifest when it downloads something, so a
        // switch between branches on the same build leaves it out: then the build says it all.
        $branch = $installed['branch'];
        if ($branch === 'public' && $chosen !== 'public' && $current !== null && $current['build'] !== null && $current['build'] === $installed['build']) {
            $branch = $chosen;
        }

        return new JsonResponse([
            'branches' => Branches::all(),
            'installed' => ['build' => $installed['build'], 'branch' => $branch, 'changelist' => $info['changelist']],
            'chosen' => $chosen,
            // A newer build on the branch the egg follows than the one installed.
            'update' => $current !== null && $current['build'] !== null && $installed['build'] !== null && (int) $current['build'] > (int) $installed['build'],
            'autoUpdate' => $detector->variable('AUTO_UPDATE') !== '0',
            'running' => ServerConsole::for($server)->isRunning(),
            'job' => InstallPlan::current($server),
        ]);
    }

    /**
     * Switches the branch. The server image runs SteamCMD with the egg's branch when it starts,
     * so this stops the server, sets SRCDS_BETAID and turns the update on start on, and starts it
     * again; the download happens then.
     */
    public function install(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'versions', 'versions');
        $data = $request->validate([
            'branch' => ['required', 'string', 'max:40', 'regex:/^[A-Za-z0-9._-]+$/'],
            'start' => ['sometimes', 'boolean'],
        ]);
        $branch = Branches::find($data['branch']);
        abort_if($branch === null, 422, 'That build is not available.');

        $running = ServerConsole::for($server)->isRunning();
        $plan = InstallPlan::for($server, $data['branch'] === 'public' ? 'Switching to the public build' : 'Switching to the '.$data['branch'].' build')->stopServer();
        $plan->add('variable', ['env' => 'SRCDS_BETAID', 'value' => $data['branch'] === 'public' ? '' : $data['branch']])
            ->add('variable', ['env' => 'AUTO_UPDATE', 'value' => '1', 'optional' => true])
            ->add('refresh');
        if ($running || ($data['start'] ?? true)) {
            $plan->add('power', ['action' => 'start']);
        }

        $job = $plan->dispatch($request->user(), 'versions');
        Activity::event('server:prism-satisfactory.versions.install')->property(['branch' => $data['branch'], 'build' => $branch['build']])->log();

        return new JsonResponse(['job' => $job], 202);
    }
}
