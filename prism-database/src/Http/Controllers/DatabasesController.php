<?php

declare(strict_types=1);

namespace PrismDatabase\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Models\Database;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use PrismDatabase\Support\Access;
use PrismDatabase\Support\Inspector;
use RuntimeException;

class DatabasesController
{
    /** The server's databases and those shared with it, with what Prism knows about each. */
    public function index(Request $request, Server $server): JsonResponse
    {
        abort_unless($request->user()->can('database.read', $server), 403, 'You do not have permission to see databases.');
        $databases = Access::databases($server);
        $shares = DB::table('prism_database_shares')
            ->join('servers', 'servers.id', '=', 'prism_database_shares.server_id')
            ->whereIn('database_id', $databases->pluck('id'))
            ->get(['database_id', 'servers.uuidShort as identifier', 'servers.name']);

        return new JsonResponse([
            'databases' => $databases->map(fn (Database $database): array => $this->present($database, $server, $shares->where('database_id', $database->id)->values()->all()))->values(),
            // The admin's current settings, so a change in Prism Properties shows without a reload.
            'config' => (object) (app(ExtensionSettingsRegistry::class)->get('prism-database')?->frontendConfig() ?? []),
        ]);
    }

    /** Size, rows, connections, the server version, the 30 day history and the connection details. */
    public function overview(Request $request, Server $server, int $db): JsonResponse
    {
        $database = Access::find($request, $server, $db, 'database.read');

        try {
            $inspector = Inspector::for($database, 10);
            $live = [
                'totals' => $inspector->totals(),
                'version' => $inspector->version(),
                'processes' => $inspector->processes(),
                'error' => null,
            ];
        } catch (RuntimeException $exception) {
            $live = ['totals' => null, 'version' => null, 'processes' => [], 'error' => $exception->getMessage()];
        }

        $history = DB::table('prism_database_usage')
            ->where('database_id', $database->id)
            ->where('recorded_at', '>=', now()->subDays(30))
            ->orderBy('recorded_at')
            ->get(['size', 'rows', 'tables', 'recorded_at'])
            ->map(static fn ($row): array => ['size' => (int) $row->size, 'rows' => (int) $row->rows, 'tables' => (int) $row->tables, 'at' => (string) $row->recorded_at]);

        return new JsonResponse([
            ...$live,
            'database' => $this->present($database, $server, []),
            'password' => $request->user()->can('database.view_password', $server) ? Crypt::decrypt($database->password) : null,
            'history' => $history,
        ]);
    }

    /** @param list<object> $shares */
    private function present(Database $database, Server $server, array $shares): array
    {
        return [
            'id' => $database->id,
            'name' => $database->database,
            'username' => $database->username,
            'host' => $database->host?->host,
            'port' => $database->host?->port,
            'hostName' => $database->host?->name,
            'remote' => $database->remote,
            'maxConnections' => $database->max_connections,
            'own' => $database->server_id === $server->id,
            'owner' => ['identifier' => $database->server?->uuidShort, 'name' => $database->server?->name],
            'sharedWith' => $database->server_id === $server->id ? array_map(static fn ($share): array => ['identifier' => $share->identifier, 'name' => $share->name], $shares) : [],
        ];
    }
}
