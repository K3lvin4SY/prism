<?php

declare(strict_types=1);

namespace PrismFactorio\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PrismFactorio\Support\Detector;
use PrismFactorio\Support\InstallPlan;
use PrismFactorio\Support\ModLibrary;
use PrismFactorio\Support\Releases;
use PrismFactorio\Support\ServerConsole;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;

class VersionsController extends Controller
{
    /** The versions there are, the installed one and the one the egg is set to. */
    public function index(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'versions', 'versions');
        $releases = Releases::all();
        $chosen = Detector::for($server)->variable('FACTORIO_VERSION') ?? 'latest';
        $installed = $info['version'];

        // Mods from the portal, which may not have a release for another game version.
        $mods = [];
        foreach (ModLibrary::for($server)->records() as $record) {
            $mods[] = ['name' => (string) $record['name'], 'title' => (string) ($record['title'] ?? $record['name'])];
        }

        return new JsonResponse([
            ...$releases,
            'installed' => $installed,
            'chosen' => $chosen,
            // The egg installs the newest stable version again on reinstall.
            'update' => $chosen === 'latest' && $installed !== null && $releases['stable'] !== null && version_compare($releases['stable'], $installed, '>'),
            'mods' => $mods,
            'running' => ServerConsole::for($server)->isRunning(),
            'job' => InstallPlan::current($server),
        ]);
    }

    /**
     * Installs a version: sets the egg's FACTORIO_VERSION and reinstalls the server, which
     * downloads that version over the old one. The egg's install script keeps the settings,
     * saves and mods. "latest" and "experimental" follow the newest release of each.
     */
    public function install(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'versions', 'versions');
        $data = $request->validate([
            'version' => ['required', 'string', 'max:20', 'regex:/^(latest|experimental|\d+\.\d+\.\d+)$/'],
            'backup' => ['sometimes', 'boolean'],
            'start' => ['sometimes', 'boolean'],
        ]);
        $releases = Releases::all();
        abort_unless(in_array($data['version'], ['latest', 'experimental', ...$releases['versions']], true), 422, 'That version is not available.');
        $target = match ($data['version']) {
            'latest' => $releases['stable'],
            'experimental' => $releases['experimental'],
            default => $data['version'],
        };

        $running = ServerConsole::for($server)->isRunning();
        $plan = InstallPlan::for($server, 'Installing Factorio '.($target ?? $data['version']))->stopServer();
        // A copy of the saves before going to another version.
        if ($data['backup'] ?? false) {
            $plan->add('archive', ['dir' => '', 'files' => ['saves'], 'optional' => true]);
        }
        $plan->add('variable', ['env' => 'FACTORIO_VERSION', 'value' => $data['version']])
            ->onFailure('variable', ['env' => 'FACTORIO_VERSION', 'value' => Detector::for($server)->variable('FACTORIO_VERSION') ?? 'latest'])
            ->add('reinstall')
            ->add('wait-installed')
            ->add('refresh');
        if ($running || ($data['start'] ?? false)) {
            $plan->add('power', ['action' => 'start']);
        }

        $job = $plan->dispatch($request->user(), 'versions');
        Activity::event('server:prism-factorio.versions.install')->property(['from' => $info['version'], 'to' => $target ?? $data['version'], 'choice' => $data['version']])->log();

        return new JsonResponse(['job' => $job], 202);
    }
}
