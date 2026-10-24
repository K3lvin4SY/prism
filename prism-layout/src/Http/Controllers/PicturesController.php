<?php

declare(strict_types=1);

namespace PrismLayout\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use PrismLayout\Support\Pictures;
use Pterodactyl\Models\Server;
use Symfony\Component\HttpFoundation\Response;

/** The dashboard's card pictures, for the servers the person can see. */
class PicturesController extends Controller
{
    /** Each listed server's picture by uuid; servers without one are left out. */
    public function index(Request $request): JsonResponse
    {
        $uuids = array_slice(array_filter(explode(',', (string) $request->query('servers', '')), static fn (string $uuid): bool => preg_match('/^[0-9a-f-]{36}$/', $uuid) === 1), 0, 200);
        $user = $request->user();
        $servers = $user->root_admin ? Server::query()->whereIn('uuid', $uuids)->get() : $user->accessibleServers()->whereIn('servers.uuid', $uuids)->get();

        $rows = DB::table(Pictures::TABLE)
            ->where(fn ($query) => $query->where('kind', 'server')->whereIn('target_id', $servers->pluck('id')))
            ->orWhere(fn ($query) => $query->where('kind', 'egg')->whereIn('target_id', $servers->pluck('egg_id')->unique()))
            ->get();

        $map = [];
        foreach ($servers as $server) {
            $row = $rows->first(fn ($row) => $row->kind === 'server' && (int) $row->target_id === $server->id)
                ?? $rows->first(fn ($row) => $row->kind === 'egg' && (int) $row->target_id === $server->egg_id);
            if ($row !== null) {
                $map[$server->uuid] = Pictures::url($row);
            }
        }

        return new JsonResponse(['data' => (object) $map]);
    }

    /** A picture's file. A server's own is only for people who can see that server. */
    public function show(Request $request, int $picture): Response
    {
        $row = DB::table(Pictures::TABLE)->find($picture);
        abort_if($row === null || ! Storage::disk('local')->exists($row->file), 404);

        if ($row->kind === 'server') {
            $user = $request->user();
            $server = Server::query()->find($row->target_id);
            abort_unless($server !== null && ($user->root_admin || $user->accessibleServers()->where('servers.id', $server->id)->exists()), 404);
        }

        // Served as an image only: an SVG cannot run scripts or load anything.
        return Storage::disk('local')->response($row->file, null, [
            'Cache-Control' => 'private, max-age=604800, immutable',
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
