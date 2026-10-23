<?php

declare(strict_types=1);

namespace PrismDatabase\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use PrismDatabase\Support\Access;
use PrismDatabase\Support\Settings;

/**
 * Sharing a database with the person's other servers, such as one LuckPerms database for a
 * whole network. It then shows on their Databases pages too.
 */
class SharesController
{
    /** Servers the person can share with: ones where they may see databases. */
    public function candidates(Request $request, Server $server, int $db): JsonResponse
    {
        $model = Access::find($request, $server, $db, 'database.update', owner: true);
        $shared = DB::table('prism_database_shares')->where('database_id', $model->id)->pluck('server_id')->all();

        $servers = Server::query()
            ->whereIn('id', $request->user()->accessibleServers()->pluck('id'))
            ->where('id', '!=', $server->id)
            ->orderBy('name')
            ->get()
            ->filter(static fn (Server $candidate): bool => $request->user()->can('database.read', $candidate))
            ->map(static fn (Server $candidate): array => ['identifier' => $candidate->uuidShort, 'name' => $candidate->name, 'shared' => in_array($candidate->id, $shared, true)])
            ->values();

        return new JsonResponse(['servers' => $servers]);
    }

    public function store(Request $request, Server $server, int $db): JsonResponse
    {
        abort_unless(Settings::bool('sharing', true), 403, 'Sharing databases is turned off.');
        $model = Access::find($request, $server, $db, 'database.update', owner: true);
        $identifier = (string) $request->validate(['server' => ['required', 'string', 'max:64']])['server'];

        $target = Server::query()->where('uuidShort', $identifier)->orWhere('uuid', $identifier)->first();
        abort_if($target === null || $target->id === $server->id, 404, 'That server was not found.');
        abort_unless($request->user()->can('database.read', $target), 403, 'You cannot see databases on that server.');

        DB::table('prism_database_shares')->updateOrInsert(['database_id' => $model->id, 'server_id' => $target->id], ['created_by' => $request->user()->id, 'updated_at' => now(), 'created_at' => now()]);
        Activity::event('server:prism-database.share')->property(['database' => $model->database, 'server' => $target->uuidShort])->log();

        return new JsonResponse(['shared' => true]);
    }

    public function destroy(Request $request, Server $server, int $db, string $target): JsonResponse
    {
        $model = Access::find($request, $server, $db, 'database.update', owner: true);
        $targetServer = Server::query()->where('uuidShort', $target)->first();
        abort_if($targetServer === null, 404, 'That server was not found.');

        DB::table('prism_database_shares')->where('database_id', $model->id)->where('server_id', $targetServer->id)->delete();
        Activity::event('server:prism-database.unshare')->property(['database' => $model->database, 'server' => $targetServer->uuidShort])->log();

        return new JsonResponse(['shared' => false]);
    }
}
