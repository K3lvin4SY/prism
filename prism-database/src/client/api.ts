import { http } from '@pterodactyl/sdk';

export interface PrismDatabase {
    id: number;
    name: string;
    username: string;
    host: string | null;
    port: number | null;
    hostName: string | null;
    remote: string;
    maxConnections: number | null;
    own: boolean;
    owner: { identifier: string | null; name: string | null };
    sharedWith: { identifier: string; name: string }[];
}

export interface Overview {
    database: PrismDatabase;
    totals: { size: number; rows: number; tables: number } | null;
    version: { version: string; comment: string } | null;
    processes: { id: number; host: string; command: string; time: number; state: string | null; info: string | null }[];
    error: string | null;
    password: string | null;
    history: { size: number; rows: number; tables: number; at: string }[];
}

export interface Table {
    name: string;
    rows: number;
    size: number;
    engine: string | null;
    collation: string | null;
    comment: string;
    type: 'table' | 'view';
}

export interface Column {
    name: string;
    type: string;
    nullable: boolean;
    key: string;
    default: unknown;
    extra: string;
    comment: string;
    numeric: boolean;
    binary: boolean;
}

export type Cell = string | number | boolean | null | { binary: number; hex: string };
export type Row = Record<string, Cell>;

export interface Rows {
    columns: Column[];
    primaryKey: string[];
    rows: Row[];
    total: number;
}

export interface Structure {
    columns: Column[];
    indexes: { name: string; unique: boolean; type: string; columns: string[] }[];
    create: string;
}

export interface QueryResult {
    sql: string;
    columns: string[];
    rows: Cell[][];
    truncated: boolean;
    affected: number | null;
    ms: number;
    error: string | null;
}

export interface DatabaseFile {
    id: number;
    type: 'backup' | 'export' | 'import' | 'restore';
    status: 'pending' | 'running' | 'done' | 'failed';
    label: string | null;
    automatic: boolean;
    locked: boolean;
    size: number;
    message: string | null;
    progress: number | null;
    statements: number;
    errors: number;
    downloadable: boolean;
    name: string | null;
    createdAt: string;
    finishedAt: string | null;
    expiresAt: string | null;
}

export interface Files {
    backups: DatabaseFile[];
    transfers: DatabaseFile[];
    storage: number;
    schedule: { enabled: boolean; interval: string; keep: number; nextAt: string | null };
}

const base = (server: string) => `/api/client/servers/${server}/extensions/prism-database`;
const db = (server: string, id: number) => `${base(server)}/databases/${id}`;
const table = (server: string, id: number, name: string) => `${db(server, id)}/tables/${encodeURIComponent(name)}`;

export const keys = {
    list: (server: string) => ['prism-database', server, 'list'] as const,
    overview: (server: string, id: number) => ['prism-database', server, id, 'overview'] as const,
    tables: (server: string, id: number) => ['prism-database', server, id, 'tables'] as const,
    rows: (server: string, id: number, name: string, params: object) => ['prism-database', server, id, 'rows', name, params] as const,
    structure: (server: string, id: number, name: string) => ['prism-database', server, id, 'structure', name] as const,
    files: (server: string, id: number) => ['prism-database', server, id, 'files'] as const,
    shares: (server: string, id: number) => ['prism-database', server, id, 'shares'] as const,
};

export const api = {
    list: async (server: string) => (await http.get<{ databases: PrismDatabase[]; config: Record<string, unknown> }>(`${base(server)}/databases`)).data,
    overview: async (server: string, id: number) => (await http.get<Overview>(`${db(server, id)}/overview`)).data,
    tables: async (server: string, id: number) => (await http.get<{ tables: Table[] }>(`${db(server, id)}/tables`)).data.tables,
    rows: async (server: string, id: number, name: string, params: { page: number; perPage: number; sort?: string; direction?: string; search?: string; column?: string }) =>
        (await http.get<Rows>(`${table(server, id, name)}/rows`, { params })).data,
    structure: async (server: string, id: number, name: string) => (await http.get<Structure>(`${table(server, id, name)}/structure`)).data,
    insert: (server: string, id: number, name: string, values: Row) => http.post(`${table(server, id, name)}/rows`, { values }),
    update: (server: string, id: number, name: string, key: Row, values: Row) => http.patch(`${table(server, id, name)}/rows`, { key, values }),
    remove: (server: string, id: number, name: string, keys: Row[]) => http.post(`${table(server, id, name)}/rows/delete`, { keys }),
    empty: (server: string, id: number, name: string) => http.post(`${table(server, id, name)}/empty`),
    drop: (server: string, id: number, name: string) => http.delete(table(server, id, name)),
    query: async (server: string, id: number, sql: string) => (await http.post<{ results: QueryResult[]; readOnly: boolean }>(`${db(server, id)}/query`, { sql }, { timeout: 330_000 })).data,
    files: async (server: string, id: number) => (await http.get<Files>(`${db(server, id)}/files`)).data,
    backup: (server: string, id: number, label: string) => http.post(`${db(server, id)}/backups`, { label: label || null }),
    lock: (server: string, id: number, file: number, locked: boolean) => http.post(`${db(server, id)}/files/${file}/lock`, { locked }),
    restore: (server: string, id: number, file: number) => http.post(`${db(server, id)}/files/${file}/restore`),
    deleteFile: (server: string, id: number, file: number) => http.delete(`${db(server, id)}/files/${file}`),
    schedule: (server: string, id: number, schedule: { enabled: boolean; interval: string; keep: number }) => http.put(`${db(server, id)}/schedule`, schedule),
    importUpload: (server: string, id: number, file: File, options: { emptyFirst: boolean; stopOnError: boolean }, onProgress: (fraction: number) => void) => {
        const form = new FormData();
        form.append('file', file);
        form.append('empty_first', options.emptyFirst ? '1' : '0');
        form.append('stop_on_error', options.stopOnError ? '1' : '0');

        return http.post(`${db(server, id)}/import`, form, { timeout: 0, onUploadProgress: (event: { loaded: number; total?: number }) => onProgress(event.total ? event.loaded / event.total : 0) });
    },
    importPath: (server: string, id: number, path: string, options: { emptyFirst: boolean; stopOnError: boolean }) => http.post(`${db(server, id)}/import`, { path, empty_first: options.emptyFirst, stop_on_error: options.stopOnError }),
    export: (server: string, id: number, destination: string | null) => http.post(`${db(server, id)}/export`, { destination }),
    download: async (server: string, id: number, file: DatabaseFile) => {
        const { data } = await http.get<Blob>(`${db(server, id)}/files/${file.id}/download`, { responseType: 'blob', timeout: 0 });
        const url = URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name ?? `backup-${file.id}.sql.gz`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
    shareCandidates: async (server: string, id: number) => (await http.get<{ servers: { identifier: string; name: string; shared: boolean }[] }>(`${db(server, id)}/shares`)).data.servers,
    share: (server: string, id: number, target: string) => http.post(`${db(server, id)}/shares`, { server: target }),
    unshare: (server: string, id: number, target: string) => http.delete(`${db(server, id)}/shares/${target}`),
};

/** "Connect with" snippets for the database. */
export function snippets(database: Pick<PrismDatabase, 'host' | 'port' | 'username' | 'name'>, password: string | null): Record<'CLI' | 'URI' | 'JDBC' | '.env', string> {
    const host = database.host ?? 'localhost';
    const port = database.port ?? 3306;
    const secret = password ?? '<password>';

    return {
        CLI: `mysql -h ${host} -P ${port} -u ${database.username} -p ${database.name}`,
        URI: `mysql://${encodeURIComponent(database.username)}:${encodeURIComponent(secret)}@${host}:${port}/${database.name}`,
        JDBC: `jdbc:mysql://${host}:${port}/${database.name}?user=${encodeURIComponent(database.username)}&password=${encodeURIComponent(secret)}`,
        '.env': `DB_HOST=${host}\nDB_PORT=${port}\nDB_DATABASE=${database.name}\nDB_USERNAME=${database.username}\nDB_PASSWORD=${secret}`,
    };
}

export function cellText(cell: Cell): string {
    if (cell === null) return 'NULL';
    if (typeof cell === 'object') return `(binary, ${cell.binary} bytes) 0x${cell.hex}${cell.binary > 32 ? '…' : ''}`;

    return String(cell);
}
