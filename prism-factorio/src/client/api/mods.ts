import { http } from '@pterodactyl/sdk';
import { base } from './client';

export type SortOrder = 'popular' | 'downloads' | 'rating' | 'updated' | 'name';

/** A mod from the Factorio mod portal. */
export interface ModHit {
    /** The portal name, such as even-distribution; the same as `name`. */
    id: string;
    name: string;
    title: string;
    summary: string;
    author: string | null;
    icon: string | null;
    url: string;
    downloads: number;
    score: number;
    category: string;
    /** The newest release for the server's game version. */
    version: string | null;
    factorioVersion: string | null;
    /** unix seconds of that release */
    updated: number;
    installed?: boolean;
}

export interface ModDetails extends ModHit {
    body: string;
    /** The game versions it has releases for. */
    versions: string[];
    /** Whether that release needs the Space Age expansion. */
    expansion: boolean;
    dependencies: string[];
    incompatible: string[];
}

export interface SearchParams {
    query: string;
    sort: SortOrder;
    categories: string[];
    page: number;
    limit: number;
}

export interface SearchResult {
    total: number;
    hits: ModHit[];
}

export interface Meta {
    /** category id => label */
    categories: Record<string, string>;
    sorts: SortOrder[];
    factorioVersion: string | null;
}

export interface InstalledMod {
    name: string;
    title: string;
    icon: string | null;
    url: string | null;
    version: string | null;
    /** One of the expansion's mods, which come with the game. */
    builtIn: boolean;
    /** Installed from the portal by Prism Factorio. */
    portal: boolean;
    dependency: boolean;
    enabled: boolean;
    /** Recorded, but its file is gone from the mods folder. */
    missing: boolean;
    files: string[];
}

export interface ModsState {
    mods: InstalledMod[];
    factorioVersion: string | null;
    /** The factorio.com account downloads use, and where it was found. */
    account: { username: string; from: 'server' | 'variables' | 'admin' } | null;
    running: boolean;
    job: string | null;
    confirmInstalls: boolean;
}

export const modKeys = {
    meta: (server: string) => ['prism-factorio', server, 'mods', 'meta'] as const,
    search: (server: string, params: SearchParams) => ['prism-factorio', server, 'mods', 'search', params] as const,
    item: (server: string, id: string) => ['prism-factorio', server, 'mods', 'item', id] as const,
    updates: (server: string) => ['prism-factorio', server, 'mods', 'updates'] as const,
};

export async function getMods(server: string): Promise<ModsState> {
    return (await http.get<ModsState>(`${base(server)}/mods`)).data;
}

export async function getMeta(server: string): Promise<Meta> {
    return (await http.get<Meta>(`${base(server)}/mods/meta`)).data;
}

export async function search(server: string, params: SearchParams): Promise<SearchResult> {
    const { data } = await http.get<SearchResult>(`${base(server)}/mods/search`, {
        params: { query: params.query || undefined, sort: params.sort, categories: params.categories, page: params.page, limit: params.limit },
    });

    return data;
}

export async function getMod(server: string, id: string): Promise<{ mod: ModDetails; dependencies: { id: string; title: string; icon: string | null; installed: boolean }[]; conflicts: string[]; factorioVersion: string }> {
    return (await http.get(`${base(server)}/mods/item/${encodeURIComponent(id)}`)).data;
}

export async function install(server: string, ids: string[], restart: boolean): Promise<{ job: string; added: string[]; restarting: boolean }> {
    return (await http.post(`${base(server)}/mods/install`, { ids, restart })).data;
}

export async function getUpdates(server: string): Promise<Record<string, string>> {
    return (await http.get<{ updates: Record<string, string> }>(`${base(server)}/mods/updates`)).data.updates;
}

export async function toggle(server: string, name: string, enabled: boolean): Promise<void> {
    await http.post(`${base(server)}/mods/toggle`, { name, enabled });
}

export async function remove(server: string, name: string): Promise<void> {
    await http.post(`${base(server)}/mods/remove`, { name });
}

/** Where the factorio.com account for downloads comes from, in words. */
export function accountSource(from: 'server' | 'variables' | 'admin'): string {
    return { server: 'this server’s settings', variables: 'this server’s startup variables', admin: 'Prism Properties' }[from];
}
