import { http } from '@pterodactyl/sdk';

export type Feature = 'players' | 'properties' | 'versions' | 'world' | 'mods';

export interface CoreKeeperInfo {
    corekeeper: boolean;
    /** The game version from the server log, such as 1.3.0. */
    version: string | null;
    /** Steam's build id of the installed server. */
    build: string | null;
    branch: string | null;
    features: Record<Feature, boolean>;
}

export const base = (server: string) => `/api/client/servers/${server}/extensions/prism-corekeeper`;

export const keys = {
    info: (server: string) => ['prism-corekeeper', server, 'info'] as const,
    properties: (server: string) => ['prism-corekeeper', server, 'properties'] as const,
    players: (server: string) => ['prism-corekeeper', server, 'players'] as const,
    versions: (server: string) => ['prism-corekeeper', server, 'versions'] as const,
    map: (server: string) => ['prism-corekeeper', server, 'map'] as const,
    player: (server: string, player: string) => ['prism-corekeeper', server, 'players', player] as const,
    serverMod: (server: string) => ['prism-corekeeper', server, 'servermod'] as const,
    mods: (server: string) => ['prism-corekeeper', server, 'mods'] as const,
};

export async function getInfo(server: string, refresh = false): Promise<CoreKeeperInfo> {
    const { data } = await http.get<CoreKeeperInfo>(`${base(server)}/info`, { params: refresh ? { refresh: 1 } : undefined });

    return data;
}

/** Runs a slice of an install plan from the page, for when the Panel's queue worker does not. */
export async function advancePlan(server: string, job: string): Promise<'busy' | 'wait' | 'more' | 'done'> {
    return (await http.post<{ result: 'busy' | 'wait' | 'more' | 'done' }>(`${base(server)}/plans/${job}/advance`)).data.result;
}

/** "1.4 MB" */
export function bytes(size: number): string {
    if (size < 1024) return `${size} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = size / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }

    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** "12.3k" */
export function compactNumber(value: number): string {
    if (value < 1000) return String(value);
    if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;

    return `${(value / 1_000_000).toFixed(1)}M`;
}
