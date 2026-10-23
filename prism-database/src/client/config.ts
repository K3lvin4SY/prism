import type { ExtensionConfig } from '@pterodactyl/sdk';

export interface DatabaseConfig {
    enabled: boolean;
    usageHistory: boolean;
    rowsPerPage: number;
    sqlConsole: boolean;
    sqlReadOnly: boolean;
    importMaxBytes: number;
    exportKeepHours: number;
    backups: boolean;
    backupFastest: string;
    backupMaxKeep: number;
    sharing: boolean;
}

let config: DatabaseConfig = read({});

function read(raw: ExtensionConfig): DatabaseConfig {
    const get = (key: string) => (raw as Record<string, unknown>)[key];
    const bool = (key: string, fallback: boolean) => (typeof get(key) === 'boolean' ? (get(key) as boolean) : fallback);
    const num = (key: string, fallback: number) => Number(get(key)) || fallback;

    return {
        enabled: bool('enabled', true),
        usageHistory: bool('usage_history', true),
        rowsPerPage: num('max_rows_page', 100),
        sqlConsole: bool('sql_console', true),
        sqlReadOnly: bool('sql_read_only', false),
        importMaxBytes: num('import_max_mb', 100) * 1048576,
        exportKeepHours: num('export_keep_hours', 24),
        backups: bool('backups', true),
        backupFastest: String(get('backup_fastest') ?? 'hourly'),
        backupMaxKeep: num('backup_max_keep', 20),
        sharing: bool('sharing', true),
    };
}

export function setConfig(raw: ExtensionConfig): void {
    config = read(raw);
}

let applied: unknown = null;

/** Takes the admin's current settings from the backend, so changes show without a reload. */
export function applyConfig(raw: unknown): void {
    if (!raw || raw === applied || typeof raw !== 'object' || Array.isArray(raw)) return;
    applied = raw;
    config = read(raw as ExtensionConfig);
}

export function getConfig(): DatabaseConfig {
    return config;
}
