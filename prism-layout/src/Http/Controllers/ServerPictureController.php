<?php

declare(strict_types=1);

namespace PrismLayout\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use PrismLayout\Support\Pictures;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Server;

/** A server's own card picture; anyone who may rename the server may change it. */
class ServerPictureController extends Controller
{
    public function show(Request $request, Server $server): JsonResponse
    {
        return $this->state($request, $server);
    }

    public function store(Request $request, Server $server): JsonResponse
    {
        $this->authorizeChange($request, $server);
        $request->validate(['file' => Pictures::RULES]);
        Pictures::store('server', $server->id, $request->file('file'));

        return $this->state($request, $server);
    }

    public function destroy(Request $request, Server $server): JsonResponse
    {
        $this->authorizeChange($request, $server);
        Pictures::remove('server', $server->id);

        return $this->state($request, $server);
    }

    private function canChange(Request $request, Server $server): bool
    {
        return (bool) $request->user()?->can(Permissions::SettingsRename->value, $server);
    }

    private function authorizeChange(Request $request, Server $server): void
    {
        abort_unless($this->canChange($request, $server), 403, 'You need permission to rename this server to change its picture.');
    }

    private function state(Request $request, Server $server): JsonResponse
    {
        [$row, $source] = Pictures::forServer($server);

        return new JsonResponse(['data' => [
            'url' => $row !== null ? Pictures::url($row) : null,
            'source' => $source,
            'egg' => Egg::query()->whereKey($server->egg_id)->value('name') ?? 'this game',
            'canChange' => $this->canChange($request, $server),
        ]]);
    }
}
