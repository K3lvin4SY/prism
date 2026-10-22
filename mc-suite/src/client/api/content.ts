import { http } from '@pterodactyl/sdk';
import { base } from './client';

export type ContentKind = 'plugins' | 'mods';

/** Kinds that can be browsed. Modpacks install through their own endpoint. */
export type BrowseKind = ContentKind | 'modpacks';

export type SortOrder = 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated';

export interface ProjectHit {
    id: string;
    slug: string | null;
    title: string;
    description: string;
    author: string | null;
    icon: string | null;
    gallery: string | null;
    color: number | null;
    downloads: number;
    follows: number;
    updated: string | null;
    categories: string[];
    loaders: string[];
    gameVersions: string[];
    serverSide: string | null;
    clientSide: string | null;
    url: string;
    installed: boolean;
    /** Set on Pumpkin Market plugins, which have no followers or game versions. */
    source?: 'pumpkin-market';
}

/** Where a project page lives, for its link: Modrinth, or the Pumpkin Market. */
export function sourceName(url: string): string {
    return url.startsWith('https://market.pumpkinmc.org/') ? 'Pumpkin Market' : 'Modrinth';
}

export interface SearchResult {
    hits: ProjectHit[];
    total: number;
    page: number;
    limit: number;
}

export interface SearchParams {
    query: string;
    categories: string[];
    exclude: string[];
    /** null leaves it to the server: its own loaders. */
    loaders: string[] | null;
    /** null leaves it to the server: its own Minecraft version. */
    gameVersions: string[] | null;
    sort: SortOrder;
    page: number;
    limit: number;
}

export interface Tag {
    name: string;
    /** Sanitised SVG markup from Modrinth. */
    icon: string | null;
}

export interface Filters {
    categories: Tag[];
    loaders: Tag[];
    gameVersions: { version: string; type: string }[];
    serverLoaders: string[];
    serverVersion: string | null;
}

export interface ProjectDetails {
    id: string;
    slug: string | null;
    title: string;
    description: string;
    body: string;
    icon: string | null;
    downloads: number;
    follows: number;
    updated: string | null;
    categories: string[];
    loaders: string[];
    gameVersions: string[];
    serverSide: string | null;
    license: string | null;
    source: string | null;
    url: string;
}

export interface VersionFile {
    url: string;
    filename: string;
    /** Unknown for Pumpkin Market files, which are signed per download. */
    size: number | null;
    sha1: string | null;
    primary: boolean;
}

export interface ProjectVersion {
    id: string;
    projectId: string;
    name: string;
    number: string;
    type: 'release' | 'beta' | 'alpha';
    loaders: string[];
    gameVersions: string[];
    published: string | null;
    downloads: number;
    changelog: string;
    files: VersionFile[];
    dependencies: { projectId: string | null; versionId: string | null; type: string }[];
}

export interface ContentRecord {
    provider: string;
    project: string;
    version: string;
    versionNumber: string;
    title: string;
    icon: string | null;
    url: string | null;
    sha1: string | null;
    size?: number;
    loaders: string[];
    gameVersions: string[];
    installedAt: number;
    identified?: boolean;
}

export interface InstalledFile {
    file: string;
    enabled: boolean;
    size: number;
    modified: string | null;
    downloading: boolean;
    record: ContentRecord | null;
    /** Why Pumpkin did not load the plugin at its last start. */
    loadError?: string | null;
}

export interface Dependency {
    projectId: string;
    version: { id: string; number: string; name: string } | null;
    project: { id: string; title: string; icon: string | null; url: string } | null;
}

export interface UpdateInfo {
    id: string;
    number: string;
    name: string;
    published: string | null;
}

const url = (server: string, kind: BrowseKind) => `${base(server)}/content/${kind}`;

export const contentKeys = {
    search: (server: string, kind: BrowseKind, params: SearchParams) => ['mc-suite', server, kind, 'search', params] as const,
    categories: (server: string, kind: BrowseKind) => ['mc-suite', server, kind, 'categories'] as const,
    project: (server: string, kind: BrowseKind, id: string, all: boolean) => ['mc-suite', server, kind, 'project', id, all] as const,
    dependencies: (server: string, kind: ContentKind, version: string) => ['mc-suite', server, kind, 'dependencies', version] as const,
    installed: (server: string, kind: ContentKind) => ['mc-suite', server, kind, 'installed'] as const,
    updates: (server: string, kind: ContentKind) => ['mc-suite', server, kind, 'updates'] as const,
};

export async function search(server: string, kind: BrowseKind, params: SearchParams): Promise<SearchResult> {
    const query: Record<string, unknown> = {
        query: params.query,
        sort: params.sort,
        page: params.page,
        limit: params.limit,
        categories: params.categories,
        exclude: params.exclude,
    };
    // An empty list is sent as an empty value, which means "any" rather than "the server's".
    if (params.loaders !== null) query.loaders = params.loaders.length > 0 ? params.loaders : '';
    if (params.gameVersions !== null) query.gameVersions = params.gameVersions.length > 0 ? params.gameVersions : '';
    const { data } = await http.get<SearchResult>(`${url(server, kind)}/search`, { params: query });

    return data;
}

export async function getCategories(server: string, kind: BrowseKind): Promise<Filters> {
    const { data } = await http.get<Filters>(`${url(server, kind)}/categories`);

    return data;
}

export async function getProject(server: string, kind: BrowseKind, id: string, all: boolean) {
    const { data } = await http.get<{ project: ProjectDetails; versions: ProjectVersion[]; installed: ContentRecord | null }>(`${url(server, kind)}/projects/${id}`, {
        params: all ? { all: 1 } : undefined,
    });

    return data;
}

export async function getDependencies(server: string, kind: ContentKind, version: string): Promise<Dependency[]> {
    const { data } = await http.get<{ dependencies: Dependency[] }>(`${url(server, kind)}/versions/${version}/dependencies`);

    return data.dependencies;
}

export async function getInstalled(server: string, kind: ContentKind) {
    const { data } = await http.get<{ files: InstalledFile[]; job: string | null }>(`${url(server, kind)}/installed`);

    return data;
}

export async function install(server: string, kind: ContentKind, version: string, dependencies: string[], force = false) {
    const { data } = await http.post<{ job: string | null; files: string[] }>(`${url(server, kind)}/install`, { version, dependencies, force });

    return data;
}

export async function checkUpdates(server: string, kind: ContentKind): Promise<Record<string, UpdateInfo>> {
    const { data } = await http.post<{ updates: Record<string, UpdateInfo> }>(`${url(server, kind)}/updates`);

    return data.updates;
}

export async function identify(server: string, kind: ContentKind) {
    const { data } = await http.post<{ checked: number; identified: number }>(`${url(server, kind)}/identify`);

    return data;
}

export async function setEnabled(server: string, kind: ContentKind, file: string, enabled: boolean): Promise<void> {
    await http.patch(`${url(server, kind)}/files/${encodeURIComponent(file)}`, { enabled });
}

export async function remove(server: string, kind: ContentKind, file: string): Promise<void> {
    await http.delete(`${url(server, kind)}/files/${encodeURIComponent(file)}`);
}

/** 93000000 → 93.0M, the way Modrinth shows counts. */
export function compactNumber(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;

    return String(value);
}

export interface InstalledModpack {
    provider: string;
    project: string;
    version: string;
    versionNumber: string;
    title: string;
    icon: string | null;
    url: string | null;
    name: string | null;
    minecraft: string;
    loader: { type: string; version: string | null } | null;
    files: number;
    installed: string;
}

export async function getModpack(server: string) {
    const { data } = await http.get<{ modpack: InstalledModpack | null; job: string | null; clean: string[] }>(`${base(server)}/modpacks`);

    return data;
}

export async function installModpack(server: string, version: string, clean: boolean, start: boolean): Promise<string> {
    const { data } = await http.post<{ job: string }>(`${base(server)}/modpacks/install`, { version, clean, start });

    return data.job;
}
