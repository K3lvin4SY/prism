<?php

declare(strict_types=1);

namespace TerrariaSuite\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use RuntimeException;
use TerrariaSuite\Support\InstallPlan;
use TerrariaSuite\Support\ServerFiles;
use TerrariaSuite\Support\Settings;
use TerrariaSuite\Support\Workshop;
use TerrariaSuite\Support\WorkshopMods;
use Throwable;

class ModsController extends Controller
{
    /** The mods in mods/, with what the Panel knows of where they came from. */
    public function index(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'mods', 'mods');
        $mods = WorkshopMods::for($server);
        $wanted = $mods->wanted();
        $downloaded = $mods->downloaded();
        $enabled = $mods->enabled();

        $files = [];
        foreach (ServerFiles::for($server)->list('mods') as $name => $entry) {
            if ($entry['file'] && str_ends_with($name, '.tmod')) {
                $files[substr($name, 0, -5)] = $entry;
            }
        }

        $byName = [];
        foreach ($downloaded as $id => $download) {
            $byName[$download['name']] = $id;
        }

        $list = [];
        foreach ($wanted as $id => $mod) {
            $name = $downloaded[$id]['name'] ?? null;
            $list[] = [
                'id' => (string) $id,
                'name' => $name,
                'title' => $mod['title'],
                'icon' => $mod['icon'] ?? null,
                'dependency' => (bool) ($mod['dependency'] ?? false),
                'updated' => (int) ($mod['updated'] ?? 0),
                'size' => $name !== null ? ($files[$name]['size'] ?? 0) : 0,
                // Waiting for the next start: not downloaded yet, or an update is wanted.
                'pending' => $name === null || ! isset($files[$name]) || $downloaded[$id]['updated'] !== (int) ($mod['updated'] ?? 0),
                'enabled' => $name === null || in_array($name, $enabled, true),
            ];
        }

        // Mods put in mods/ by hand or by tModLoader itself.
        foreach ($files as $name => $entry) {
            if (! isset($byName[$name]) || ! isset($wanted[$byName[$name]])) {
                $list[] = ['id' => null, 'name' => $name, 'title' => $name, 'icon' => null, 'dependency' => false, 'updated' => null, 'size' => $entry['size'], 'pending' => false, 'enabled' => in_array($name, $enabled, true)];
            }
        }

        return new JsonResponse([
            'mods' => $list,
            'workshop' => Workshop::configured(),
            // The egg's install script replaces the wrapper; until it is back, mods are not downloaded.
            'wrapperMissing' => $wanted !== [] && ! $mods->wrapperInstalled(),
            'running' => $this->running($server),
            'build' => $info['build'],
            'job' => InstallPlan::current($server),
            'confirmInstalls' => (bool) Settings::admin('confirm_installs', true),
        ]);
    }

    public function search(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $data = $request->validate([
            'query' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', 'string', 'in:trend,subscriptions,newest,updated,votes'],
            'categories' => ['nullable', 'array', 'max:9'],
            'categories.*' => ['string', 'max:40'],
            'sides' => ['nullable', 'array', 'max:4'],
            'sides.*' => ['string', 'max:10'],
            'gameVersion' => ['nullable', 'string', 'max:10'],
            'page' => ['nullable', 'integer', 'min:1', 'max:500'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $result = $this->steam(static fn (): array => Workshop::search($data));
        $wanted = WorkshopMods::for($server)->wanted();
        foreach ($result['hits'] as &$hit) {
            $hit['installed'] = isset($wanted[$hit['id']]);
        }

        return new JsonResponse($result + ['categories' => Workshop::CATEGORIES, 'sides' => Workshop::SIDES, 'gameVersions' => Workshop::GAME_VERSIONS]);
    }

    /** One item with its description, screenshots and the mods it needs. */
    public function show(Request $request, Server $server, string $item): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $all = $this->steam(static fn (): array => Workshop::withDependencies([$item]));
        abort_unless(isset($all[$item]), 404, 'That Workshop item was not found.');

        $wanted = WorkshopMods::for($server)->wanted();
        $dependencies = array_values(array_filter($all, static fn (array $mod): bool => $mod['id'] !== $item));

        return new JsonResponse([
            'item' => $all[$item] + ['installed' => isset($wanted[$item])],
            'dependencies' => array_map(static fn (array $mod): array => [
                'id' => $mod['id'],
                'title' => $mod['title'],
                'icon' => $mod['icon'],
                'installed' => isset($wanted[$mod['id']]),
            ], $dependencies),
        ]);
    }

    /** Adds mods, and the mods they need, to the list downloaded at start. Also used to update. */
    public function install(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'mods', 'mods');
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:50'],
            'ids.*' => ['string', 'regex:/^\d{1,20}$/'],
            'restart' => ['sometimes', 'boolean'],
        ]);

        $mods = WorkshopMods::for($server);
        $wanted = $mods->wanted();
        $found = $this->steam(static fn (): array => Workshop::withDependencies($data['ids']));
        abort_if($found === [], 422, 'Those Workshop items were not found.');

        $added = [];
        foreach ($found as $id => $mod) {
            // PHP turns numeric array keys into integers, so the id is compared as a string.
            $id = (string) $id;
            $asked = in_array($id, $data['ids'], true);
            $wanted[$id] = [
                'id' => $id,
                'title' => $mod['title'],
                'updated' => (int) ($mod['updated'] ?? 0),
                'icon' => $mod['icon'],
                // A mod added only because another needs it keeps that mark until it is asked for.
                'dependency' => $asked ? false : (bool) ($wanted[$id]['dependency'] ?? true),
            ];
            $added[] = $mod['title'];
        }

        $plan = $mods->addSteps(InstallPlan::for($server, 'Adding '.implode(', ', array_slice($added, 0, 3)).(count($added) > 3 ? ' and '.(count($added) - 3).' more' : '')), $wanted, $info['build']);
        $restart = ($data['restart'] ?? false) && $this->running($server);
        if ($restart) {
            $plan->add('power', ['action' => 'restart']);
        }

        $job = $plan->dispatch($request->user(), 'mods');
        Activity::event('server:terraria-suite.mods.install')->property(['mods' => array_keys($found)])->log();

        return new JsonResponse(['job' => $job, 'added' => $added, 'restarting' => $restart], 202);
    }

    /** Checks the Workshop for newer uploads of the wanted mods. */
    public function updates(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $wanted = WorkshopMods::for($server)->wanted();
        $current = $this->steam(static fn (): array => Workshop::details(array_map('strval', array_keys($wanted))));

        $updates = [];
        foreach ($wanted as $id => $mod) {
            $latest = (int) ($current[(string) $id]['updated'] ?? 0);
            if ($latest > (int) ($mod['updated'] ?? 0)) {
                $updates[(string) $id] = $latest;
            }
        }

        return new JsonResponse(['updates' => $updates]);
    }

    /** Turns a mod on or off in mods/enabled.json. tModLoader reads it at start. */
    public function toggle(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $data = $request->validate(['name' => ['required', 'string', 'max:100', 'regex:/^[A-Za-z0-9_.-]+$/'], 'enabled' => ['required', 'boolean']]);

        $mods = WorkshopMods::for($server);
        $enabled = array_values(array_filter($mods->enabled(), static fn (string $name): bool => $name !== $data['name']));
        if ($data['enabled']) {
            $enabled[] = $data['name'];
        }

        $mods->setEnabled($enabled);
        Activity::event('server:terraria-suite.mods.toggle')->property($data)->log();

        return new JsonResponse(['enabled' => $enabled]);
    }

    /** Takes a mod off the list and deletes its files. */
    public function remove(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $data = $request->validate([
            'id' => ['nullable', 'string', 'regex:/^\d{1,20}$/'],
            'name' => ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9_.-]+$/'],
        ]);
        abort_if(empty($data['id']) && empty($data['name']), 422, 'Pick a mod to remove.');
        abort_if(InstallPlan::isBusy($server), 409, 'Another install is running on this server. Try again when it is done.');

        $mods = WorkshopMods::for($server);
        $files = ServerFiles::for($server);
        $name = $data['name'] ?? null;

        if (! empty($data['id'])) {
            $wanted = $mods->wanted();
            $downloaded = $mods->downloaded();
            $name ??= $downloaded[$data['id']]['name'] ?? null;
            unset($wanted[$data['id']], $downloaded[$data['id']]);

            Settings::server($server)->set('workshop', $wanted);
            $files->write('.trs/workshop.txt', WorkshopMods::listFile($wanted));
            $files->write('.trs/installed.txt', implode('', array_map(static fn (string $id, array $mod): string => "$id {$mod['updated']} {$mod['name']}\n", array_keys($downloaded), $downloaded)));
            $files->delete('.trs/workshop', [$data['id']]);
        }

        if ($name !== null) {
            $files->delete('mods', [$name.'.tmod']);
            $mods->setEnabled(array_values(array_filter($mods->enabled(), static fn (string $mod): bool => $mod !== $name)));
        }

        Activity::event('server:terraria-suite.mods.remove')->property($data)->log();

        return new JsonResponse(['removed' => true]);
    }

    /** Puts the start-up wrapper back after the egg reinstalled the server. */
    public function repair(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'mods', 'mods');
        $mods = WorkshopMods::for($server);
        $job = $mods->addSteps(InstallPlan::for($server, 'Setting up Workshop downloads'), $mods->wanted(), $info['build'])->dispatch($request->user(), 'mods');

        return new JsonResponse(['job' => $job], 202);
    }

    private function running(Server $server): bool
    {
        try {
            return in_array(Daemon::server($server)->details()['state'] ?? 'offline', ['running', 'starting'], true);
        } catch (Throwable) {
            return false;
        }
    }

    /**
     * @template T
     *
     * @param  callable(): T  $call
     * @return T
     */
    private function steam(callable $call): mixed
    {
        try {
            return $call();
        } catch (RuntimeException $exception) {
            abort(502, $exception->getMessage());
        }
    }
}
