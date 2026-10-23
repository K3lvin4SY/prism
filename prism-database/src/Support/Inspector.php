<?php

declare(strict_types=1);

namespace PrismDatabase\Support;

use PDO;
use Pterodactyl\Models\Database;

/**
 * Reads a database's tables, columns and rows as its own user, and writes rows with bound
 * values. Table and column names are checked against information_schema before use.
 */
final class Inspector
{
    public function __construct(private readonly PDO $pdo, private readonly string $schema) {}

    public static function for(Database $database, int $timeout = 15): self
    {
        return new self(Connection::open($database, $timeout), (string) $database->database);
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }

    /** @return list<array{name: string, rows: int, size: int, engine: string|null, collation: string|null, comment: string, type: string}> */
    public function tables(): array
    {
        $statement = $this->pdo->prepare('SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH + INDEX_LENGTH AS SIZE, ENGINE, TABLE_COLLATION, TABLE_COMMENT, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME');
        $statement->execute([$this->schema]);

        return array_map(static fn (array $row): array => [
            'name' => (string) $row['TABLE_NAME'],
            'rows' => (int) $row['TABLE_ROWS'],
            'size' => (int) $row['SIZE'],
            'engine' => $row['ENGINE'],
            'collation' => $row['TABLE_COLLATION'],
            'comment' => (string) $row['TABLE_COMMENT'],
            'type' => $row['TABLE_TYPE'] === 'VIEW' ? 'view' : 'table',
        ], $statement->fetchAll());
    }

    /** Stops the request unless the table exists in this database. */
    public function table(string $name): string
    {
        $statement = $this->pdo->prepare('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?');
        $statement->execute([$this->schema, $name]);
        abort_if($statement->fetchColumn() === false, 404, 'That table was not found.');

        return $name;
    }

    /** @return list<array{name: string, type: string, nullable: bool, key: string, default: mixed, extra: string, comment: string, numeric: bool, binary: bool}> */
    public function columns(string $table): array
    {
        $statement = $this->pdo->prepare('SELECT COLUMN_NAME, COLUMN_TYPE, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA, COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION');
        $statement->execute([$this->schema, $table]);

        return array_map(static fn (array $row): array => [
            'name' => (string) $row['COLUMN_NAME'],
            'type' => (string) $row['COLUMN_TYPE'],
            'nullable' => $row['IS_NULLABLE'] === 'YES',
            'key' => (string) $row['COLUMN_KEY'],
            'default' => $row['COLUMN_DEFAULT'],
            'extra' => (string) $row['EXTRA'],
            'comment' => (string) $row['COLUMN_COMMENT'],
            'numeric' => in_array(strtolower((string) $row['DATA_TYPE']), ['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint', 'decimal', 'float', 'double', 'bit'], true),
            'binary' => in_array(strtolower((string) $row['DATA_TYPE']), ['binary', 'varbinary', 'blob', 'tinyblob', 'mediumblob', 'longblob', 'geometry', 'point'], true),
        ], $statement->fetchAll());
    }

    /** @return list<string> the primary key's columns, or none */
    public function primaryKey(string $table): array
    {
        $statement = $this->pdo->prepare("SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION");
        $statement->execute([$this->schema, $table]);

        return array_map('strval', $statement->fetchAll(PDO::FETCH_COLUMN));
    }

    /**
     * One page of rows.
     *
     * @return array{columns: list<array<string, mixed>>, primaryKey: list<string>, rows: list<array<string, mixed>>, total: int}
     */
    public function rows(string $table, int $page, int $perPage, ?string $sort, string $direction, string $search, ?string $searchColumn): array
    {
        $columns = $this->columns($table);
        $names = array_column($columns, 'name');
        $where = '';
        $bindings = [];

        if ($search !== '') {
            $targets = $searchColumn !== null && in_array($searchColumn, $names, true) ? [$searchColumn] : array_column(array_filter($columns, static fn (array $column): bool => ! $column['binary']), 'name');
            if ($targets !== []) {
                $where = ' WHERE '.implode(' OR ', array_map(static fn (string $name): string => 'CAST('.Connection::quote($name).' AS CHAR) LIKE ?', $targets));
                $bindings = array_fill(0, count($targets), '%'.addcslashes($search, '%_\\').'%');
            }
        }

        $order = $sort !== null && in_array($sort, $names, true) ? ' ORDER BY '.Connection::quote($sort).(strtolower($direction) === 'desc' ? ' DESC' : ' ASC') : '';
        $quoted = Connection::quote($table);

        $count = $this->pdo->prepare("SELECT COUNT(*) FROM $quoted$where");
        $count->execute($bindings);

        $statement = $this->pdo->prepare(sprintf('SELECT * FROM %s%s%s LIMIT %d OFFSET %d', $quoted, $where, $order, $perPage, max(0, ($page - 1) * $perPage)));
        $statement->execute($bindings);
        $binary = array_column(array_filter($columns, static fn (array $column): bool => $column['binary']), 'name');

        $rows = array_map(static function (array $row) use ($binary): array {
            foreach ($row as $key => $value) {
                if (in_array($key, $binary, true) && $value !== null) {
                    $row[$key] = ['binary' => strlen((string) $value), 'hex' => bin2hex(substr((string) $value, 0, 32))];
                } elseif (is_string($value) && ! mb_check_encoding($value, 'UTF-8')) {
                    $row[$key] = ['binary' => strlen($value), 'hex' => bin2hex(substr($value, 0, 32))];
                }
            }

            return $row;
        }, $statement->fetchAll());

        return ['columns' => $columns, 'primaryKey' => $this->primaryKey($table), 'rows' => $rows, 'total' => (int) $count->fetchColumn()];
    }

    /** @return array{columns: list<array<string, mixed>>, indexes: list<array<string, mixed>>, create: string} */
    public function structure(string $table): array
    {
        $indexes = [];
        foreach ($this->pdo->query('SHOW INDEX FROM '.Connection::quote($table))->fetchAll() as $row) {
            $name = (string) $row['Key_name'];
            $indexes[$name] ??= ['name' => $name, 'unique' => (int) $row['Non_unique'] === 0, 'type' => (string) ($row['Index_type'] ?? ''), 'columns' => []];
            $indexes[$name]['columns'][] = (string) $row['Column_name'];
        }

        $create = $this->pdo->query('SHOW CREATE TABLE '.Connection::quote($table))->fetch(PDO::FETCH_NUM);

        return ['columns' => $this->columns($table), 'indexes' => array_values($indexes), 'create' => (string) ($create[1] ?? '')];
    }

    /**
     * The WHERE clause that finds one row: by primary key, or by every column when the table
     * has none. NULL compares with IS NULL.
     *
     * @param  array<string, mixed>  $key
     * @return array{0: string, 1: list<mixed>}
     */
    private function match(string $table, array $key): array
    {
        $names = array_column($this->columns($table), 'name');
        $primary = $this->primaryKey($table);
        $use = $primary !== [] ? $primary : array_keys($key);
        abort_if($use === [], 422, 'The row could not be identified.');

        $parts = [];
        $bindings = [];
        foreach ($use as $column) {
            abort_unless(in_array($column, $names, true) && array_key_exists($column, $key), 422, 'The row could not be identified.');
            // Binary values reach the browser only as a preview, so they cannot be matched.
            if (is_array($key[$column])) {
                abort_if($primary !== [], 422, 'A row with a binary key cannot be changed here.');

                continue;
            }

            if ($key[$column] === null) {
                $parts[] = Connection::quote($column).' IS NULL';
            } else {
                $parts[] = Connection::quote($column).' = ?';
                $bindings[] = $key[$column];
            }
        }

        return [implode(' AND ', $parts), $bindings];
    }

    /** @param array<string, mixed> $values */
    public function insert(string $table, array $values): int
    {
        $names = array_column($this->columns($table), 'name');
        $values = array_intersect_key($values, array_flip($names));
        if ($values === []) {
            $this->pdo->exec('INSERT INTO '.Connection::quote($table).' () VALUES ()');

            return 1;
        }

        $statement = $this->pdo->prepare(sprintf(
            'INSERT INTO %s (%s) VALUES (%s)',
            Connection::quote($table),
            implode(', ', array_map(Connection::quote(...), array_keys($values))),
            implode(', ', array_fill(0, count($values), '?')),
        ));
        $statement->execute(array_values($values));

        return $statement->rowCount();
    }

    /**
     * @param  array<string, mixed>  $key
     * @param  array<string, mixed>  $values
     */
    public function update(string $table, array $key, array $values): int
    {
        $names = array_column($this->columns($table), 'name');
        $values = array_filter(array_intersect_key($values, array_flip($names)), static fn ($value): bool => ! is_array($value));
        abort_if($values === [], 422, 'Nothing to change.');
        [$where, $bindings] = $this->match($table, $key);
        $primary = $this->primaryKey($table);

        $statement = $this->pdo->prepare(sprintf(
            'UPDATE %s SET %s WHERE %s%s',
            Connection::quote($table),
            implode(', ', array_map(static fn (string $name): string => Connection::quote($name).' = ?', array_keys($values))),
            $where,
            $primary === [] ? ' LIMIT 1' : '',
        ));
        $statement->execute([...array_values($values), ...$bindings]);

        return $statement->rowCount();
    }

    /** @param list<array<string, mixed>> $keys */
    public function delete(string $table, array $keys): int
    {
        $deleted = 0;
        $limit = $this->primaryKey($table) === [] ? ' LIMIT 1' : '';
        foreach ($keys as $key) {
            [$where, $bindings] = $this->match($table, $key);
            $statement = $this->pdo->prepare(sprintf('DELETE FROM %s WHERE %s%s', Connection::quote($table), $where, $limit));
            $statement->execute($bindings);
            $deleted += $statement->rowCount();
        }

        return $deleted;
    }

    /** @return array{size: int, rows: int, tables: int} */
    public function totals(): array
    {
        $statement = $this->pdo->prepare("SELECT COALESCE(SUM(DATA_LENGTH + INDEX_LENGTH), 0) AS size, COALESCE(SUM(TABLE_ROWS), 0) AS rows_estimate, COUNT(*) AS tables FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'");
        $statement->execute([$this->schema]);
        $row = $statement->fetch();

        return ['size' => (int) $row['size'], 'rows' => (int) $row['rows_estimate'], 'tables' => (int) $row['tables']];
    }

    /** @return list<array{id: int, host: string, command: string, time: int, state: string|null, info: string|null}> */
    public function processes(): array
    {
        try {
            $rows = $this->pdo->query('SHOW PROCESSLIST')->fetchAll();
        } catch (\PDOException) {
            return [];
        }

        $own = (int) $this->pdo->query('SELECT CONNECTION_ID()')->fetchColumn();

        return array_values(array_map(static fn (array $row): array => [
            'id' => (int) $row['Id'],
            'host' => (string) $row['Host'],
            'command' => (string) $row['Command'],
            'time' => (int) $row['Time'],
            'state' => $row['State'] ?? null,
            'info' => isset($row['Info']) ? mb_substr((string) $row['Info'], 0, 200) : null,
        ], array_filter($rows, static fn (array $row): bool => (int) $row['Id'] !== $own)));
    }

    /** @return array{version: string, comment: string} */
    public function version(): array
    {
        $row = $this->pdo->query('SELECT VERSION() AS version, @@version_comment AS comment')->fetch();

        return ['version' => (string) $row['version'], 'comment' => (string) $row['comment']];
    }
}
