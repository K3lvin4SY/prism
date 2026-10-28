<?php

declare(strict_types=1);

namespace PrismFactorio\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use PrismFactorio\Support\Detector;
use PrismFactorio\Support\InstallPlan;
use PrismFactorio\Support\ModLibrary;
use PrismFactorio\Support\ModPortal;
use PrismFactorio\Support\ServerConsole;
use PrismFactorio\Support\ServerFiles;
use PrismFactorio\Support\Settings;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use RuntimeException;

class ModsController extends Controller
{
    private const string NAME = '/^[A-Za-z0-9_. -]{1,100}$/';

    /** The expansion's mods, which come with the game. */
    private const array EXPANSION = ['space-age' => 'Space Age', 'quality' => 'Quality', 'elevated-rails' => 'Elevated Rails', 'recycler' => 'Recycler'];

    /**
     * The server's mods: the files in the mods folder, joined with where they came from and
     * whether mod-list.json has them on, and the game's own expansion mods.
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'mods', 'mods');
        $library = ModLibrary::for($server);
        $records = $library->records();
        $files = $library->files();
        $states = $library->states();

        $list = [];
        foreach ($info['expansion'] as $name) {
            $list[] = ['name' => $name, 'title' => self::EXPANSION[$name] ?? $name, 'icon' => null, 'url' => null, 'version' => $info['version'], 'builtIn' => true, 'portal' => false, 'dependency' => false, 'enabled' => $states[$name] ?? true, 'missing' => false, 'files' => []];
        }
        foreach ($records + $files as $name => $_) {
            $record = $records[$name] ?? null;
            $file = $files[$name] ?? null;
            $list[] = [
                'name' => (string) $name,
                'title' => $record['title'] ?? $name,
                'icon' => $record['icon'] ?? null,
                'url' => $record['url'] ?? null,
                'version' => $file['version'] ?? ($record['version'] ?? null),
                'builtIn' => false,
                'portal' => $record !== null,
                'dependency' => (bool) ($record['dependency'] ?? false),
                'enabled' => $states[$name] ?? true,
                'missing' => $file === null,
                'files' => $file['files'] ?? [],
            ];
        }

        usort($list, static fn (array $a, array $b): int => [! $a['builtIn'], strtolower((string) $a['title'])] <=> [! $b['builtIn'], strtolower((string) $b['title'])]);
        $credentials = ModPortal::credentials($server);

        return new JsonResponse([
            'mods' => $list,
            'factorioVersion' => Detector::major($info['version']),
            'account' => $credentials === null ? null : ['username' => $credentials['username'], 'from' => $credentials['from']],
            'running' => ServerConsole::for($server)->isRunning(),
            'job' => InstallPlan::current($server),
            'confirmInstalls' => (bool) Settings::admin('confirm_installs', true),
        ]);
    }

    /** What the browser's filters offer. */
    public function meta(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'mods', 'mods');

        return new JsonResponse(['categories' => ModPortal::CATEGORIES, 'sorts' => ModPortal::SORTS, 'factorioVersion' => Detector::major($info['version'])]);
    }

    public function search(Request $request, Server $server): JsonResponse
    {
        $major = $this->major($request, $server);
        $data = $request->validate([
            'query' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', 'string', 'in:'.implode(',', ModPortal::SORTS)],
            'categories' => ['nullable', 'array', 'max:'.count(ModPortal::CATEGORIES)],
            'categories.*' => ['string', 'in:'.implode(',', array_keys(ModPortal::CATEGORIES))],
            'page' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $result = $this->call(static fn (): array => ModPortal::search($major, $data));
        $installed = ModLibrary::for($server)->records() + ModLibrary::for($server)->files();
        foreach ($result['hits'] as &$hit) {
            $hit['installed'] = isset($installed[$hit['name']]);
        }

        return new JsonResponse($result);
    }

    /** One mod with its description, the release for this server and the mods it needs. */
    public function show(Request $request, Server $server, string $mod): JsonResponse
    {
        $major = $this->major($request, $server);
        abort_unless((bool) preg_match(self::NAME, $mod), 404, 'That mod was not found.');
        $all = $this->call(static fn (): array => ModPortal::withDependencies([$mod], $major));
        $details = $all[$mod] ?? $this->call(static fn (): array => ModPortal::details([$mod], $major))[$mod] ?? null;
        abort_if($details === null, 404, 'That mod was not found.');

        $installed = ModLibrary::for($server)->records() + ModLibrary::for($server)->files();
        $dependencies = array_values(array_filter($all, static fn (array $item): bool => $item['name'] !== $mod));

        return new JsonResponse([
            'mod' => $details + ['installed' => isset($installed[$mod])],
            'dependencies' => array_map(static fn (array $item): array => ['id' => $item['name'], 'title' => $item['title'], 'icon' => $item['icon'], 'installed' => isset($installed[$item['name']])], $dependencies),
            // Mods it does not work with that this server has.
            'conflicts' => array_values(array_intersect($details['incompatible'], array_keys($installed))),
            'factorioVersion' => $major,
        ]);
    }

    /**
     * Installs mods and the mods they need from the mod portal, at their newest release for the
     * server's game version, and switches them on in mod-list.json. Also used to update.
     */
    public function install(Request $request, Server $server): JsonResponse
    {
        $major = $this->major($request, $server);
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:30'],
            'ids.*' => ['string', 'regex:'.self::NAME],
            'restart' => ['sometimes', 'boolean'],
        ]);
        abort_if(ModPortal::credentials($server) === null, 422, 'Downloading from the mod portal needs a factorio.com account. Add a username and token in Properties, or ask an administrator to add one in Prism Properties.');

        $library = ModLibrary::for($server);
        $records = $library->records();
        $files = $library->files();
        $found = $this->call(static fn (): array => ModPortal::withDependencies($data['ids'], $major));
        foreach ($data['ids'] as $name) {
            abort_unless(isset($found[$name]), 422, 'The mod '.$name.' was not found on the mod portal.');
        }

        // A dependency already installed is left as it is unless it was asked for.
        $wanted = array_filter($found, static fn (array $mod, int|string $name): bool => in_array((string) $name, $data['ids'], true) || ! (isset($records[$name]) || isset($files[$name])), ARRAY_FILTER_USE_BOTH);
        abort_if($wanted === [], 422, 'Those mods are already installed.');
        $titles = array_values(array_column($wanted, 'title'));

        $plan = InstallPlan::for($server, 'Installing '.implode(', ', array_slice($titles, 0, 3)).(count($titles) > 3 ? ' and '.(count($titles) - 3).' more' : ''));
        $enable = [];
        foreach ($wanted as $name => $mod) {
            $name = (string) $name;
            $present = isset($records[$name]) || isset($files[$name]);
            $release = $mod['release'];
            abort_if($release === null, 422, $mod['title'].' has no release for Factorio '.$major.'.');
            abort_if(! preg_match('/^[A-Za-z0-9_. -]+\.zip$/', $release['file']), 422, $mod['title'].' has an unexpected file name.');

            $plan->add('pull', ['url' => $release['url'], 'dir' => ModLibrary::FOLDER, 'file' => $release['file']]);
            if (preg_match('/^[0-9a-f]{40}$/', $release['sha1'])) {
                $plan->add('verify', ['path' => ServerFiles::join(ModLibrary::FOLDER, $release['file']), 'algorithm' => 'sha1', 'hash' => $release['sha1']]);
            }
            // Older versions of the mod go once the new one is in place; the game would load the newest anyway.
            $old = array_values(array_diff($files[$name]['files'] ?? [], [$release['file']]));
            if ($old !== []) {
                $plan->add('delete', ['dir' => ModLibrary::FOLDER, 'files' => $old]);
            }
            $plan->add('record', ['key' => ModLibrary::key($name), 'value' => [
                'name' => $name,
                'title' => $mod['title'],
                'icon' => $mod['icon'],
                'url' => $mod['url'],
                'version' => $release['version'],
                'file' => $release['file'],
                'dependency' => in_array($name, $data['ids'], true) ? false : (bool) ($records[$name]['dependency'] ?? true),
            ]]);
            if (! $present) {
                $plan->onFailure('delete', ['dir' => ModLibrary::FOLDER, 'files' => [$release['file']]]);
            }
            $enable[$name] = true;
        }

        $plan->add('write', ['path' => ModLibrary::LIST, 'content' => base64_encode($library->modList($enable))]);
        $restart = ($data['restart'] ?? false) && ServerConsole::for($server)->isRunning();
        if ($restart) {
            $plan->add('power', ['action' => 'restart']);
        }

        $job = $plan->dispatch($request->user(), 'mods');
        Activity::event('server:prism-factorio.mods.install')->property(['mods' => array_keys($enable)])->log();

        return new JsonResponse(['job' => $job, 'added' => $titles, 'restarting' => $restart], 202);
    }

    /** Newer releases for the server's game version, by mod name. */
    public function updates(Request $request, Server $server): JsonResponse
    {
        $major = $this->major($request, $server);
        $library = ModLibrary::for($server);
        $files = $library->files();
        $records = $library->records();
        $current = $this->call(static fn (): array => ModPortal::details(array_map('strval', array_keys($records)), $major));

        $updates = [];
        foreach ($records as $name => $record) {
            $latest = $current[$name]['version'] ?? null;
            $installed = $files[$name]['version'] ?? ($record['version'] ?? null);
            if ($latest !== null && $installed !== null && version_compare($latest, $installed, '>')) {
                $updates[$name] = $latest;
            }
        }

        return new JsonResponse(['updates' => (object) $updates]);
    }

    /** Turns a mod on or off in mod-list.json. The game reads it when it starts. */
    public function toggle(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $data = $request->validate(['name' => ['required', 'string', 'regex:'.self::NAME, 'not_in:base'], 'enabled' => ['required', 'boolean']]);
        abort_if(InstallPlan::isBusy($server), 409, 'An install is running on this server. Try again when it is done.');

        $library = ModLibrary::for($server);
        abort_unless(isset($library->files()[$data['name']]) || isset($library->states()[$data['name']]), 404, 'That mod was not found.');
        ServerFiles::for($server)->write(ModLibrary::LIST, $library->modList([$data['name'] => $data['enabled']]));
        Activity::event('server:prism-factorio.mods.toggle')->property($data)->log();

        return new JsonResponse(['enabled' => $data['enabled']]);
    }

    /** Deletes a mod's files, forgets it and takes it out of mod-list.json. */
    public function remove(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'mods', 'mods');
        $data = $request->validate(['name' => ['required', 'string', 'regex:'.self::NAME, 'not_in:'.implode(',', Detector::BUILT_IN)]]);
        abort_if(InstallPlan::isBusy($server), 409, 'An install is running on this server. Try again when it is done.');

        $library = ModLibrary::for($server);
        $files = ServerFiles::for($server);
        $present = $library->files()[$data['name']]['files'] ?? [];
        if ($present !== []) {
            $files->delete(ModLibrary::FOLDER, $present);
        }
        Settings::server($server)->forget(ModLibrary::key($data['name']));
        $files->write(ModLibrary::LIST, $library->modList([$data['name'] => null]));
        Activity::event('server:prism-factorio.mods.remove')->property($data)->log();

        return new JsonResponse(['removed' => true]);
    }

    /** The game version mods are picked for, such as 2.1. */
    private function major(Request $request, Server $server): string
    {
        $info = $this->authorizeFeature($request, $server, 'mods', 'mods');
        $major = Detector::major($info['version']);
        abort_if($major === null, 409, 'The Factorio version is not known yet. Reinstall the server, or wait for its install to finish.');

        return $major;
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
