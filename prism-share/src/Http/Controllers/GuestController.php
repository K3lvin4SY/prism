<?php

declare(strict_types=1);

namespace PrismShare\Http\Controllers;

use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PrismShare\Models\Link;
use PrismShare\Support\Links;
use PrismShare\Support\SharePath;
use Pterodactyl\Contracts\Backups\GeneratesBackupDownloadLinks;
use Pterodactyl\Contracts\Files\ListsDirectories;
use Pterodactyl\Contracts\Servers\SendsServerCommands;
use Pterodactyl\Contracts\Servers\SendsServerPower;
use Pterodactyl\Enum\JwtScope;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Backup;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Extensions\ExtensionAssetPublisher;
use Pterodactyl\Services\Extensions\ExtensionRepository;
use Pterodactyl\Services\Nodes\NodeJwt;
use Throwable;

/**
 * The guest page and what it asks for. The token comes in the X-Prism-Share header on every
 * request and goes through Links::fromRequest, which checks the link and its maker each time.
 */
final class GuestController
{
    /** Folders below a shared one that a download may go through, so the symlink check stays bounded. */
    private const int MAX_DEPTH = 32;

    /** The page itself. It holds no token: that stays in the address's fragment, in the browser. */
    public function page(ExtensionRepository $extensions, ExtensionAssetPublisher $assets): Response
    {
        $manifest = $extensions->discovered()->first(fn ($manifest): bool => $manifest->id === 'prism-share');
        abort_if($manifest === null, 404);

        return response()->view('ext-prism-share::page', [
            'script' => $assets->assetUrl($manifest, 'share/share.js'),
            'style' => $assets->assetUrl($manifest, 'share/share.css'),
        ])->withHeaders([
            'Content-Security-Policy' => "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' wss: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            'Referrer-Policy' => 'no-referrer',
            'X-Frame-Options' => 'DENY',
            'X-Robots-Tag' => 'noindex, nofollow',
            'Cache-Control' => 'no-store',
        ]);
    }

    /** The server's name and what the link allows. Opening the page counts as a use. */
    public function info(Request $request): JsonResponse
    {
        [$link, $options] = Links::fromRequest($request);
        $link->forceFill(['last_used_at' => now(), 'uses' => $link->uses + 1])->save();
        $this->log('open', $link);

        return $this->json([
            // Not the link's name: that is the owner's own note.
            'server' => $link->server->name,
            'options' => $options,
            'expires_at' => $link->expires_at->toIso8601String(),
        ]);
    }

    /**
     * A console token for the server's node. It only lets the guest watch: commands and power
     * go through this panel, which checks and records them. Its user is the link, so revoking
     * the link drops it.
     */
    public function websocket(Request $request, NodeJwt $jwt): JsonResponse
    {
        [$link, $options] = Links::fromRequest($request);
        Links::needs($options, 'console');
        $server = $link->server;

        // Short, because a token is only checked again when it is renewed: a maker who loses a
        // permission takes it from their links' open consoles within this time.
        $expires = CarbonImmutable::now()->addMinutes(5);
        if ($link->expires_at->lt($expires)) {
            $expires = CarbonImmutable::instance($link->expires_at);
        }

        $token = $jwt->issue(
            $server->node,
            JwtScope::Websocket,
            identifiedBy: 'prism-share'.$link->uuid.$server->uuid,
            expiresAt: $expires,
            claims: ['server_uuid' => $server->uuid, 'permissions' => ['websocket.connect'], 'user_uuid' => $link->uuid],
        );
        $socket = str_replace(['https://', 'http://'], ['wss://', 'ws://'], $server->node->getConnectionAddress());

        return $this->json(['token' => $token->toString(), 'socket' => $socket.sprintf('/api/servers/%s/ws', $server->uuid)]);
    }

    public function command(Request $request, SendsServerCommands $commands): Response
    {
        [$link, $options] = Links::fromRequest($request);
        Links::needs($options, 'command');
        $command = $request->input('command');
        abort_unless(is_string($command) && $command !== '' && mb_strlen($command) <= 1000 && ! preg_match('/[\x00-\x1F\x7F]/', $command), 422, 'That is not a command that can be sent.');

        $this->daemon(fn () => $commands->send($link->server, $command));
        $this->log('command', $link, ['command' => $command]);

        return response()->noContent();
    }

    public function power(Request $request, SendsServerPower $power): Response
    {
        [$link, $options] = Links::fromRequest($request);
        $signal = $request->input('signal');
        abort_unless(in_array($signal, ['start', 'stop', 'restart'], true), 422, 'That is not a power action.');
        Links::needs($options, $signal);

        $this->daemon(fn () => $power->send($link->server, $signal));
        $this->log('power', $link, ['signal' => $signal]);

        return response()->noContent();
    }

    /** A shared folder's contents, or the shared folders and files themselves at the top. */
    public function files(Request $request, ListsDirectories $directories): JsonResponse
    {
        [$link, $options] = Links::fromRequest($request);
        Links::needs($options, 'files');
        $shared = $this->shared($link);

        $directory = $request->query('directory');
        if ($directory === null || $directory === '') {
            return $this->json(['directory' => null, 'entries' => $this->sharedEntries($link->server, $directories, $shared)]);
        }

        $directory = SharePath::normalize($directory);
        $root = $directory !== null ? SharePath::root($directory, $shared) : null;
        abort_if($directory === null || $root === null, 403, 'That folder is not shared.');
        $this->assertPlain($link->server, $directories, $root, $directory, directory: true);

        $entries = [];
        foreach ($this->daemon(fn () => $directories->list($link->server, $directory)) as $entry) {
            $name = (string) ($entry['name'] ?? '');
            // Links are left out: they could point anywhere on the server.
            if ($name === '' || ($entry['symlink'] ?? false) === true) {
                continue;
            }
            $entries[] = [
                'name' => $name,
                'path' => rtrim($directory, '/').'/'.$name,
                'directory' => ($entry['file'] ?? true) !== true,
                'size' => (int) ($entry['size'] ?? 0),
                'modified' => $entry['modified'] ?? null,
            ];
        }

        return $this->json(['directory' => $directory, 'entries' => $entries]);
    }

    public function download(Request $request, ListsDirectories $directories, NodeJwt $jwt): JsonResponse
    {
        [$link, $options] = Links::fromRequest($request);
        Links::needs($options, 'files');

        $file = SharePath::normalize($request->query('file'));
        $root = $file !== null ? SharePath::root($file, $this->shared($link)) : null;
        abort_if($file === null || $root === null || $file === '/', 403, 'That file is not shared.');
        $this->assertPlain($link->server, $directories, $root, $file, directory: false);

        $server = $link->server;
        $token = $jwt->issue(
            $server->node,
            JwtScope::FileDownload,
            identifiedBy: 'prism-share'.$link->uuid.$server->uuid,
            expiresAt: CarbonImmutable::now()->addMinutes(5),
            claims: ['file_path' => $file, 'server_uuid' => $server->uuid, 'user_uuid' => $link->uuid],
        );
        $this->log('download', $link, ['file' => $file]);

        return $this->json(['url' => sprintf('%s/download/file?token=%s', $server->node->getConnectionAddress(), $token->toString())]);
    }

    public function backups(Request $request): JsonResponse
    {
        [$link, $options] = Links::fromRequest($request);
        Links::needs($options, 'backups');

        return $this->json($this->sharedBackups($link)->map(static fn (Backup $backup): array => [
            'uuid' => $backup->uuid,
            'name' => $backup->name,
            'size' => $backup->bytes,
            'completed_at' => $backup->completed_at?->toIso8601String(),
        ])->values());
    }

    public function backupDownload(Request $request, GeneratesBackupDownloadLinks $links, string $backup): JsonResponse
    {
        [$link, $options] = Links::fromRequest($request);
        Links::needs($options, 'backups');
        $model = $this->sharedBackups($link)->firstWhere('uuid', $backup);
        abort_if($model === null, 403, 'That backup is not shared.');

        $url = $this->daemon(fn () => $links->generate($model, $link->user));
        $this->log('backup', $link, ['backup' => $model->name]);

        return $this->json(['url' => $url]);
    }

    /** @return list<string> the link's shared paths, normalized */
    private function shared(Link $link): array
    {
        return array_values(array_filter(array_map(SharePath::normalize(...), $link->paths)));
    }

    /**
     * The shared folders and files as entries, found in their parent folders; ones that are gone
     * or are symlinks are left out.
     *
     * @param  list<string>  $shared
     * @return list<array<string, mixed>>
     */
    private function sharedEntries(Server $server, ListsDirectories $directories, array $shared): array
    {
        $listings = [];
        $entries = [];
        foreach ($shared as $path) {
            if ($path === '/') {
                $entries[] = ['name' => '/', 'path' => '/', 'directory' => true, 'size' => 0, 'modified' => null];

                continue;
            }
            $parent = SharePath::parent($path);
            if (! array_key_exists($parent, $listings)) {
                try {
                    $listings[$parent] = $directories->list($server, $parent);
                } catch (Throwable) {
                    // A shared folder that was deleted since is left out.
                    $listings[$parent] = [];
                }
            }
            foreach ($listings[$parent] as $entry) {
                if (($entry['name'] ?? null) === basename($path) && ($entry['symlink'] ?? false) !== true) {
                    $entries[] = ['name' => $path, 'path' => $path, 'directory' => ($entry['file'] ?? true) !== true, 'size' => (int) ($entry['size'] ?? 0), 'modified' => $entry['modified'] ?? null];
                }
            }
        }

        return $entries;
    }

    /** @return \Illuminate\Support\Collection<int, Backup> the link's backups that are still on this server and finished */
    private function sharedBackups(Link $link)
    {
        return Backup::query()
            ->where('server_id', $link->server_id)
            ->whereIn('uuid', $link->backups)
            ->where('is_successful', true)
            ->whereNotNull('completed_at')
            ->orderByDesc('completed_at')
            ->get();
    }

    /**
     * Refuses a path that is, or passes through, a symlink below the shared folder (the shared
     * folder itself included), or that is not what it claims to be. Wings follows symlinks
     * anywhere inside the server, so without this a link inside a shared folder could hand out
     * files from outside it.
     */
    private function assertPlain(Server $server, ListsDirectories $directories, string $root, string $path, bool $directory): void
    {
        if ($path === '/') {
            return;
        }

        $steps = [];
        for ($current = $path; ; $current = SharePath::parent($current)) {
            $steps[] = $current;
            if ($current === $root || $current === '/') {
                break;
            }
        }
        abort_if(count($steps) > self::MAX_DEPTH, 403, 'That is too deep inside the shared folder.');

        foreach (array_reverse($steps) as $index => $step) {
            if ($step === '/') {
                continue;
            }
            $last = $index === count($steps) - 1;
            $name = basename($step);
            $found = null;
            foreach ($this->daemon(fn () => $directories->list($server, SharePath::parent($step))) as $entry) {
                if (($entry['name'] ?? null) === $name) {
                    $found = $entry;
                    break;
                }
            }

            $isFile = ($found['file'] ?? false) === true;
            abort_if(
                $found === null || ($found['symlink'] ?? false) === true || ($last ? $isFile === $directory : $isFile),
                403,
                'That is not shared.',
            );
        }
    }

    /**
     * @template T
     *
     * @param  callable(): T  $call
     * @return T
     */
    private function daemon(callable $call): mixed
    {
        try {
            return $call();
        } catch (Throwable $exception) {
            report($exception);
            abort(502, 'The server\'s node did not answer. Is the server running?');
        }
    }

    /** @param  array<string, mixed>  $properties */
    private function log(string $event, Link $link, array $properties = []): void
    {
        Activity::event('server:prism-share.'.$event)->withRequestMetadata()->subject($link->server)->property(['link' => $link->label, ...$properties])->log();
    }

    private function json(mixed $data): JsonResponse
    {
        return response()->json(['data' => $data])->withHeaders(['Cache-Control' => 'no-store']);
    }
}
