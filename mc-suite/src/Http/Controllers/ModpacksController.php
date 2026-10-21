<?php

declare(strict_types=1);

namespace McSuite\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use McSuite\Support\InstallPlan;
use McSuite\Support\Mrpack;
use McSuite\Support\Providers\ModrinthProvider;
use McSuite\Support\Settings;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;

class ModpacksController extends Controller
{
    public function __construct(private readonly ModrinthProvider $modrinth) {}

    /** The installed modpack, if MC Suite installed one, and any install still running. */
    public function current(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'modpacks', 'modpacks');

        return new JsonResponse([
            'modpack' => Settings::server($server)->get('modpack'),
            'job' => InstallPlan::current($server),
            'clean' => Mrpack::CLEAN,
        ]);
    }

    /**
     * Installs a modpack version. The archive is downloaded and read on the queue, so this
     * only checks the version and starts the job.
     */
    public function install(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'modpacks', 'modpacks');
        $data = $request->validate([
            'version' => ['required', 'string', 'max:64'],
            'clean' => ['sometimes', 'boolean'],
            'start' => ['sometimes', 'boolean'],
        ]);

        $version = $this->modrinth->version($data['version']);
        $file = collect($version['files'])
            ->sortByDesc('primary')
            ->first(static fn (array $file): bool => str_ends_with(strtolower($file['filename']), '.mrpack') && parse_url($file['url'], PHP_URL_HOST) === 'cdn.modrinth.com');
        abort_if($file === null, 422, 'This version has no Modrinth modpack file.');

        $project = $this->modrinth->project($version['projectId']);
        abort_unless(($project['type'] ?? null) === 'modpack', 422, 'This project is not a modpack.');

        $job = InstallPlan::for($server, 'Installing '.$project['title'].' '.$version['number'])
            ->add('mrpack', [
                'url' => $file['url'],
                'size' => $file['size'],
                'clean' => (bool) ($data['clean'] ?? false),
                'start' => (bool) ($data['start'] ?? false),
                'pack' => [
                    'provider' => 'modrinth',
                    'project' => $project['id'],
                    'version' => $version['id'],
                    'versionNumber' => $version['number'],
                    'title' => $project['title'],
                    'icon' => $project['icon'],
                    'url' => $project['url'],
                ],
            ])
            ->dispatch($request->user(), 'modpacks');

        Activity::event('server:mc-suite.modpack.install')
            ->property(['modpack' => $project['title'], 'version' => $version['number'], 'clean' => (bool) ($data['clean'] ?? false)])
            ->log();

        return new JsonResponse(['job' => $job], 202);
    }
}
