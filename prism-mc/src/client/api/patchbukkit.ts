import { http } from '@pterodactyl/sdk';
import { base } from './client';

export interface PatchBukkitStatus {
    /** The library file in plugins/, or null when PatchBukkit is not installed. */
    installed: string | null;
    record: { tag: string; name: string; installed: string } | null;
    /** The build that matches the server's Pumpkin. */
    available: { tag: string; name: string; size: number } | null;
    folder: string;
    /** Pumpkin runs its glibc build, the one that can load native plugins. */
    glibc: boolean;
    /** Prism MC may switch the egg's download to the glibc build. */
    canSwitchBuild: boolean;
    /** Pumpkin runs Nightly or Canary, which PatchBukkit's releases are not built for. */
    rolling: boolean;
    java: {
        needed: number;
        image: string;
        version: number | null;
        /** Images of the egg with new enough Java, by display name. */
        images: Record<string, string>;
        canChange: boolean;
    };
    job: string | null;
}

export const patchBukkitKey = (server: string) => ['prism-mc', server, 'patchbukkit'] as const;

export async function getPatchBukkit(server: string): Promise<PatchBukkitStatus> {
    return (await http.get<PatchBukkitStatus>(`${base(server)}/patchbukkit`)).data;
}

export async function installPatchBukkit(server: string): Promise<string> {
    return (await http.post<{ job: string }>(`${base(server)}/patchbukkit`)).data.job;
}
