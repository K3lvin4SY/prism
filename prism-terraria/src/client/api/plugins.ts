import { http } from '@pterodactyl/sdk';
import { base } from './client';

export interface CatalogPlugin {
    id: string;
    name: string;
    homepage: string;
    author: string | null;
    description: string;
    /** The TShock version the author tested it on, such as 5.2.1. */
    tested: string | null;
    /** A direct .dll or .zip link, or null when the plugin is only on its own website. */
    download: string | null;
    downloadPage: string | null;
    version: string | null;
    source: string | null;
    docs: string | null;
    section: 'listed' | 'community' | 'older';
    installed: boolean;
}

export interface InstalledPlugin {
    /** The catalogue id, or null for a plugin put in ServerPlugins/ another way. */
    id: string | null;
    name: string;
    version: string | null;
    files: string[];
    size: number;
    enabled: boolean;
    /** Installed from the catalogue, but its files are gone. */
    missing: boolean;
    core: boolean;
}

export const pluginKeys = {
    catalog: (server: string) => ['prism-terraria', server, 'plugins', 'catalog'] as const,
    installed: (server: string) => ['prism-terraria', server, 'plugins'] as const,
};

export async function getCatalog(server: string): Promise<{ plugins: CatalogPlugin[]; tshock: string | null; repository: string }> {
    return (await http.get(`${base(server)}/plugins/catalog`)).data;
}

export async function getPlugins(server: string): Promise<{ plugins: InstalledPlugin[]; running: boolean; job: string | null; confirmInstalls: boolean }> {
    return (await http.get(`${base(server)}/plugins`)).data;
}

export async function installPlugin(server: string, id: string, restart: boolean): Promise<{ job: string; restarting: boolean }> {
    return (await http.post(`${base(server)}/plugins/install`, { id, restart })).data;
}

export async function togglePlugin(server: string, files: string[], enabled: boolean): Promise<void> {
    await http.post(`${base(server)}/plugins/toggle`, { files, enabled });
}

export async function removePlugin(server: string, plugin: InstalledPlugin): Promise<void> {
    await http.post(`${base(server)}/plugins/remove`, plugin.id ? { id: plugin.id } : { files: plugin.files });
}

/** Whether a plugin was tested on the same major TShock version as the server runs. */
export function testedOnMajor(tested: string | null, build: string | null): boolean | null {
    const major = (value: string | null) => value?.match(/(\d+)/)?.[1] ?? null;
    if (!tested || !build) return null;

    return major(tested) === major(build);
}
