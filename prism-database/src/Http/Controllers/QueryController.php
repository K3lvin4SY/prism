<?php

declare(strict_types=1);

namespace PrismDatabase\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PDO;
use PDOException;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use PrismDatabase\Support\Access;
use PrismDatabase\Support\Connection;
use PrismDatabase\Support\Settings;
use PrismDatabase\Support\SqlSplitter;
use RuntimeException;

/**
 * The SQL console. Queries run as the database's own user, with a time limit and a cap on the
 * rows sent back. In read-only mode only reading statements run, inside a read-only transaction.
 */
class QueryController
{
    private const string READING = '/^\s*(\(\s*)?(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH|HELP|CHECKSUM)\b/i';

    public function run(Request $request, Server $server, int $db): JsonResponse
    {
        abort_unless(Settings::bool('sql_console', true), 403, 'The SQL console is turned off.');
        $readOnly = Settings::bool('sql_read_only', false) || ! $request->user()->can('database.update', $server);
        $model = Access::find($request, $server, $db, 'database.read');
        $data = $request->validate(['sql' => ['required', 'string', 'max:200000']]);

        $statements = array_column((new SqlSplitter())->feed($data['sql'], true), 'sql');
        abort_if($statements === [], 422, 'There is no query to run.');
        abort_if(count($statements) > 50, 422, 'Run at most 50 statements at a time.');
        if ($readOnly) {
            foreach ($statements as $statement) {
                abort_unless(preg_match(self::READING, $statement) === 1, 403, 'The SQL console is read only here, so only SELECT, SHOW, DESCRIBE, EXPLAIN and WITH queries run.');
            }
        }

        try {
            $pdo = Connection::open($model, Settings::int('sql_timeout', 15), $readOnly);
        } catch (RuntimeException $exception) {
            abort(502, $exception->getMessage());
        }

        $maxRows = Settings::int('sql_max_rows', 1000);
        $results = [];
        if ($readOnly) {
            $pdo->exec('START TRANSACTION READ ONLY');
        }

        foreach ($statements as $index => $sql) {
            $started = microtime(true);
            try {
                $statement = $pdo->query($sql);
                $columns = [];
                $rows = [];
                $truncated = false;
                if ($statement->columnCount() > 0) {
                    for ($i = 0; $i < $statement->columnCount(); $i++) {
                        $columns[] = (string) ($statement->getColumnMeta($i)['name'] ?? 'column'.$i);
                    }

                    while (($row = $statement->fetch(PDO::FETCH_NUM)) !== false) {
                        if (count($rows) >= $maxRows) {
                            $truncated = true;

                            break;
                        }

                        $rows[] = array_map(static fn ($value) => is_string($value) && ! mb_check_encoding($value, 'UTF-8') ? '0x'.bin2hex(substr($value, 0, 64)) : $value, $row);
                    }
                }

                $results[] = [
                    'sql' => $sql,
                    'columns' => $columns,
                    'rows' => $rows,
                    'truncated' => $truncated,
                    'affected' => $statement->columnCount() === 0 ? $statement->rowCount() : null,
                    'ms' => (int) round((microtime(true) - $started) * 1000),
                    'error' => null,
                ];
            } catch (PDOException $exception) {
                $results[] = ['sql' => $sql, 'columns' => [], 'rows' => [], 'truncated' => false, 'affected' => null, 'ms' => (int) round((microtime(true) - $started) * 1000), 'error' => preg_replace('/^SQLSTATE\[\w+\]: [^:]+: \d+ /', '', $exception->getMessage())];

                // The statements after a failed one do not run.
                break;
            }
        }

        if ($readOnly) {
            $pdo->exec('ROLLBACK');
        }

        Activity::event('server:prism-database.query')->property(['database' => $model->database, 'statements' => count($results), 'sql' => mb_substr($data['sql'], 0, 500)])->log();

        return new JsonResponse(['results' => $results, 'readOnly' => $readOnly]);
    }
}
