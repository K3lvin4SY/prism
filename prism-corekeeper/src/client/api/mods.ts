import { http } from '@pterodactyl/sdk';
import { base } from './client';

export type SourceName = 'modio' | 'steam';

export type SortOrder = 'popular' | 'downloads' | 'rating' | 'newest' | 'updated';

/** A mod from mod.io or the Steam Workshop, in the shape both share. */
export interface ModHit {
    id: string;
    source: SourceName;
    sourceId: string;
    title: string;
    summary: string;
    author: string | null;
    icon: string | null;
    url: string;
    downloads: number;
    score: number | null;
    size: number;
    created: number;
    updated: number;
    categories: string[];
    sides: string[];
    gameVersions: string[];
    dependencies: string[];
    version: string | null;
    installed?: boolean;
    /** The same mod on the other source, when both have it. */
    alsoOn?: { source: SourceName; id: string; url: string };
    body?: string;
    screenshots?: string[];
}

export interface SearchParams {
    sources: SourceName[];
    query: string;
    sort: SortOrder;
    categories: string[];
    sides: string[];
    gameVersion: string | null;
    page: number;
    limit: number;
}

export interface SearchResult {
    total: number;
    hits: ModHit[];
    /** Sources that could not be asked, with why. */
    errors: Partial<Record<SourceName, string>>;
}

export interface Meta {
    categories: string[];
    sides: string[];
    sorts: SortOrder[];
    gameVersions: string[];
}

export interface InstalledMod {
    id: string | null;
    source: SourceName | null;
    title: string;
    icon: string | null;
    url: string | null;
    version: string | null;
    updated: number | null;
    dependency: boolean;
    folder: string | null;
    pending: boolean;
    missing: boolean;
    enabled: boolean;
    guid: string | null;
    /** From ModManifest.json: 1 client, 2 server, 3 both. */
    requiredOn: number | null;
    linux: boolean;
    manifest: boolean;
}

export interface ModsState {
    mods: InstalledMod[];
    sources: Record<SourceName, boolean>;
    steamLogin: boolean;
    hookMissing: boolean;
    running: boolean;
    job: string | null;
    confirmInstalls: boolean;
    folder: string;
}

export const modKeys = {
    meta: (server: string) => ['prism-corekeeper', server, 'mods', 'meta'] as const,
    search: (server: string, params: SearchParams) => ['prism-corekeeper', server, 'mods', 'search', params] as const,
    item: (server: string, id: string) => ['prism-corekeeper', server, 'mods', 'item', id] as const,
    updates: (server: string) => ['prism-corekeeper', server, 'mods', 'updates'] as const,
};

export const SOURCE_NAMES: Record<SourceName, string> = { modio: 'mod.io', steam: 'Steam Workshop' };

export async function getMods(server: string): Promise<ModsState> {
    return (await http.get<ModsState>(`${base(server)}/mods`)).data;
}

export async function getMeta(server: string): Promise<Meta> {
    return (await http.get<Meta>(`${base(server)}/mods/meta`)).data;
}

export async function search(server: string, params: SearchParams): Promise<SearchResult> {
    const { data } = await http.get<SearchResult>(`${base(server)}/mods/search`, {
        params: {
            sources: params.sources,
            query: params.query || undefined,
            sort: params.sort,
            categories: params.categories,
            sides: params.sides,
            gameVersion: params.gameVersion ?? undefined,
            page: params.page,
            limit: params.limit,
        },
    });

    return data;
}

export async function getMod(server: string, id: string): Promise<{ mod: ModHit; dependencies: { id: string; title: string; icon: string | null; source: SourceName; installed: boolean }[] }> {
    return (await http.get(`${base(server)}/mods/item/${id}`)).data;
}

export async function install(server: string, ids: string[], restart: boolean): Promise<{ job: string; added: string[]; restarting: boolean; workshop: boolean }> {
    return (await http.post(`${base(server)}/mods/install`, { ids, restart })).data;
}

export async function getUpdates(server: string): Promise<Record<string, string>> {
    return (await http.get<{ updates: Record<string, string> }>(`${base(server)}/mods/updates`)).data.updates;
}

export async function toggle(server: string, folder: string, enabled: boolean): Promise<void> {
    await http.post(`${base(server)}/mods/toggle`, { folder, enabled });
}

export async function remove(server: string, mod: { id?: string | null; folder?: string | null }): Promise<void> {
    await http.post(`${base(server)}/mods/remove`, { id: mod.id ?? undefined, folder: mod.folder ?? undefined });
}

export async function repair(server: string): Promise<string> {
    return (await http.post<{ job: string }>(`${base(server)}/mods/repair`)).data.job;
}

export async function restart(server: string): Promise<string> {
    return (await http.post<{ job: string }>(`${base(server)}/mods/restart`)).data.job;
}
