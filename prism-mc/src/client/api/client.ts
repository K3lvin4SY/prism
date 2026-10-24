import { http } from '@pterodactyl/sdk';

export type Feature = 'players' | 'versions' | 'properties' | 'world' | 'plugins' | 'mods' | 'modpacks';

export type Kind = 'vanilla' | 'plugins' | 'modded' | 'hybrid' | 'proxy' | 'bedrock';

export interface McInfo {
    minecraft: boolean;
    edition: 'java' | 'bedrock' | null;
    software: string | null;
    kind: Kind | null;
    mcjarsType: string | null;
    version: string | null;
    build: string | null;
    buildId?: number | null;
    pluginLoaders: string[];
    modLoaders: string[];
    features: Record<Feature, boolean>;
    jarFile: string | null;
    source: 'override' | 'record' | 'files' | 'egg';
}

export interface PingStatus {
    online: boolean;
    status: { online: number; max: number; motd: string; version: string | null; players: { name: string; id: string }[] } | null;
}

export const base = (server: string) => `/api/client/servers/${server}/extensions/prism-mc`;

export const keys = {
    info: (server: string) => ['prism-mc', server, 'info'] as const,
    status: (server: string) => ['prism-mc', server, 'status'] as const,
    properties: (server: string) => ['prism-mc', server, 'properties'] as const,
    versions: (server: string) => ['prism-mc', server, 'versions'] as const,
    versionList: (server: string, type: string) => ['prism-mc', server, 'versions', type] as const,
    builds: (server: string, type: string, version: string) => ['prism-mc', server, 'versions', type, version] as const,
};

export async function getInfo(server: string, refresh = false): Promise<McInfo> {
    const { data } = await http.get<McInfo>(`${base(server)}/info`, { params: refresh ? { refresh: 1 } : undefined });

    return data;
}

export async function getStatus(server: string): Promise<PingStatus> {
    const { data } = await http.get<PingStatus>(`${base(server)}/status`);

    return data;
}
