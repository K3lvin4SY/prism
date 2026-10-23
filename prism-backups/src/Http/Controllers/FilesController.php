<?php

declare(strict_types=1);

namespace PrismBackups\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PrismBackups\Support\Access;
use PrismBackups\Support\ServerFiles;
use Pterodactyl\Models\Server;

/** The server's folders for the profile editor's tree, and its .pteroignore. */
class FilesController
{
    public function directory(Request $request, Server $server): JsonResponse
    {
        Access::require($request, $server, 'file.read', 'You do not have permission to see files.');
        Access::feature($request, $server, 'feature_profiles');
        $directory = ServerFiles::normalize((string) $request->query('directory', ''));

        $entries = array_values(ServerFiles::for($server)->list($directory));
        usort($entries, static fn (array $a, array $b): int => [$a['file'], mb_strtolower($a['name'])] <=> [$b['file'], mb_strtolower($b['name'])]);

        return new JsonResponse(['directory' => $directory, 'entries' => array_map(static fn (array $entry): array => ['name' => $entry['name'], 'file' => $entry['file'], 'size' => $entry['size']], $entries)]);
    }

    public function readIgnore(Request $request, Server $server): JsonResponse
    {
        Access::require($request, $server, 'file.read-content', 'You do not have permission to read files.');
        Access::feature($request, $server, 'feature_pteroignore');
        $content = ServerFiles::for($server)->read('.pteroignore', 1_000_000);

        return new JsonResponse(['exists' => $content !== null, 'content' => $content ?? '']);
    }

    public function writeIgnore(Request $request, Server $server): Response
    {
        Access::require($request, $server, 'file.update', 'You do not have permission to change files.');
        Access::feature($request, $server, 'feature_pteroignore');
        $data = $request->validate(['content' => ['present', 'nullable', 'string', 'max:200000']]);

        ServerFiles::for($server)->write('.pteroignore', (string) ($data['content'] ?? ''));

        return response()->noContent();
    }
}
