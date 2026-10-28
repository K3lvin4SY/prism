import { http } from '@pterodactyl/sdk';
import { base } from './client';

export interface SeenPlayer {
    name: string;
    /** unix seconds the Panel first and last saw them; null for someone only on a list */
    firstSeen: number | null;
    lastSeen: number | null;
    online: boolean;
}

export interface Ban {
    name: string;
    reason: string | null;
}

export interface PlayersOverview {
    running: boolean;
    online: { name: string }[];
    history: SeenPlayer[];
    admins: string[];
    bans: Ban[];
    whitelist: string[];
    /** Whether each list file exists yet; the game writes them as they are first used. */
    files: Record<'admins' | 'bans' | 'whitelist', boolean>;
}

export interface ChatLine {
    name: string;
    text: string;
    /** unix seconds, when the line had a time */
    at: number | null;
}

export interface PlayerPage {
    player: SeenPlayer;
    admin: boolean;
    whitelisted: boolean;
    ban: Ban | null;
    chat: ChatLine[];
}

export type PlayerAction = 'kick' | 'ban' | 'unban' | 'promote' | 'demote' | 'whitelist-add' | 'whitelist-remove' | 'whisper';

export async function getPlayers(server: string): Promise<PlayersOverview> {
    return (await http.get<PlayersOverview>(`${base(server)}/players`)).data;
}

export async function getPlayer(server: string, player: string): Promise<PlayerPage> {
    return (await http.get<PlayerPage>(`${base(server)}/players/${encodeURIComponent(player)}`)).data;
}

/** Applies at once on a running server; on a stopped one the list file changes for the next start. */
export async function playerAction(server: string, action: PlayerAction, name: string, text?: string): Promise<'command' | 'file'> {
    return (await http.post<{ applied: 'command' | 'file' }>(`${base(server)}/players/action`, { action, name, text: text || undefined })).data.applied;
}

/** Factorio usernames: letters, digits, dashes, underscores and dots. */
export function validName(name: string): boolean {
    return /^[A-Za-z0-9_.-]{1,60}$/.test(name);
}
