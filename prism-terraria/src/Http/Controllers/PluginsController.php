<?php

declare(strict_types=1);

namespace PrismTerraria\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use RuntimeException;
use PrismTerraria\Support\InstallPlan;
use PrismTerraria\Support\PluginCatalog;
use PrismTerraria\Support\ServerFiles;
use PrismTerraria\Support\Settings;
use Throwable;

class PluginsController extends Controller
{
    private const string FOLDER = 'ServerPlugins';

    /** TShock's own plugin, which TShock cannot run without. */
    private const array CORE = ['TShockAPI.dll'];

    /** The catalogue from Pryaxis/plugins, marked with what is installed. */
    public function catalog(Request $request, Server $server): JsonResponse
    {
        $info = $this->authorizeFeature($request, $server, 'plugins', 'plugins');

        try {
            $plugins = PluginCatalog::all();
        } catch (RuntimeException $exception) {
            abort(502, $exception->getMessage());
        }

        $records = $this->records($server);

        return new JsonResponse([
            'plugins' => array_map(static fn (array $plugin): array => $plugin + ['installed' => isset($records[$plugin['id']])], $plugins),
            'tshock' => $info['build'],
            'repository' => PluginCatalog::REPOSITORY,
        ]);
    }

    /** The plugins in ServerPlugins/, grouped by the catalogue entry they came from. */
    public function index(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'plugins', 'plugins');
        $records = $this->records($server);

        $files = [];
        foreach (ServerFiles::for($server)->list(self::FOLDER) as $name => $entry) {
            if ($entry['file'] && preg_match('/\.dll(\.disabled)?$/i', $name) === 1) {
                $files[(string) preg_replace('/\.disabled$/i', '', $name)] = ['size' => $entry['size'], 'enabled' => ! str_ends_with(strtolower($name), '.disabled')];
            }
        }

        $list = [];
        $claimed = [];
        foreach ($records as $id => $record) {
            $present = array_values(array_filter($record['files'] ?? [], static fn (string $file): bool => isset($files[$file])));
            $claimed = [...$claimed, ...$present];
            $list[] = [
                'id' => $id,
                'name' => $record['name'],
                'version' => $record['version'] ?? null,
                'files' => $present,
                'size' => array_sum(array_map(static fn (string $file): int => $files[$file]['size'], $present)),
                'enabled' => $present !== [] && $files[$present[0]]['enabled'],
                'missing' => $present === [],
                'core' => false,
            ];
        }

        foreach ($files as $file => $entry) {
            if (! in_array($file, $claimed, true)) {
                $list[] = [
                    'id' => null,
                    'name' => (string) preg_replace('/\.dll$/i', '', $file),
                    'version' => null,
                    'files' => [$file],
                    'size' => $entry['size'],
                    'enabled' => $entry['enabled'],
                    'missing' => false,
                    'core' => in_array($file, self::CORE, true),
                ];
            }
        }

        return new JsonResponse([
            'plugins' => $list,
            'running' => $this->running($server),
            'job' => InstallPlan::current($server),
            'confirmInstalls' => (bool) Settings::admin('confirm_installs', true),
        ]);
    }

    /** Downloads a catalogue plugin into ServerPlugins/. A .zip has its .dll files taken out. */
    public function install(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'plugins', 'plugins');
        $data = $request->validate(['id' => ['required', 'string', 'max:100'], 'restart' => ['sometimes', 'boolean']]);

        try {
            $plugin = PluginCatalog::find($data['id']);
        } catch (RuntimeException $exception) {
            abort(502, $exception->getMessage());
        }

        abort_if($plugin === null, 404, 'That plugin is not in the list.');
        abort_if($plugin['download'] === null, 422, $plugin['name'].' can only be downloaded from its own website.');

        $id = $plugin['id'];
        $key = 'plugin.'.$id;
        $record = ['id' => $id, 'name' => $plugin['name'], 'version' => $plugin['version'], 'installed' => now()->toAtomString()];
        $plan = InstallPlan::for($server, 'Installing '.$plugin['name']);

        // A reinstall replaces the files of the earlier one.
        $previous = Settings::server($server)->get($key);
        if (is_array($previous) && ($previous['files'] ?? []) !== []) {
            $plan->add('delete', ['dir' => self::FOLDER, 'files' => [...$previous['files'], ...array_map(static fn (string $file): string => $file.'.disabled', $previous['files'])]]);
        }

        if (str_ends_with(strtolower((string) parse_url($plugin['download'], PHP_URL_PATH)), '.dll')) {
            $file = Str::studly(Str::slug($plugin['name'])) ?: 'Plugin';
            $file = (string) preg_replace('/[^A-Za-z0-9_.-]/', '', $file).'.dll';
            $plan->add('pull', ['url' => $plugin['download'], 'dir' => self::FOLDER, 'file' => $file])
                ->add('record', ['key' => $key, 'value' => $record + ['files' => [$file]]]);
        } else {
            $folder = '.trs/plugins/'.$id;
            $plan->add('delete', ['dir' => '.trs/plugins', 'files' => [$id]])
                ->add('mkdir', ['path' => $folder])
                ->add('pull', ['url' => $plugin['download'], 'dir' => $folder, 'file' => 'plugin.zip'])
                ->add('unzip', ['dir' => $folder, 'file' => 'plugin.zip'])
                ->add('collect', ['from' => $folder, 'to' => self::FOLDER, 'extension' => 'dll', 'keep' => self::CORE, 'record' => ['key' => $key, 'value' => $record]])
                ->add('delete', ['dir' => '.trs/plugins', 'files' => [$id]])
                ->onFailure('delete', ['dir' => '.trs/plugins', 'files' => [$id]]);
        }

        $restart = ($data['restart'] ?? false) && $this->running($server);
        if ($restart) {
            $plan->add('power', ['action' => 'restart']);
        }

        $job = $plan->dispatch($request->user(), 'plugins');
        Activity::event('server:prism-terraria.plugins.install')->property(['plugin' => $id])->log();

        return new JsonResponse(['job' => $job, 'restarting' => $restart], 202);
    }

    /** Turns a plugin off by renaming its files to .dll.disabled, which TShock does not load. */
    public function toggle(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'plugins', 'plugins');
        $data = $request->validate([
            'files' => ['required', 'array', 'min:1', 'max:50'],
            'files.*' => ['string', 'max:200', 'regex:/^[^\/\\\\]+\.dll$/i'],
            'enabled' => ['required', 'boolean'],
        ]);
        abort_if(array_intersect($data['files'], self::CORE) !== [], 422, 'TShock cannot run without TShockAPI.dll.');

        $files = ServerFiles::for($server);
        $existing = $files->list(self::FOLDER);
        foreach ($data['files'] as $file) {
            [$from, $to] = $data['enabled'] ? [$file.'.disabled', $file] : [$file, $file.'.disabled'];
            if (isset($existing[$from])) {
                $files->rename(self::FOLDER, $from, $to);
            }
        }

        Activity::event('server:prism-terraria.plugins.toggle')->property($data)->log();

        return new JsonResponse(['enabled' => $data['enabled']]);
    }

    public function remove(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'plugins', 'plugins');
        $data = $request->validate([
            'id' => ['nullable', 'string', 'max:100'],
            'files' => ['required_without:id', 'array', 'max:50'],
            'files.*' => ['string', 'max:200', 'regex:/^[^\/\\\\]+\.dll$/i'],
        ]);
        abort_if(InstallPlan::isBusy($server), 409, 'Another install is running on this server. Try again when it is done.');

        $names = $data['files'] ?? [];
        if (! empty($data['id'])) {
            $record = Settings::server($server)->get('plugin.'.$data['id']);
            $names = [...$names, ...(is_array($record) ? ($record['files'] ?? []) : [])];
            Settings::server($server)->forget('plugin.'.$data['id']);
        }

        abort_if(array_intersect($names, self::CORE) !== [], 422, 'TShock cannot run without TShockAPI.dll.');
        ServerFiles::for($server)->delete(self::FOLDER, [...$names, ...array_map(static fn (string $file): string => $file.'.disabled', $names)]);
        Activity::event('server:prism-terraria.plugins.remove')->property(['plugin' => $data['id'] ?? null, 'files' => $names])->log();

        return new JsonResponse(['removed' => true]);
    }

    /** @return array<string, array<string, mixed>> install records keyed by catalogue id */
    private function records(Server $server): array
    {
        $records = [];
        foreach (Settings::server($server)->getByPrefix('plugin.') as $key => $value) {
            if (is_array($value)) {
                $records[(string) ($value['id'] ?? preg_replace('/^plugin\./', '', (string) $key))] = $value;
            }
        }

        return $records;
    }

    private function running(Server $server): bool
    {
        try {
            return in_array(Daemon::server($server)->details()['state'] ?? 'offline', ['running', 'starting'], true);
        } catch (Throwable) {
            return false;
        }
    }
}
