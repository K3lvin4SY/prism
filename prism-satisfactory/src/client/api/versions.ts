import { http } from '@pterodactyl/sdk';
import { base } from './client';

export interface Branch {
    /** public or experimental */
    id: string;
    build: string | null;
    /** unix seconds */
    updated: number | null;
    description: string | null;
}

export interface VersionsOverview {
    branches: Branch[];
    installed: { build: string | null; branch: string; changelist: number | null };
    /** The branch the egg's SRCDS_BETAID names. */
    chosen: string;
    update: boolean;
    autoUpdate: boolean;
    running: boolean;
    job: string | null;
}

export async function getVersions(server: string): Promise<VersionsOverview> {
    return (await http.get<VersionsOverview>(`${base(server)}/versions`)).data;
}

export async function installBranch(server: string, branch: string, options: { start: boolean }): Promise<string> {
    return (await http.post<{ job: string }>(`${base(server)}/versions/install`, { branch, ...options })).data.job;
}

export function branchName(id: string): string {
    return id === 'public' ? 'Public' : id.charAt(0).toUpperCase() + id.slice(1);
}
