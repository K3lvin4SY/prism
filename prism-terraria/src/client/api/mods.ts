import { http } from '@pterodactyl/sdk';
import { base } from './client';

export type ModSort = 'trend' | 'subscriptions' | 'newest' | 'updated' | 'votes';

export interface WorkshopHit {
    id: string;
    title: string;
    description: string;
    author: string | null;
    icon: string | null;
    subscriptions: number;
    favorites: number;
    /** Steam's rating from 0 to 1. */
    score: number | null;
    size: number;
    created: string | null;
    /** Unix time of the last upload. */
    updated: number | null;
    categories: string[];
    side: string | null;
    gameVersions: string[];
    dependencies: string[];
    url: string;
    installed: boolean;
}

export interface WorkshopItem extends WorkshopHit {
    body: string;
    screenshots: string[];
}

export interface SearchResult {
    total: number;
    hits: WorkshopHit[];
    categories: string[];
    sides: string[];
    gameVersions: string[];
}

export interface SearchParams {
    query: string;
    sort: ModSort;
    categories: string[];
    sides: string[];
    gameVersion: string | null;
    page: number;
    limit: number;
}

export interface InstalledMod {
    /** Workshop id, or null for a mod put in mods/ by hand. */
    id: string | null;
    /** The mod's internal name, once downloaded. */
    name: string | null;
    title: string;
    icon: string | null;
    dependency: boolean;
    updated: number | null;
    size: number;
    /** Downloaded at the next start. */
    pending: boolean;
    enabled: boolean;
}

export interface ModsOverview {
    mods: InstalledMod[];
    workshop: boolean;
    wrapperMissing: boolean;
    running: boolean;
    build: string | null;
    job: string | null;
    confirmInstalls: boolean;
}

export const modKeys = {
    installed: (server: string) => ['prism-terraria', server, 'mods'] as const,
    search: (server: string, params: SearchParams) => ['prism-terraria', server, 'mods', 'search', params] as const,
    item: (server: string, id: string) => ['prism-terraria', server, 'mods', 'item', id] as const,
    updates: (server: string) => ['prism-terraria', server, 'mods', 'updates'] as const,
};

export async function getMods(server: string): Promise<ModsOverview> {
    return (await http.get<ModsOverview>(`${base(server)}/mods`)).data;
}

export async function searchWorkshop(server: string, params: SearchParams): Promise<SearchResult> {
    const { gameVersion, ...rest } = params;

    return (await http.get<SearchResult>(`${base(server)}/mods/search`, { params: { ...rest, ...(gameVersion ? { gameVersion } : {}) } })).data;
}

export async function getWorkshopItem(server: string, id: string): Promise<{ item: WorkshopItem; dependencies: { id: string; title: string; icon: string | null; installed: boolean }[] }> {
    return (await http.get(`${base(server)}/mods/workshop/${id}`)).data;
}

export async function installMods(server: string, ids: string[], restart: boolean): Promise<{ job: string; added: string[]; restarting: boolean }> {
    return (await http.post(`${base(server)}/mods/install`, { ids, restart })).data;
}

export async function checkModUpdates(server: string): Promise<Record<string, number>> {
    return (await http.get<{ updates: Record<string, number> }>(`${base(server)}/mods/updates`)).data.updates;
}

export async function toggleMod(server: string, name: string, enabled: boolean): Promise<void> {
    await http.post(`${base(server)}/mods/toggle`, { name, enabled });
}

export async function removeMod(server: string, mod: InstalledMod): Promise<void> {
    await http.post(`${base(server)}/mods/remove`, { id: mod.id, name: mod.name });
}

export async function repairMods(server: string): Promise<string> {
    return (await http.post<{ job: string }>(`${base(server)}/mods/repair`)).data.job;
}

export function compactNumber(value: number): string {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
