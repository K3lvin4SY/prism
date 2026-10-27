<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use PrismCoreKeeper\Support\InstallPlan;
use PrismCoreKeeper\Support\ModLibrary;
use PrismCoreKeeper\Support\ServerConsole;
use PrismCoreKeeper\Support\ServerFiles;
use PrismCoreKeeper\Support\Settings;
use PrismCoreKeeper\Support\Sources\ModIo;
use PrismCoreKeeper\Support\Sources\Mods;
use PrismCoreKeeper\Support\StartHook;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use RuntimeException;

class ModsController extends Controller
{
    /** The server's mods: folders in the mods folder, joined with where they came from. */
    public function index(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $library = ModLibrary::for($server);
        $records = $library->records();
        $folders = $library->folders();
        $downloaded = $library->downloaded();

        $list = [];
        $claimed = [];
        foreach ($records as $id => $record) {
            $folder = $record['folder'] ?? ($record['source'] === 'steam' ? ($downloaded[$record['sourceId']]['folder'] ?? null) : null);
            $files = $folder !== null ? ($folders[$folder] ?? null) : null;
            if ($folder !== null) {
                $claimed[$folder] = true;
            }

            $pending = $record['source'] === 'steam' && ($files === null || ($downloaded[$record['sourceId']]['updated'] ?? null) !== (int) ($record['updated'] ?? 0));
            $list[] = [
                'id' => $id,
                'source' => $record['source'],
                'title' => $record['title'],
                'icon' => $record['icon'] ?? null,
                'url' => $record['url'] ?? null,
                'version' => $record['version'] ?? null,
                'updated' => (int) ($record['updated'] ?? 0),
                'dependency' => (bool) ($record['dependency'] ?? false),
                'folder' => $folder,
                // A Workshop mod waits for the next start; a mod.io one is in place or missing.
                'pending' => $pending,
                'missing' => ! $pending && $files === null,
                ...self::fromFolder($files),
            ];
        }

        // Mods put in the folder by hand, or by an earlier tool.
        foreach ($folders as $name => $files) {
            if (! isset($claimed[$name])) {
                $list[] = ['id' => null, 'source' => null, 'title' => $files['displayName'] ?? $files['name'] ?? $name, 'icon' => null, 'url' => null, 'version' => null, 'updated' => null, 'dependency' => false, 'folder' => $name, 'pending' => false, 'missing' => false, ...self::fromFolder($files)];
            }
        }

        usort($list, static fn (array $a, array $b): int => strcasecmp((string) $a['title'], (string) $b['title']));

        return new JsonResponse([
            'mods' => $list,
            'sources' => ['modio' => Mods::source('modio')->configured(), 'steam' => Mods::source('steam')->configured()],
            'steamLogin' => Settings::string('steam_username') !== '' && Settings::string('steam_password') !== '',
            // Workshop mods and version changes need the start step; someone may have reset the startup.
            'hookMissing' => array_filter($records, static fn (array $record): bool => $record['source'] === 'steam') !== [] && ! StartHook::installed($server->fresh()),
            'running' => ServerConsole::for($server)->isRunning(),
            'job' => InstallPlan::current($server),
            'confirmInstalls' => (bool) Settings::admin('confirm_installs', true),
            'folder' => StartHook::MODS,
        ]);
    }

    /** What the browser's filters offer. */
    public function meta(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');

        try {
            $versions = ModIo::gameVersions();
        } catch (RuntimeException) {
            $versions = [];
        }

        return new JsonResponse(['categories' => Mods::CATEGORIES, 'sides' => Mods::SIDES, 'sorts' => Mods::SORTS, 'gameVersions' => array_slice($versions, 0, 20)]);
    }

    public function search(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $data = $request->validate([
            'sources' => ['nullable', 'array', 'max:2'],
            'sources.*' => ['string', 'in:modio,steam'],
            'query' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', 'string', 'in:'.implode(',', Mods::SORTS)],
            'categories' => ['nullable', 'array', 'max:11'],
            'categories.*' => ['string', 'max:40'],
            'sides' => ['nullable', 'array', 'max:2'],
            'sides.*' => ['string', 'in:Server,Client'],
            'gameVersion' => ['nullable', 'string', 'max:16'],
            'page' => ['nullable', 'integer', 'min:1', 'max:500'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $result = Mods::search($data['sources'] ?? [], $data);
        $records = ModLibrary::for($server)->records();
        foreach ($result['hits'] as &$hit) {
            $hit['installed'] = isset($records[$hit['id']]) || (isset($hit['alsoOn']) && isset($records[$hit['alsoOn']['id']]));
        }

        return new JsonResponse($result);
    }

    /** One mod with its description, pictures and the mods it needs. */
    public function show(Request $request, Server $server, string $mod): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $all = $this->call(static fn (): array => Mods::withDependencies([$mod]));
        abort_unless(isset($all[$mod]), 404, 'That mod was not found.');

        $records = ModLibrary::for($server)->records();
        $dependencies = array_values(array_filter($all, static fn (array $item): bool => $item['id'] !== $mod));

        return new JsonResponse([
            'mod' => $all[$mod] + ['installed' => isset($records[$mod])],
            'dependencies' => array_map(static fn (array $item): array => ['id' => $item['id'], 'title' => $item['title'], 'icon' => $item['icon'], 'source' => $item['source'], 'installed' => isset($records[$item['id']])], $dependencies),
        ]);
    }

    /**
     * Installs mods and the mods they need. mod.io files are downloaded into the mods folder
     * now; Workshop mods are fetched by the server when it next starts. Also used to update.
     */
    public function install(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:30'],
            'ids.*' => ['string', 'regex:/^(modio|steam):\d{1,20}$/'],
            'restart' => ['sometimes', 'boolean'],
        ]);

        $library = ModLibrary::for($server);
        $records = $library->records();
        $found = $this->call(static fn (): array => Mods::withDependencies($data['ids']));
        abort_if($found === [], 422, 'Those mods were not found.');

        $titles = array_column($found, 'title');
        $plan = InstallPlan::for($server, 'Installing '.implode(', ', array_slice($titles, 0, 3)).(count($titles) > 3 ? ' and '.(count($titles) - 3).' more' : ''));
        $workshop = $library->workshop();
        $hasWorkshop = false;

        foreach ($found as $id => $mod) {
            $asked = in_array($id, $data['ids'], true);
            $existing = $records[$id] ?? null;
            // A dependency already installed is left as it is unless it was asked for.
            if (! $asked && $existing !== null) {
                continue;
            }

            $record = [
                'id' => $id,
                'source' => $mod['source'],
                'sourceId' => $mod['sourceId'],
                'title' => $mod['title'],
                'icon' => $mod['icon'],
                'url' => $mod['url'],
                'version' => $mod['version'],
                'updated' => (int) $mod['updated'],
                'dependency' => $asked ? false : (bool) ($existing['dependency'] ?? true),
            ];

            if ($mod['source'] === 'steam') {
                $workshop[$mod['sourceId']] = $record;
                $plan->add('record', ['key' => ModLibrary::key($id), 'value' => $record]);
                $hasWorkshop = true;

                continue;
            }

            $file = $mod['file'] ?? null;
            abort_if(! is_array($file) || ($file['url'] ?? '') === '', 422, $mod['title'].' has no file to download on mod.io.');
            $folder = $library->folderFor($mod['title'], $existing['folder'] ?? null);
            $directory = ServerFiles::join(StartHook::MODS, $folder);
            $zip = 'prism-download.zip';

            // A fresh copy each time: the old folder goes first, so removed files do not linger.
            $plan->add('mkdir', ['path' => StartHook::MODS])
                ->add('delete', ['dir' => StartHook::MODS, 'files' => [$folder]])
                ->add('mkdir', ['path' => $directory])
                ->add('pull', ['url' => $file['url'], 'dir' => $directory, 'file' => $zip, 'size' => $file['size'] ?: null]);
            if (is_string($file['md5'] ?? null) && strlen($file['md5']) === 32) {
                $plan->add('verify', ['path' => ServerFiles::join($directory, $zip), 'algorithm' => 'md5', 'hash' => $file['md5']]);
            }
            $plan->add('unzip', ['dir' => $directory, 'file' => $zip])
                ->add('delete', ['dir' => $directory, 'files' => [$zip]])
                ->add('flatten', ['dir' => $directory])
                ->add('record', ['key' => ModLibrary::key($id), 'value' => $record + ['folder' => $folder, 'fileId' => $file['id']]]);
            $plan->onFailure('delete', ['dir' => StartHook::MODS, 'files' => [$folder]]);
        }

        if ($hasWorkshop) {
            StartHook::steps($plan)->add('write', ['path' => '.cks/workshop.txt', 'content' => base64_encode(StartHook::workshopList($workshop))]);
        }

        $restart = ($data['restart'] ?? false) && ServerConsole::for($server)->isRunning();
        if ($restart) {
            if ($hasWorkshop) {
                StartHook::loginSteps($plan);
            }
            $plan->add('power', ['action' => 'restart']);
        }

        $job = $plan->dispatch($request->user(), 'mods');
        Activity::event('server:prism-corekeeper.mods.install')->property(['mods' => array_keys($found)])->log();

        return new JsonResponse(['job' => $job, 'added' => $titles, 'restarting' => $restart, 'workshop' => $hasWorkshop], 202);
    }

    /** Newer files on mod.io and newer uploads on the Workshop, by mod id. */
    public function updates(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $records = ModLibrary::for($server)->records();
        $current = $this->call(static fn (): array => Mods::details(array_keys($records)));

        $updates = [];
        foreach ($records as $id => $record) {
            $latest = $current[$id] ?? null;
            if ($latest === null) {
                continue;
            }
            $newer = $record['source'] === 'modio'
                ? ($latest['file']['id'] ?? null) !== null && (string) $latest['file']['id'] !== (string) ($record['fileId'] ?? '')
                : (int) $latest['updated'] > (int) ($record['updated'] ?? 0);
            if ($newer) {
                $updates[$id] = $latest['version'] ?? date('Y-m-d', (int) $latest['updated']);
            }
        }

        return new JsonResponse(['updates' => $updates]);
    }

    /** Turns a mod off by moving its folder out of the mods folder, or back on. */
    public function toggle(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $data = $request->validate(['folder' => ['required', 'string', 'max:100', 'regex:/^[A-Za-z0-9._ -]+$/', 'not_in:.,..'], 'enabled' => ['required', 'boolean']]);
        abort_if(InstallPlan::isBusy($server), 409, 'An install is running on this server. Try again when it is done.');

        $files = ServerFiles::for($server);
        [$from, $to] = $data['enabled'] ? [ModLibrary::DISABLED, StartHook::MODS] : [StartHook::MODS, ModLibrary::DISABLED];
        abort_unless(isset($files->list($from)[$data['folder']]), 404, 'That mod folder was not found.');
        $files->makeDirectory($to);
        $files->rename('', ServerFiles::join($from, $data['folder']), ServerFiles::join($to, $data['folder']));
        Activity::event('server:prism-corekeeper.mods.toggle')->property($data)->log();

        return new JsonResponse(['enabled' => $data['enabled']]);
    }

    /** Deletes a mod's folder and forgets it; a Workshop mod also leaves the download list. */
    public function remove(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $data = $request->validate([
            'id' => ['nullable', 'string', 'regex:/^(modio|steam):\d{1,20}$/'],
            'folder' => ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9._ -]+$/', 'not_in:.,..'],
        ]);
        abort_if(empty($data['id']) && empty($data['folder']), 422, 'Pick a mod to remove.');
        abort_if(InstallPlan::isBusy($server), 409, 'An install is running on this server. Try again when it is done.');

        $library = ModLibrary::for($server);
        $files = ServerFiles::for($server);
        $folder = $data['folder'] ?? null;

        if (! empty($data['id'])) {
            $record = $library->records()[$data['id']] ?? null;
            if ($record !== null) {
                Settings::server($server)->forget(ModLibrary::key($data['id']));
                if ($record['source'] === 'steam') {
                    $downloaded = $library->downloaded();
                    $folder ??= $downloaded[$record['sourceId']]['folder'] ?? null;
                    unset($downloaded[$record['sourceId']]);
                    $workshop = $library->workshop();
                    $files->write('.cks/workshop.txt', StartHook::workshopList($workshop));
                    $files->write('.cks/installed.txt', implode('', array_map(static fn (string $id, array $mod): string => "$id {$mod['updated']} {$mod['folder']}\n", array_map('strval', array_keys($downloaded)), $downloaded)));
                } else {
                    $folder ??= $record['folder'] ?? null;
                }
            }
        }

        if ($folder !== null) {
            $files->delete(StartHook::MODS, [$folder]);
            $files->delete(ModLibrary::DISABLED, [$folder]);
        }

        Activity::event('server:prism-corekeeper.mods.remove')->property($data)->log();

        return new JsonResponse(['removed' => true]);
    }

    /** Puts the start step back after someone reset the startup command. */
    public function repair(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $plan = StartHook::steps(InstallPlan::for($server, 'Setting up the start step'))
            ->add('write', ['path' => '.cks/workshop.txt', 'content' => base64_encode(StartHook::workshopList(ModLibrary::for($server)->workshop()))]);

        return new JsonResponse(['job' => $plan->dispatch($request->user(), 'mods')], 202);
    }

    /** Restarts through a plan, so the Steam login is in place for Workshop downloads. */
    public function restart(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        abort_unless($request->user()->can('control.restart', $server), 403, 'You do not have permission to restart this server.');
        $plan = StartHook::loginSteps(InstallPlan::for($server, 'Restarting to download Workshop mods'));
        $plan->add('power', ['action' => ServerConsole::for($server)->isRunning() ? 'restart' : 'start']);

        return new JsonResponse(['job' => $plan->dispatch($request->user(), 'mods')], 202);
    }

    /**
     * @param  array<string, mixed>|null  $files
     * @return array<string, mixed>
     */
    private static function fromFolder(?array $files): array
    {
        return [
            'enabled' => $files['enabled'] ?? true,
            'guid' => $files['guid'] ?? null,
            'requiredOn' => $files['requiredOn'] ?? null,
            'linux' => $files['linux'] ?? true,
            'manifest' => $files['manifest'] ?? true,
        ];
    }

    /**
     * @template T
     *
     * @param  callable(): T  $call
     * @return T
     */
    private function call(callable $call): mixed
    {
        try {
            return $call();
        } catch (InvalidArgumentException $exception) {
            abort(422, $exception->getMessage());
        } catch (RuntimeException $exception) {
            abort(502, $exception->getMessage());
        }
    }
}
