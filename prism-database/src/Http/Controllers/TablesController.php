<?php

declare(strict_types=1);

namespace PrismDatabase\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PDOException;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use PrismDatabase\Support\Access;
use PrismDatabase\Support\Connection;
use PrismDatabase\Support\Inspector;
use PrismDatabase\Support\Settings;
use RuntimeException;

/** Tables, their rows and structure. Reading needs database.read, changing database.update. */
class TablesController
{
    public function index(Request $request, Server $server, int $db): JsonResponse
    {
        $inspector = $this->inspector($request, $server, $db, 'database.read');

        return new JsonResponse(['tables' => $inspector->tables()]);
    }

    public function rows(Request $request, Server $server, int $db, string $table): JsonResponse
    {
        $inspector = $this->inspector($request, $server, $db, 'database.read');
        $data = $request->validate([
            'page' => ['nullable', 'integer', 'min:1'],
            'perPage' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'sort' => ['nullable', 'string', 'max:64'],
            'direction' => ['nullable', 'string', 'in:asc,desc'],
            'search' => ['nullable', 'string', 'max:200'],
            'column' => ['nullable', 'string', 'max:64'],
        ]);

        return $this->run(fn () => new JsonResponse($inspector->rows(
            $inspector->table($table),
            (int) ($data['page'] ?? 1),
            min((int) ($data['perPage'] ?? Settings::int('max_rows_page', 100)), Settings::int('max_rows_page', 100)),
            $data['sort'] ?? null,
            $data['direction'] ?? 'asc',
            (string) ($data['search'] ?? ''),
            $data['column'] ?? null,
        )));
    }

    public function structure(Request $request, Server $server, int $db, string $table): JsonResponse
    {
        $inspector = $this->inspector($request, $server, $db, 'database.read');

        return $this->run(fn () => new JsonResponse($inspector->structure($inspector->table($table))));
    }

    public function insert(Request $request, Server $server, int $db, string $table): JsonResponse
    {
        $inspector = $this->inspector($request, $server, $db, 'database.update');
        $data = $request->validate(['values' => ['present', 'array']]);

        return $this->run(function () use ($inspector, $table, $data, $server) {
            $count = $inspector->insert($inspector->table($table), $data['values']);
            $this->log($server, 'row.insert', $table);

            return new JsonResponse(['affected' => $count, 'id' => $inspector->pdo()->lastInsertId()]);
        });
    }

    public function update(Request $request, Server $server, int $db, string $table): JsonResponse
    {
        $inspector = $this->inspector($request, $server, $db, 'database.update');
        $data = $request->validate(['key' => ['required', 'array'], 'values' => ['required', 'array']]);

        return $this->run(function () use ($inspector, $table, $data, $server) {
            $count = $inspector->update($inspector->table($table), $data['key'], $data['values']);
            $this->log($server, 'row.update', $table);

            return new JsonResponse(['affected' => $count]);
        });
    }

    public function delete(Request $request, Server $server, int $db, string $table): JsonResponse
    {
        $inspector = $this->inspector($request, $server, $db, 'database.update');
        $data = $request->validate(['keys' => ['required', 'array', 'min:1', 'max:1000'], 'keys.*' => ['array']]);

        return $this->run(function () use ($inspector, $table, $data, $server) {
            $count = $inspector->delete($inspector->table($table), $data['keys']);
            $this->log($server, 'row.delete', $table, ['rows' => $count]);

            return new JsonResponse(['affected' => $count]);
        });
    }

    /** Removes every row; the table stays. */
    public function empty(Request $request, Server $server, int $db, string $table): JsonResponse
    {
        $inspector = $this->inspector($request, $server, $db, 'database.delete');

        return $this->run(function () use ($inspector, $table, $server) {
            $name = $inspector->table($table);
            $inspector->pdo()->exec('SET FOREIGN_KEY_CHECKS = 0');
            $inspector->pdo()->exec('TRUNCATE TABLE '.Connection::quote($name));
            $this->log($server, 'table.empty', $name);

            return new JsonResponse(['emptied' => true]);
        });
    }

    public function drop(Request $request, Server $server, int $db, string $table): JsonResponse
    {
        $inspector = $this->inspector($request, $server, $db, 'database.delete');

        return $this->run(function () use ($inspector, $table, $server) {
            $name = $inspector->table($table);
            $view = collect($inspector->tables())->firstWhere('name', $name)['type'] === 'view';
            $inspector->pdo()->exec('SET FOREIGN_KEY_CHECKS = 0');
            $inspector->pdo()->exec(($view ? 'DROP VIEW ' : 'DROP TABLE ').Connection::quote($name));
            $this->log($server, 'table.drop', $name);

            return new JsonResponse(['dropped' => true]);
        });
    }

    private function inspector(Request $request, Server $server, int $db, string $permission): Inspector
    {
        $model = Access::find($request, $server, $db, $permission);

        try {
            return Inspector::for($model, Settings::int('sql_timeout', 15));
        } catch (RuntimeException $exception) {
            abort(502, $exception->getMessage());
        }
    }

    /** Database errors become a readable 422 rather than a server error. */
    private function run(callable $action): JsonResponse
    {
        try {
            return $action();
        } catch (PDOException $exception) {
            abort(422, preg_replace('/^SQLSTATE\[\w+\]: [^:]+: \d+ /', '', $exception->getMessage()));
        }
    }

    private function log(Server $server, string $event, string $table, array $properties = []): void
    {
        Activity::event('server:prism-database.'.$event)->property(['table' => $table, ...$properties])->log();
    }
}
