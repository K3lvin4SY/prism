/** The guest page's calls. The token goes in a header on each one, never in an address. */

export type ShareOption = 'console' | 'command' | 'start' | 'stop' | 'restart' | 'files' | 'backups';

export interface Info {
    server: string;
    options: ShareOption[];
    expires_at: string;
}

export interface Entry {
    name: string;
    path: string;
    directory: boolean;
    size: number;
    modified: string | null;
}

export interface Backup {
    uuid: string;
    name: string;
    size: number;
    completed_at: string | null;
}

/** An answer the panel refused, with its message for the person. */
export class ShareError extends Error {
    constructor(
        public readonly status: number,
        message: string
    ) {
        super(message);
    }
}

/** Takes the token from the address's fragment once and clears it, so it is not left on screen or in history. */
export function takeToken(location: Pick<Location, 'hash' | 'pathname' | 'search'>, history: Pick<History, 'replaceState'>): string | null {
    const token = location.hash.replace(/^#/, '');
    if (location.hash !== '') history.replaceState(null, '', location.pathname + location.search);

    return /^[A-Za-z0-9]{48}$/.test(token) ? token : null;
}

function xsrf(): string {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);

    return match ? decodeURIComponent(match[1]) : '';
}

export function client(token: string) {
    async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
        const response = await fetch(`/share/api${path}`, {
            method,
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
                'X-Prism-Share': token,
                ...(method === 'POST' ? { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf() } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (response.status === 204) return undefined as T;

        const json = (await response.json().catch(() => null)) as { data?: T; message?: string; errors?: { detail?: string }[] } | null;
        if (!response.ok) {
            const message = json?.errors?.[0]?.detail ?? json?.message ?? 'Something went wrong. Please try again.';
            throw new ShareError(response.status, message);
        }

        return json?.data as T;
    }

    return {
        info: () => call<Info>('GET', '/info'),
        websocket: () => call<{ token: string; socket: string }>('GET', '/websocket'),
        command: (command: string) => call<void>('POST', '/command', { command }),
        power: (signal: 'start' | 'stop' | 'restart') => call<void>('POST', '/power', { signal }),
        files: (directory: string | null) => call<{ directory: string | null; entries: Entry[] }>('GET', `/files${directory ? `?directory=${encodeURIComponent(directory)}` : ''}`),
        download: (file: string) => call<{ url: string }>('GET', `/files/download?file=${encodeURIComponent(file)}`),
        backups: () => call<Backup[]>('GET', '/backups'),
        backupDownload: (uuid: string) => call<{ url: string }>('GET', `/backups/${encodeURIComponent(uuid)}/download`),
    };
}

export type Client = ReturnType<typeof client>;

/** A link has ended for good when the panel no longer knows it or it allows nothing. */
export const ended = (error: unknown) => error instanceof ShareError && (error.status === 404 || error.status === 403 || error.status === 429);

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KiB', 'MiB', 'GiB', 'TiB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }

    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
