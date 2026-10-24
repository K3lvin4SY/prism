import { useSyncExternalStore } from 'react';

/** A server on the dashboard's page, as the sidebar's overview and filters need it. */
export interface DashboardServer {
    identifier: string;
    name: string;
    /** running, starting, stopping or offline; null while unknown. */
    power: string | null;
    tags: readonly string[];
    cpu: number;
    memory: number;
    memoryLimit: number;
    disk: number;
    diskLimit: number;
}

export interface Filters {
    status: 'all' | 'online' | 'offline';
    game: string | null;
    name: string;
}

export const NO_FILTERS: Filters = { status: 'all', game: null, name: '' };

interface State {
    servers: readonly DashboardServer[];
    /** The list has more pages than the one shown, so filters only see this one. */
    paged: boolean;
    filters: Filters;
}

/*
 * The server list publishes its servers here and the sidebar its filters, so the two stay in step
 * although the panel draws them apart.
 */
let state: State = { servers: [], paged: false, filters: NO_FILTERS };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => listeners.delete(listener);
};
const update = (next: Partial<State>) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
};

export const useDashboard = (): State => useSyncExternalStore(subscribe, () => state, () => state);

export function publishServers(servers: readonly DashboardServer[], paged: boolean): void {
    const same = servers.length === state.servers.length && servers.every((server, index) => JSON.stringify(server) === JSON.stringify(state.servers[index]));
    if (!same || paged !== state.paged) update({ servers, paged });
}

export const setFilters = (filters: Partial<Filters>) => update({ filters: { ...state.filters, ...filters } });

export const filtering = (filters: Filters) => filters.status !== 'all' || filters.game !== null || filters.name.trim() !== '';

/** Whether a server shows with these filters. Starting and stopping count as online. */
export function matches(server: Pick<DashboardServer, 'name' | 'power' | 'tags'>, filters: Filters): boolean {
    const online = server.power !== null && server.power !== 'offline';
    if (filters.status === 'online' && !online) return false;
    if (filters.status === 'offline' && (online || server.power === null)) return false;
    if (filters.game !== null && !server.tags.includes(filters.game)) return false;
    const name = filters.name.trim().toLowerCase();

    return name === '' || server.name.toLowerCase().includes(name);
}

/** The tag that names a server's game: its own, rather than a shared one like minecraft. */
export const gameTag = (tags: readonly string[] | undefined): string | null => tags?.find((tag) => tag !== 'minecraft' || tags.length === 1) ?? tags?.[0] ?? null;

const RECENT = 'prism-layout:recent';

export interface RecentServer {
    identifier: string;
    name: string;
}

export function readRecent(): RecentServer[] {
    try {
        const list = JSON.parse(window.localStorage.getItem(RECENT) ?? '[]') as unknown;

        return Array.isArray(list) ? list.filter((item): item is RecentServer => typeof item?.identifier === 'string' && typeof item?.name === 'string').slice(0, 5) : [];
    } catch {
        return [];
    }
}

/** Puts the server first in this browser's recent servers, keeping five. */
export function remember(server: RecentServer): void {
    const list = [server, ...readRecent().filter((item) => item.identifier !== server.identifier)].slice(0, 5);
    try {
        window.localStorage.setItem(RECENT, JSON.stringify(list));
    } catch {
        // Not remembered when storage is blocked.
    }
}
