import { http } from '@pterodactyl/sdk';
import { base, type TerrariaInfo } from './client';

export interface Release {
    id: string;
    name: string;
    /** The Terraria version the build is for, such as 1.4.5.8. */
    terraria: string | null;
    channel: 'stable' | 'preview';
    /** The .NET version the build needs, for TShock and tModLoader. */
    dotnet: number | null;
    published: string | null;
    notes: string | null;
}

export interface VersionsOverview {
    info: TerrariaInfo;
    releases: Release[];
    world: { version: number | null; terraria: string | null };
    dockerImage: string;
    dockerImages: Record<string, string>;
    canChangeImage: boolean;
    job: string | null;
}

/** World file versions of Terraria releases; must match the backend's list. */
export const WORLD_VERSIONS: Record<string, number> = { '1.4.4.9': 279, '1.4.5.8': 326 };

export const versionKeys = { overview: (server: string) => ['prism-terraria', server, 'versions'] as const };

export async function getVersions(server: string): Promise<VersionsOverview> {
    return (await http.get<VersionsOverview>(`${base(server)}/versions`)).data;
}

export async function installRelease(server: string, release: string, options: { start: boolean; newWorld?: boolean; keepBackup?: boolean }): Promise<string> {
    return (await http.post<{ job: string }>(`${base(server)}/versions/install`, { release, ...options })).data.job;
}

/** The .NET major version a Docker image provides, read from tags like dotnet_9. */
export function imageDotnet(image: string): number | null {
    const match = image.match(/dotnet[_-]?(\d{1,2})\b/i);

    return match ? Number(match[1]) : null;
}

function compareVersions(a: string, b: string): number {
    const left = a.split('.').map(Number);
    const right = b.split('.').map(Number);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const difference = (left[i] ?? 0) - (right[i] ?? 0);
        if (difference !== 0) return difference;
    }

    return 0;
}

/** Whether a build can open the world; mirrors Releases::opensWorld on the backend. */
export function opensWorld(release: Release, world: number | null): boolean {
    if (!release.terraria || world === null) return true;

    const saved = Object.entries(WORLD_VERSIONS).find(([, version]) => version === world)?.[0];
    if (saved) return compareVersions(release.terraria, saved) >= 0;

    const target = WORLD_VERSIONS[release.terraria];

    return target === undefined || world <= target;
}
