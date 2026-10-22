import { http } from '@pterodactyl/sdk';

export type Feature = 'players' | 'properties' | 'versions' | 'world' | 'mods' | 'plugins';

export type Kind = 'vanilla' | 'tshock' | 'tmodloader';

export interface TerrariaInfo {
    terraria: boolean;
    kind: Kind | null;
    /** The Terraria version the server speaks, such as 1.4.4.9. */
    version: string | null;
    /** The TShock or tModLoader build, or the vanilla release. */
    build: string | null;
    features: Record<Feature, boolean>;
    source: 'override' | 'record' | 'files' | 'egg';
}

export const KIND_NAMES: Record<Kind, string> = { vanilla: 'Terraria', tshock: 'TShock', tmodloader: 'tModLoader' };

export const base = (server: string) => `/api/client/servers/${server}/extensions/terraria-suite`;

export const keys = {
    info: (server: string) => ['terraria-suite', server, 'info'] as const,
    settings: (server: string) => ['terraria-suite', server, 'settings'] as const,
};

export async function getInfo(server: string, refresh = false): Promise<TerrariaInfo> {
    const { data } = await http.get<TerrariaInfo>(`${base(server)}/info`, { params: refresh ? { refresh: 1 } : undefined });

    return data;
}
