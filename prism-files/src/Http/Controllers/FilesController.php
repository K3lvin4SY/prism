<?php

declare(strict_types=1);

namespace PrismFiles\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Extensions\ExtensionSettings;
use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use PrismFiles\Support\Paths;
use PrismFiles\Support\ServerFiles;
use PrismFiles\Support\Trash;

/**
 * Prism File Browser's own file routes: the trash, and the writes that check protected paths
 * and conflicts before they reach the node. Reads use the panel's own file API.
 */
class FilesController
{
    public function state(Request $request, Server $server): JsonResponse
    {
        $this->allow($request, $server, 'file.read');
        $trash = Trash::for($server);

        return new JsonResponse([
            'trash' => ['items' => $trash->items(), 'ignored' => $trash->ignoredInBackups()],
            'preferences' => (new ExtensionSettings('prism-files'))->forUser($request->user())->get('preferences', (object) []),
            // The admin's current settings, so a change in Prism Properties shows without a reload.
            'config' => (object) (app(ExtensionSettingsRegistry::class)->get('prism-files')?->frontendConfig() ?? []),
        ]);
    }

    public function preferences(Request $request, Server $server): JsonResponse
    {
        $this->allow($request, $server, 'file.read');
        $data = $request->validate(['preferences' => ['present', 'array']]);
        abort_if(strlen((string) json_encode($data['preferences'])) > 30_000, 422, 'Those preferences are too large to save.');
        (new ExtensionSettings('prism-files'))->forUser($request->user())->set('preferences', $data['preferences']);

        return new JsonResponse(['preferences' => $data['preferences']]);
    }

    public function trash(Request $request, Server $server): JsonResponse
    {
        $this->allow($request, $server, 'file.delete');
        $data = $request->validate(['directory' => ['present', 'nullable', 'string', 'max:4096'], 'files' => ['required', 'array', 'min:1', 'max:500'], 'files.*' => ['string', 'max:4096']]);
        abort_unless((bool) Paths::setting('trash', true), 422, 'The trash is turned off.');

        $directory = (string) ($data['directory'] ?? '');
        Paths::guard($request->user(), $server, ...array_map(static fn (string $file): string => ServerFiles::join($directory, $file), $data['files']));
        $added = Trash::for($server)->put($directory, $data['files'], $request->user()->username);

        Activity::event('server:file.delete')->property(['directory' => '/'.ServerFiles::normalize($directory), 'files' => $data['files'], 'trash' => true])->log();

        return new JsonResponse(['items' => $added]);
    }

    public function restore(Request $request, Server $server): JsonResponse
    {
        $this->allow($request, $server, 'file.create');
        $data = $request->validate(['ids' => ['required', 'array', 'min:1', 'max:500'], 'ids.*' => ['string', 'alpha_num', 'max:32'], 'conflict' => ['required', 'string', 'in:skip,replace,rename']]);

        $trash = Trash::for($server);
        $targets = array_column(array_filter($trash->items(), static fn (array $item): bool => in_array($item['id'], $data['ids'], true)), 'path');
        if ($data['conflict'] === 'replace') {
            Paths::guard($request->user(), $server, ...$targets);
        }

        $result = $trash->restore($data['ids'], $data['conflict']);
        Activity::event('server:prism-files.trash.restore')->property(['files' => $result['restored']])->log();

        return new JsonResponse($result);
    }

    public function purge(Request $request, Server $server): JsonResponse
    {
        $this->allow($request, $server, 'file.delete');
        $data = $request->validate(['ids' => ['required', 'array', 'min:1', 'max:500'], 'ids.*' => ['string', 'alpha_num', 'max:32']]);
        $count = Trash::for($server)->purge($data['ids']);
        Activity::event('server:prism-files.trash.purge')->property(['count' => $count])->log();

        return new JsonResponse(['purged' => $count]);
    }

    public function empty(Request $request, Server $server): JsonResponse
    {
        $this->allow($request, $server, 'file.delete');
        $count = Trash::for($server)->empty();
        Activity::event('server:prism-files.trash.empty')->property(['count' => $count])->log();

        return new JsonResponse(['purged' => $count]);
    }

    public function ignore(Request $request, Server $server): JsonResponse
    {
        $this->allow($request, $server, 'file.update');

        return new JsonResponse(['changed' => Trash::for($server)->ignoreInBackups()]);
    }

    /** Deletes for good, after checking protected paths. Used when the trash is off. */
    public function delete(Request $request, Server $server): JsonResponse
    {
        $this->allow($request, $server, 'file.delete');
        $data = $request->validate(['directory' => ['present', 'nullable', 'string', 'max:4096'], 'files' => ['required', 'array', 'min:1', 'max:500'], 'files.*' => ['string', 'max:4096']]);
        $directory = (string) ($data['directory'] ?? '');
        Paths::guard($request->user(), $server, ...array_map(static fn (string $file): string => ServerFiles::join($directory, $file), $data['files']));

        ServerFiles::for($server)->delete($directory, $data['files']);
        Activity::event('server:file.delete')->property(['directory' => '/'.ServerFiles::normalize($directory), 'files' => $data['files']])->log();

        return new JsonResponse(['deleted' => count($data['files'])]);
    }

    /** Renames and moves, after checking that neither end is protected. */
    public function rename(Request $request, Server $server): JsonResponse
    {
        $this->allow($request, $server, 'file.update');
        $data = $request->validate([
            'root' => ['present', 'nullable', 'string', 'max:4096'],
            'files' => ['required', 'array', 'min:1', 'max:500'],
            'files.*.from' => ['required', 'string', 'max:4096'],
            'files.*.to' => ['required', 'string', 'max:4096'],
        ]);
        $root = (string) ($data['root'] ?? '');
        foreach ($data['files'] as $file) {
            Paths::guard($request->user(), $server, ServerFiles::join($root, $file['from']), ServerFiles::join($root, $file['to']));
        }

        $files = ServerFiles::for($server);
        foreach ($data['files'] as $file) {
            $files->rename($root, $file['from'], $file['to']);
        }

        Activity::event('server:file.rename')->property(['directory' => '/'.ServerFiles::normalize($root), 'files' => $data['files']])->log();

        return new JsonResponse(['renamed' => count($data['files'])]);
    }

    /**
     * Saves a file. With `expected`, the modification time the editor opened, a file changed
     * on the server since is not overwritten unless `force` is set; the answer is 409 with the
     * current time, so the editor can compare first.
     */
    public function write(Request $request, Server $server): JsonResponse
    {
        $path = ServerFiles::normalize((string) $request->input('path', ''));
        abort_if($path === '', 422, 'Pick a file to save.');

        $files = ServerFiles::for($server);
        $directory = dirname($path) === '.' ? '' : dirname($path);
        $entry = $files->list($directory)[basename($path)] ?? null;
        $this->allow($request, $server, $entry === null ? 'file.create' : 'file.update');

        $data = $request->validate([
            'content' => ['present', 'nullable', 'string', 'max:'.(max(1, (int) Paths::setting('max_edit_mb', 6)) * 1024 * 1024)],
            'expected' => ['nullable', 'string', 'max:64'],
            'force' => ['sometimes', 'boolean'],
        ]);
        Paths::guard($request->user(), $server, $path);
        abort_if($entry !== null && ! $entry['file'], 422, 'That is a folder.');

        if ($entry !== null && ! empty($data['expected']) && ! ($data['force'] ?? false) && $entry['modified'] !== null && strtotime($entry['modified']) !== strtotime($data['expected'])) {
            return new JsonResponse(['error' => 'changed', 'modified' => $entry['modified']], 409);
        }

        $files->write($path, (string) ($data['content'] ?? ''));
        Activity::event('server:file.write')->property('file', '/'.$path)->log();

        $saved = $files->list($directory)[basename($path)] ?? null;

        return new JsonResponse(['modified' => $saved['modified'] ?? null, 'size' => $saved['size'] ?? null]);
    }

    private function allow(Request $request, Server $server, string $permission): void
    {
        abort_unless($request->user()->can($permission, $server), 403, 'You do not have permission to do this.');
    }
}
