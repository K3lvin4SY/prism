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
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

/**
 * The guest page and what it asks for. The token comes in the X-Prism-Share header on every
 * request and goes through Links::fromRequest, which checks the link and its maker each time.
 */
final class GuestController
{
    /** Folders a path may be inside, so the symlink check stays bounded. */
    private const int MAX_DEPTH = 32;

    /** Download links last just long enough to start: revoking a link cannot reach one handed out. */
    private const int DOWNLOAD_SECONDS = 60;

    /** @var array<string, list<array<string, mixed>>> folder listings already asked for in this request */
    private array $listings = [];

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
        // A controller can outlive a request; its listings must not.
        $this->listings = [];
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
        foreach ($this->listing($link->server, $directories, $directory) as $entry) {
            $name = (string) ($entry['name'] ?? '');
            // Links are left out: they could point anywhere on the server.
            if ($name === '' || self::isSymlink($entry)) {
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
        // A controller can outlive a request; its listings must not.
        $this->listings = [];
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
            expiresAt: $this->downloadExpiry($link),
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

    public function backupDownload(Request $request, GeneratesBackupDownloadLinks $links, NodeJwt $jwt, string $backup): JsonResponse
    {
        [$link, $options] = Links::fromRequest($request);
        Links::needs($options, 'backups');
        $model = $this->sharedBackups($link)->firstWhere('uuid', $backup);
        abort_if($model === null, 403, 'That backup is not shared.');

        // A backup on the node gets a token of the link's own, as short as a file's. One in S3
        // gets the panel's presigned address, which lasts five minutes.
        $server = $link->server;
        $url = $model->disk === Backup::ADAPTER_WINGS
            ? sprintf('%s/download/backup?token=%s', $server->node->getConnectionAddress(), $jwt->issue(
                $server->node,
                JwtScope::BackupDownload,
                identifiedBy: 'prism-share'.$link->uuid.$server->uuid,
                expiresAt: $this->downloadExpiry($link),
                claims: ['backup_uuid' => $model->uuid, 'server_uuid' => $server->uuid, 'user_uuid' => $link->uuid],
            )->toString())
            : $this->daemon(fn () => $links->generate($model, $link->user));
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
        $entries = [];
        foreach ($shared as $path) {
            if ($path === '/') {
                $entries[] = ['name' => '/', 'path' => '/', 'directory' => true, 'size' => 0, 'modified' => null];

                continue;
            }
            try {
                $this->assertPlain($server, $directories, $path, $path, null);
            } catch (HttpException) {
                // Deleted since, or reached through a symlink: left out.
                continue;
            }
            foreach ($this->listing($server, $directories, SharePath::parent($path)) as $entry) {
                if (($entry['name'] ?? null) === basename($path)) {
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
     * Refuses a path that is a symlink or passes through one, from the server's root down (the
     * folders above the shared one too: one of them could be a symlink that moves the shared
     * folder elsewhere), or that is not the kind of entry asked for. Wings follows symlinks
     * anywhere inside the server, so without this a symlink inside a shared folder could hand out
     * files from outside it.
     *
     * @param  bool|null  $directory  true for a folder, false for a file, null for either
     */
    private function assertPlain(Server $server, ListsDirectories $directories, string $root, string $path, ?bool $directory): void
    {
        if ($path === '/') {
            return;
        }

        $steps = [];
        for ($current = $path; $current !== '/'; $current = SharePath::parent($current)) {
            $steps[] = $current;
        }
        abort_if(count($steps) > self::MAX_DEPTH, 403, 'That is too deep inside the server.');
        abort_unless(SharePath::within($path, $root), 403, 'That is not shared.');

        foreach (array_reverse($steps) as $index => $step) {
            $last = $index === count($steps) - 1;
            $found = null;
            foreach ($this->listing($server, $directories, SharePath::parent($step), missing: 403) as $entry) {
                if (($entry['name'] ?? null) === basename($step)) {
                    $found = $entry;
                    break;
                }
            }

            $isFile = ($found['file'] ?? false) === true;
            abort_if(
                $found === null || self::isSymlink($found) || ($last ? $directory !== null && $isFile === $directory : $isFile),
                403,
                'That is not shared.',
            );
        }
    }

    /**
     * Whether a listed entry is a symlink. Wings sets `symlink` for it, and its `mode` starts with
     * "L" (Go's mark for a symlink); either is enough, in case one of them is wrong on a node.
     *
     * @param  array<string, mixed>  $entry
     */
    private static function isSymlink(array $entry): bool
    {
        return ($entry['symlink'] ?? false) === true || str_starts_with((string) ($entry['mode'] ?? ''), 'L');
    }

    /**
     * A folder's entries, asked of the node once per request.
     *
     * @param  int  $missing  the status when the node cannot list it
     * @return list<array<string, mixed>>
     */
    private function listing(Server $server, ListsDirectories $directories, string $directory, int $missing = 502): array
    {
        if (! array_key_exists($directory, $this->listings)) {
            try {
                $this->listings[$directory] = $directories->list($server, $directory);
            } catch (Throwable $exception) {
                if ($missing === 502) {
                    report($exception);
                }
                abort($missing, $missing === 502 ? 'The server\'s node did not answer. Is the server running?' : 'That is not shared.');
            }
        }

        return $this->listings[$directory];
    }

    private function downloadExpiry(Link $link): CarbonImmutable
    {
        $expires = CarbonImmutable::now()->addSeconds(self::DOWNLOAD_SECONDS);

        return $link->expires_at->lt($expires) ? CarbonImmutable::instance($link->expires_at) : $expires;
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
        // Anonymous: a guest is not whoever may be signed in to the panel in the same browser.
        Activity::event('server:prism-share.'.$event)->anonymous()->withRequestMetadata()->subject($link->server)->property(['link' => $link->label, ...$properties])->log();
    }

    private function json(mixed $data): JsonResponse
    {
        return response()->json(['data' => $data])->withHeaders(['Cache-Control' => 'no-store']);
    }
}
