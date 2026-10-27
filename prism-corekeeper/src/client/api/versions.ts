import { http } from '@pterodactyl/sdk';
import { base } from './client';

export interface Branch {
    /** public, or a legacy build such as 1.2.1.5 */
    id: string;
    build: string | null;
    /** unix seconds */
    updated: number | null;
    description: string | null;
}

export interface VersionsOverview {
    branches: Branch[];
    installed: { build: string | null; branch: string; version: string | null };
    chosen: string | null;
    update: boolean;
    autoUpdate: boolean;
    hookMissing: boolean;
    running: boolean;
    job: string | null;
}

export async function getVersions(server: string): Promise<VersionsOverview> {
    return (await http.get<VersionsOverview>(`${base(server)}/versions`)).data;
}

export async function installBranch(server: string, branch: string, options: { backup: boolean; start: boolean }): Promise<string> {
    return (await http.post<{ job: string }>(`${base(server)}/versions/install`, { branch, ...options })).data.job;
}

/** "Latest" for the public branch, the build's number for legacy ones. */
export function branchName(branch: Pick<Branch, 'id'>): string {
    return branch.id === 'public' ? 'Latest' : branch.id;
}

/** Legacy branches are older builds; going to one from a newer build may not open newer worlds. */
export function isOlder(branch: string, installed: string): boolean {
    if (branch === 'public') return false;
    if (installed === 'public') return true;

    const a = branch.split('.').map(Number);
    const b = installed.split('.').map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
    }

    return false;
}
