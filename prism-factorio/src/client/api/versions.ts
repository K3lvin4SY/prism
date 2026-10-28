import { http } from '@pterodactyl/sdk';
import { base } from './client';

export interface VersionsOverview {
    /** The newest stable and experimental headless versions. */
    stable: string | null;
    experimental: string | null;
    /** Every headless version there is, newest first. */
    versions: string[];
    installed: string | null;
    /** What the egg's FACTORIO_VERSION is set to: latest, experimental or a version. */
    chosen: string;
    update: boolean;
    mods: { name: string; title: string }[];
    running: boolean;
    job: string | null;
}

export async function getVersions(server: string): Promise<VersionsOverview> {
    return (await http.get<VersionsOverview>(`${base(server)}/versions`)).data;
}

export async function installVersion(server: string, version: string, options: { backup: boolean; start: boolean }): Promise<string> {
    return (await http.post<{ job: string }>(`${base(server)}/versions/install`, { version, ...options })).data.job;
}
