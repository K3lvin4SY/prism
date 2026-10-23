<?php

declare(strict_types=1);

namespace PrismTerraria\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use PrismTerraria\Support\Detector;
use PrismTerraria\Support\InstallPlan;
use PrismTerraria\Support\Releases;
use PrismTerraria\Support\Worlds;
use PrismTerraria\Support\WorkshopMods;

class VersionsController extends Controller
{
    public function index(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'versions', 'versions');
        $world = Worlds::version($server, $info['kind']);

        return new JsonResponse([
            'info' => $info,
            'releases' => Releases::for($info['kind']),
            'world' => [
                'version' => $world,
                // The Terraria release that saved it, when Prism Terraria knows that file version.
                'terraria' => $world !== null ? Releases::terrariaForWorld($world) : null,
            ],
            'dockerImage' => $server->image,
            'dockerImages' => $server->egg?->docker_images ?? [],
            'canChangeImage' => $request->user()->can('startup.docker-image', $server),
            'job' => InstallPlan::current($server),
        ]);
    }

    /**
     * TShock and tModLoader builds come from the egg's own install script: its version variable
     * picks the release and a reinstall downloads it. The vanilla egg can only fetch the newest
     * build itself, so other versions are unpacked here from terraria.org. Worlds and settings
     * are left alone either way.
     */
    public function install(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'versions', 'versions');
        $data = $request->validate([
            'release' => ['required', 'string', 'max:64'],
            'start' => ['sometimes', 'boolean'],
            'newWorld' => ['sometimes', 'boolean'],
            'keepBackup' => ['sometimes', 'boolean'],
        ]);

        $kind = $info['kind'];
        $release = Releases::find($kind, $data['release']);
        abort_if($release === null, 422, 'Unknown version.');
        abort_unless($server->canBeReinstalled(), 409, 'The server is busy. Try again in a moment.');

        // A world saved by a newer Terraria does not open in an older one, and the server would not start.
        $worldVersion = Worlds::version($server, $kind);
        $tooNew = ! Releases::opensWorld($release['terraria'], $worldVersion);
        $newWorld = (bool) ($data['newWorld'] ?? false);
        abort_if($tooNew && ! $newWorld, 422, sprintf(
            'The world was saved by a newer Terraria (%s) than %s can open. Pick a newer build, or start a new world.',
            Releases::terrariaForWorld((int) $worldVersion) ?? 'world version '.$worldVersion, $release['name'],
        ));

        $plan = InstallPlan::for($server, 'Installing '.$release['name'])->stopServer();

        $backups = [];
        if ($tooNew) {
            // The world's files move aside under a name of their own; if anything fails, they come back.
            $folder = Worlds::folder($kind);
            $suffix = '-backup-'.now()->format('Ymd-His');
            foreach (Worlds::files($server, $kind) as $file) {
                $backup = (string) preg_replace('/(\.t?wld(?:\.bak)?)$/', $suffix.'$1', $file);
                $backups[] = $backup;
                $plan->add('rename', ['dir' => $folder, 'from' => $file, 'to' => $backup])
                    ->onFailure('rename', ['dir' => $folder, 'from' => $backup, 'to' => $file, 'optional' => true, 'ifMissing' => true]);
            }
        }

        if ($kind === 'vanilla') {
            $digits = str_replace('.', '', $release['terraria']);
            $plan->add('mkdir', ['path' => '.trs'])
                ->add('pull', ['url' => Releases::vanillaUrl($release['terraria']), 'dir' => '.trs', 'file' => "terraria-server-$digits.zip"])
                ->add('unzip', ['dir' => '.trs', 'file' => "terraria-server-$digits.zip"])
                ->add('move-contents', ['from' => ".trs/$digits/Linux", 'to' => ''])
                ->add('chmod', ['dir' => '', 'files' => ['TerrariaServer.bin.x86_64', 'TerrariaServer'], 'mode' => '755'])
                ->add('delete', ['dir' => '.trs', 'files' => [$digits, "terraria-server-$digits.zip"]])
                ->onFailure('delete', ['dir' => '.trs', 'files' => [$digits, "terraria-server-$digits.zip"]]);
        } else {
            $plan->add('variable', ['env' => Detector::VERSION_VARIABLES[$kind], 'value' => $release['id']])
                ->add('reinstall')
                ->add('wait-installed');

            // The reinstall writes the egg's own tModLoaderServer, which knows nothing of Workshop mods.
            if ($kind === 'tmodloader' && WorkshopMods::for($server)->wanted() !== []) {
                WorkshopMods::addWrapperSteps($plan->add('write', ['path' => '.trs/tml-version', 'content' => base64_encode(ltrim($release['id'], 'v')."\n")]));
            }
        }

        $plan->add('record', ['key' => 'software', 'value' => [
            'kind' => $kind,
            'version' => $release['terraria'],
            'build' => $kind === 'vanilla' ? $release['terraria'] : ltrim($release['id'], 'v'),
            'release' => $release['id'],
            'installed' => now()->toAtomString(),
        ]])->add('refresh');

        if ($backups !== [] && ! ($data['keepBackup'] ?? true)) {
            // Without a backup, the old world goes only once the new build is in place.
            $plan->add('delete', ['dir' => Worlds::folder($kind), 'files' => $backups]);
        }

        if ($data['start'] ?? false) {
            $plan->add('power', ['action' => 'start']);
        }

        $job = $plan->dispatch($request->user(), 'versions');
        Activity::event('server:prism-terraria.version.install')->property(['kind' => $kind, 'release' => $release['id'], 'newWorld' => $tooNew])->log();

        return new JsonResponse(['job' => $job], 202);
    }
}
