<?php

declare(strict_types=1);

namespace PrismDatabase\Support;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Models\Database;
use Pterodactyl\Models\Server;

/**
 * Which databases a server may use: its own, and those other servers shared with it. Every
 * action also needs the panel's own database permission on the server it is made from.
 */
final class Access
{
    /** @return Collection<int, Database> */
    public static function databases(Server $server): Collection
    {
        $shared = Settings::bool('sharing', true)
            ? DB::table('prism_database_shares')->where('server_id', $server->id)->pluck('database_id')->all()
            : [];

        return Database::query()
            ->with(['host', 'server'])
            ->where(fn ($query) => $query->where('server_id', $server->id)->orWhereIn('id', $shared))
            ->orderBy('id')
            ->get();
    }

    /**
     * The database by id, if this server may use it, after checking the permission.
     * `owner` additionally requires the database to belong to this server, for sharing it.
     */
    public static function find(Request $request, Server $server, int|string $id, string $permission, bool $owner = false): Database
    {
        abort_unless($request->user()->can($permission, $server), 403, 'You do not have permission to do this.');

        $database = self::databases($server)->firstWhere('id', (int) $id);
        abort_if($database === null, 404, 'That database was not found.');
        abort_if($owner && $database->server_id !== $server->id, 403, 'Only the server the database belongs to can do this.');

        return $database;
    }
}
