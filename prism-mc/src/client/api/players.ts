import { useQuery } from '@tanstack/react-query';
import { http } from '@pterodactyl/sdk';
import { base } from './client';

export interface Ban {
    reason: string | null;
    source: string | null;
    created: string | null;
    expires: string | null;
}

export interface PlayerSummary {
    /** UUID on Java, xuid on Bedrock (null when only the name is known). */
    uuid: string | null;
    name: string | null;
    online: boolean;
    op: number | null;
    whitelisted: boolean;
    banned: Ban | null;
    lastSeen: string | null;
    hasData: boolean;
}

export interface PlayerEvent {
    time: string | null;
    name: string;
    event: 'joined' | 'left' | 'kicked' | 'lost' | 'banned' | 'unbanned' | 'opped' | 'deopped' | 'whitelisted' | 'unwhitelisted';
    detail: string | null;
    id: string | null;
}

export interface PlayersResponse {
    edition: 'java' | 'bedrock';
    running: boolean;
    online: { count: number; max: number; source: 'ping' | 'log' };
    whitelist: boolean;
    onlineMode: boolean;
    players: PlayerSummary[];
    activity: PlayerEvent[];
    canManage: boolean;
}

export interface PlayerDetails {
    uuid: string;
    dat: string | null;
    stats: Record<string, Record<string, number>> | null;
    advancements: { id: string; date: string | null }[];
    version: string | null;
    /** The sha1 of the saved file, sent back when it is edited; missing on Bedrock. */
    hash?: string | null;
}

/**
 * Replaces a Java player's saved file, edited in the browser. The server refuses while the player
 * is online or when the file changed since `expectedHash` was read. Resolves the new file's hash.
 */
export async function writePlayerData(server: string, uuid: string, dat: string, expectedHash: string, reason: 'edit' | 'clear' = 'edit'): Promise<string> {
    return (await http.put<{ hash: string }>(`${base(server)}/players/${uuid}/data`, { dat, expectedHash, reason })).data.hash;
}

export type PlayerAction =
    | 'gamemode'
    | 'xp-set'
    | 'xp-add'
    | 'heal'
    | 'feed'
    | 'starve'
    | 'kill'
    | 'clear'
    | 'message'
    | 'kick'
    | 'teleport'
    | 'op'
    | 'deop'
    | 'whitelist-add'
    | 'whitelist-remove'
    | 'ban'
    | 'pardon'
    | 'save';

export const playerKeys = {
    list: (server: string) => ['prism-mc', server, 'players'] as const,
    detail: (server: string, uuid: string) => ['prism-mc', server, 'players', uuid] as const,
    skin: (server: string, key: string) => ['prism-mc', 'skin', server, key] as const,
};

export async function getPlayers(server: string): Promise<PlayersResponse> {
    return (await http.get<PlayersResponse>(`${base(server)}/players`)).data;
}

/** A Bedrock player's record from the world database, by xuid. */
export async function getBedrockPlayer(server: string, xuid: string): Promise<PlayerDetails> {
    const { data } = await http.get<{ xuid: string; dat: string | null; version: string | null }>(`${base(server)}/players/bedrock/${xuid}`);

    return { uuid: data.xuid, dat: data.dat, stats: null, advancements: [], version: data.version };
}

export async function getPlayer(server: string, uuid: string): Promise<PlayerDetails> {
    return (await http.get<PlayerDetails>(`${base(server)}/players/${uuid}`)).data;
}

/** Where to teleport a player: to another player, or to a place in a dimension. */
export type TeleportTarget = { player: string } | { x: number; y: number; z: number; dimension?: 'overworld' | 'the_nether' | 'the_end' };

export async function playerAction(
    server: string,
    action: PlayerAction,
    input: { name?: string | null; uuid?: string | null; value?: string | number | TeleportTarget; reason?: string } = {}
): Promise<'command' | 'file'> {
    return (await http.post<{ applied: 'command' | 'file' }>(`${base(server)}/players/action`, { action, ...input })).data.applied;
}

export async function setWhitelist(server: string, enabled: boolean): Promise<void> {
    await http.put(`${base(server)}/players/whitelist`, { enabled });
}

export interface Skin {
    /** A data URL of the 64×64 skin texture. */
    url: string;
    slim: boolean;
    cape: string | null;
}

/** A player's skin texture, fetched once and kept for the session. */
export function useSkin(server: string, key: string | null | undefined) {
    return useQuery({
        queryKey: playerKeys.skin(server, key ?? ''),
        queryFn: async (): Promise<Skin> => {
            const { data } = await http.get<{ png: string; slim: boolean; cape: string | null }>(`${base(server)}/players/skins/${encodeURIComponent(key!)}`);

            return { url: `data:image/png;base64,${data.png}`, slim: data.slim, cape: data.cape ? `data:image/png;base64,${data.cape}` : null };
        },
        enabled: !!key,
        staleTime: Infinity,
        gcTime: 3_600_000,
    });
}
