<?php

declare(strict_types=1);

namespace PrismSatisfactory\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use PrismSatisfactory\Support\Ficsit;
use PrismSatisfactory\Support\InstallPlan;
use PrismSatisfactory\Support\ModLibrary;
use PrismSatisfactory\Support\ServerConsole;
use PrismSatisfactory\Support\ServerFiles;
use PrismSatisfactory\Support\Settings;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use RuntimeException;

class ModsController extends Controller
{
    private const string REFERENCE = '/^[A-Za-z0-9_]{1,64}$/';

    /** The server's mods: the folders in FactoryGame/Mods, joined with where they came from. */
    public function index(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'mods', 'mods');
        $library = ModLibrary::for($server);
        $records = $library->records();
        $folders = $library->folders();

        $list = [];
        foreach ($records + $folders as $name => $_) {
            $record = $records[$name] ?? null;
            $folder = $folders[$name] ?? null;
            $list[] = [
                'name' => (string) $name,
                'title' => $record['title'] ?? $folder['title'] ?? $name,
                'icon' => $record['icon'] ?? null,
                'url' => $record['url'] ?? null,
                'version' => $folder['version'] ?? ($record['version'] ?? null),
                'repository' => $record !== null,
                'dependency' => (bool) ($record['dependency'] ?? false),
                'enabled' => $folder['enabled'] ?? true,
                'missing' => $folder === null,
                'plugin' => $folder['plugin'] ?? true,
            ];
        }
        usort($list, static fn (array $a, array $b): int => strcasecmp((string) $a['title'], (string) $b['title']));

        return new JsonResponse([
            'mods' => $list,
            'changelist' => $info['changelist'],
            // Every mod needs the mod loader.
            'loader' => isset($folders['SML']) && $folders['SML']['enabled'],
            'running' => ServerConsole::for($server)->isRunning(),
            'job' => InstallPlan::current($server),
            'confirmInstalls' => (bool) Settings::admin('confirm_installs', true),
        ]);
    }

    public function meta(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'mods', 'mods');

        return new JsonResponse(['sorts' => array_keys(Ficsit::SORTS), 'changelist' => $info['changelist']]);
    }

    public function search(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'mods', 'mods');
        $data = $request->validate([
            'query' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', 'string', 'in:'.implode(',', array_keys(Ficsit::SORTS))],
            'page' => ['nullable', 'integer', 'min:1', 'max:200'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $result = $this->call(static fn (): array => Ficsit::search($data, $info['changelist']));
        $installed = ModLibrary::for($server)->records() + ModLibrary::for($server)->folders();
        foreach ($result['hits'] as &$hit) {
            $hit['installed'] = isset($installed[$hit['name']]);
            unset($hit['release']);
        }

        return new JsonResponse($result);
    }

    /** One mod with its description, the version this server gets and the mods it needs. */
    public function show(Request $request, Server $server, string $mod): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'mods', 'mods');
        $all = $this->call(static fn (): array => Ficsit::withDependencies([$mod], $info['changelist']));
        abort_unless(isset($all[$mod]), 404, 'That mod was not found.');

        $installed = ModLibrary::for($server)->records() + ModLibrary::for($server)->folders();
        $dependencies = array_values(array_filter($all, static fn (array $item): bool => $item['name'] !== $mod));

        return new JsonResponse([
            'mod' => $all[$mod] + ['installed' => isset($installed[$mod])],
            'dependencies' => array_map(static fn (array $item): array => ['id' => $item['name'], 'title' => $item['title'], 'icon' => $item['icon'], 'installed' => isset($installed[$item['name']])], $dependencies),
            'problems' => self::problems($all),
            'changelist' => $info['changelist'],
        ]);
    }

    /**
     * Installs mods and the mods they need from ficsit.app, each at the newest version with a
     * Linux server build for this game build. Also used to update.
     */
    public function install(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'mods', 'mods');
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:30'],
            'ids.*' => ['string', 'regex:'.self::REFERENCE],
            'restart' => ['sometimes', 'boolean'],
        ]);

        $library = ModLibrary::for($server);
        $records = $library->records();
        $folders = $library->folders();
        $found = $this->call(static fn (): array => Ficsit::withDependencies($data['ids'], $info['changelist']));
        foreach ($data['ids'] as $reference) {
            abort_unless(isset($found[$reference]), 422, 'The mod '.$reference.' was not found on ficsit.app.');
        }
        $problems = self::problems($found);
        abort_if($problems !== [], 422, implode(' ', $problems));

        // A dependency already installed is left as it is unless it was asked for.
        $wanted = array_filter($found, static fn (array $mod, int|string $name): bool => in_array((string) $name, $data['ids'], true) || ! (isset($records[$name]) || isset($folders[$name])), ARRAY_FILTER_USE_BOTH);
        $titles = array_values(array_column($wanted, 'title'));
        $plan = InstallPlan::for($server, 'Installing '.implode(', ', array_slice($titles, 0, 3)).(count($titles) > 3 ? ' and '.(count($titles) - 3).' more' : ''));
        $plan->add('mkdir', ['path' => ModLibrary::DOWNLOADS])->add('mkdir', ['path' => ModLibrary::PREVIOUS])->add('mkdir', ['path' => ModLibrary::FOLDER]);

        foreach ($wanted as $name => $mod) {
            $name = (string) $name;
            $release = $mod['release'];
            $zip = $name.'.zip';
            $target = ServerFiles::join(ModLibrary::FOLDER, $name);

            // The old folder waits aside until the new one is in, and comes back if it fails.
            $plan->add('delete', ['dir' => ModLibrary::PREVIOUS, 'files' => [$name]])
                ->add('rename', ['dir' => '', 'from' => $target, 'to' => ServerFiles::join(ModLibrary::PREVIOUS, $name), 'optional' => true])
                ->onFailure('delete', ['dir' => ModLibrary::FOLDER, 'files' => [$name]])
                ->onFailure('rename', ['dir' => '', 'from' => ServerFiles::join(ModLibrary::PREVIOUS, $name), 'to' => $target, 'optional' => true])
                ->add('delete', ['dir' => ModLibrary::DISABLED, 'files' => [$name]])
                ->add('pull', ['url' => $release['url'], 'dir' => ModLibrary::DOWNLOADS, 'file' => $zip, 'size' => $release['size'] ?: null])
                ->add('verify', ['path' => ServerFiles::join(ModLibrary::DOWNLOADS, $zip), 'algorithm' => 'sha256', 'hash' => $release['sha256']])
                ->add('mkdir', ['path' => $target])
                ->add('rename', ['dir' => '', 'from' => ServerFiles::join(ModLibrary::DOWNLOADS, $zip), 'to' => ServerFiles::join($target, $zip)])
                ->add('unzip', ['dir' => $target, 'file' => $zip])
                ->add('delete', ['dir' => $target, 'files' => [$zip]])
                ->add('wait-file', ['candidates' => [ServerFiles::join($target, $name.'.uplugin')], 'timeout' => 30])
                ->add('delete', ['dir' => ModLibrary::PREVIOUS, 'files' => [$name]])
                ->add('record', ['key' => ModLibrary::key($name), 'value' => [
                    'name' => $name,
                    'title' => $mod['title'],
                    'icon' => $mod['icon'],
                    'url' => $mod['url'],
                    'version' => $release['version'],
                    'versionId' => $release['id'],
                    'dependency' => in_array($name, $data['ids'], true) ? false : (bool) ($records[$name]['dependency'] ?? true),
                ]]);
        }

        $restart = ($data['restart'] ?? false) && ServerConsole::for($server)->isRunning();
        if ($restart) {
            $plan->add('power', ['action' => 'restart']);
        }

        $job = $plan->dispatch($request->user(), 'mods');
        Activity::event('server:prism-satisfactory.mods.install')->property(['mods' => array_keys($wanted)])->log();

        return new JsonResponse(['job' => $job, 'added' => $titles, 'restarting' => $restart], 202);
    }

    /** Newer versions for this game build, by mod reference. */
    public function updates(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'mods', 'mods');
        $library = ModLibrary::for($server);
        $folders = $library->folders();
        $records = $library->records();
        $current = $this->call(static fn (): array => Ficsit::details(array_map('strval', array_keys($records)), $info['changelist']));

        $updates = [];
        foreach ($records as $name => $record) {
            $latest = $current[$name]['version'] ?? null;
            $installed = $folders[$name]['version'] ?? ($record['version'] ?? null);
            if ($latest !== null && $installed !== null && version_compare($latest, $installed, '>')) {
                $updates[$name] = $latest;
            }
        }

        return new JsonResponse(['updates' => (object) $updates]);
    }

    /** Turns a mod off by moving its folder out of FactoryGame/Mods, or back on. */
    public function toggle(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $data = $request->validate(['name' => ['required', 'string', 'regex:'.self::REFERENCE], 'enabled' => ['required', 'boolean']]);
        abort_if(InstallPlan::isBusy($server), 409, 'An install is running on this server. Try again when it is done.');

        $files = ServerFiles::for($server);
        [$from, $to] = $data['enabled'] ? [ModLibrary::DISABLED, ModLibrary::FOLDER] : [ModLibrary::FOLDER, ModLibrary::DISABLED];
        abort_unless(isset($files->list($from)[$data['name']]), 404, 'That mod folder was not found.');
        $files->makeDirectory($to);
        $files->rename('', ServerFiles::join($from, $data['name']), ServerFiles::join($to, $data['name']));
        Activity::event('server:prism-satisfactory.mods.toggle')->property($data)->log();

        return new JsonResponse(['enabled' => $data['enabled']]);
    }

    /** Deletes a mod's folder and forgets it. */
    public function remove(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $data = $request->validate(['name' => ['required', 'string', 'regex:'.self::REFERENCE]]);
        abort_if(InstallPlan::isBusy($server), 409, 'An install is running on this server. Try again when it is done.');

        $files = ServerFiles::for($server);
        $files->delete(ModLibrary::FOLDER, [$data['name']]);
        $files->delete(ModLibrary::DISABLED, [$data['name']]);
        Settings::server($server)->forget(ModLibrary::key($data['name']));
        Activity::event('server:prism-satisfactory.mods.remove')->property($data)->log();

        return new JsonResponse(['removed' => true]);
    }

    /**
     * Why these mods cannot be installed together on this server: one has no Linux server build
     * for this game build, or a mod needs another at a version it does not have.
     *
     * @param  array<string, array<string, mixed>>  $mods
     * @return list<string>
     */
    private static function problems(array $mods): array
    {
        $problems = [];
        foreach ($mods as $mod) {
            if ($mod['release'] === null) {
                $problems[] = $mod['linux'] ? $mod['title'].' has no version for this game build.' : $mod['title'].' has no Linux server build, so it cannot run on a dedicated server.';

                continue;
            }
            foreach ($mod['release']['dependencies'] as $dependency) {
                $needed = $mods[$dependency['id']] ?? null;
                if ($dependency['optional'] || $needed === null || $needed['release'] === null) {
                    continue;
                }
                if (! Ficsit::satisfies($dependency['condition'], $needed['release']['version'])) {
                    $problems[] = $mod['title'].' needs '.$needed['title'].' '.$dependency['condition'].', but '.$needed['release']['version'].' is the version for this game build.';
                }
            }
        }

        return array_values(array_unique($problems));
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
