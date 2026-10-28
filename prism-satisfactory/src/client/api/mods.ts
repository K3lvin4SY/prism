import { http } from '@pterodactyl/sdk';
import { base } from './client';

export type SortOrder = 'popular' | 'downloads' | 'trending' | 'updated' | 'name';

/** A mod from ficsit.app. */
export interface ModHit {
    /** The mod reference, such as RefinedPower; the same as `name`. */
    id: string;
    name: string;
    title: string;
    summary: string;
    author: string | null;
    icon: string | null;
    url: string;
    downloads: number;
    /** unix seconds of its newest version */
    updated: number;
    tags: string[];
    /** The newest version with a Linux server build for this game build, if any. */
    version: string | null;
    /** Whether it has a Linux server build at all. */
    linux: boolean;
    installed?: boolean;
}

export interface ModDetails extends ModHit {
    body: string;
    /** Its newest version, for any platform or game build. */
    latest: string | null;
}

export interface SearchParams {
    query: string;
    sort: SortOrder;
    page: number;
    limit: number;
}

export interface SearchResult {
    total: number;
    hits: ModHit[];
}

export interface Meta {
    sorts: SortOrder[];
    changelist: number | null;
}

export interface InstalledMod {
    name: string;
    title: string;
    icon: string | null;
    url: string | null;
    version: string | null;
    /** Installed from ficsit.app by Prism Satisfactory. */
    repository: boolean;
    dependency: boolean;
    enabled: boolean;
    /** Recorded, but its folder is gone. */
    missing: boolean;
    /** Whether the folder has its .uplugin, without which the game ignores it. */
    plugin: boolean;
}

export interface ModsState {
    mods: InstalledMod[];
    changelist: number | null;
    /** Whether the Satisfactory Mod Loader is installed and on; every mod needs it. */
    loader: boolean;
    running: boolean;
    job: string | null;
    confirmInstalls: boolean;
}

export const modKeys = {
    meta: (server: string) => ['prism-satisfactory', server, 'mods', 'meta'] as const,
    search: (server: string, params: SearchParams) => ['prism-satisfactory', server, 'mods', 'search', params] as const,
    item: (server: string, id: string) => ['prism-satisfactory', server, 'mods', 'item', id] as const,
    updates: (server: string) => ['prism-satisfactory', server, 'mods', 'updates'] as const,
};

export async function getMods(server: string): Promise<ModsState> {
    return (await http.get<ModsState>(`${base(server)}/mods`)).data;
}

export async function getMeta(server: string): Promise<Meta> {
    return (await http.get<Meta>(`${base(server)}/mods/meta`)).data;
}

export async function search(server: string, params: SearchParams): Promise<SearchResult> {
    const { data } = await http.get<SearchResult>(`${base(server)}/mods/search`, {
        params: { query: params.query || undefined, sort: params.sort, page: params.page, limit: params.limit },
    });

    return data;
}

export async function getMod(server: string, id: string): Promise<{ mod: ModDetails; dependencies: { id: string; title: string; icon: string | null; installed: boolean }[]; problems: string[]; changelist: number | null }> {
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
