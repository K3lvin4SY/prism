import { http } from '@pterodactyl/sdk';
import { base } from './client';

export interface OnlinePlayer {
    name: string;
    ip: string | null;
}

export interface PlayerEvent {
    time: string | null;
    name: string;
    event: 'joined' | 'left';
    detail: string | null;
}

export interface Account {
    id: number;
    name: string;
    group: string;
    registered: string | null;
    lastSeen: string | null;
    ips: string[];
    hasCharacter: boolean;
}

export interface TShockBan {
    ticket: number;
    /** acc, name, ip or uuid */
    type: string;
    value: string;
    reason: string;
    by: string;
    date: string;
    expires: string | null;
}

export interface VanillaBan {
    name: string;
    ip: string | null;
}

export interface PlayersOverview {
    kind: 'vanilla' | 'tshock' | 'tmodloader';
    running: boolean;
    online: OnlinePlayer[];
    activity: PlayerEvent[];
    canManage: boolean;
    bans: TShockBan[] | VanillaBan[];
    accounts?: Account[];
    groups?: string[];
    ssc?: boolean;
    database?: boolean;
}

export interface CharacterItem {
    slot: number;
    id: number;
    stack: number;
    prefix: number;
    favorited: boolean;
}

export interface Character {
    health: number;
    maxHealth: number;
    mana: number;
    maxMana: number;
    items: CharacterItem[];
    questsCompleted: number;
    deaths: { pve: number; pvp: number };
    loadout: number;
    spawn: [number, number];
    upgrades: string[];
}

export interface AccountDetails {
    account: Account;
    character: Character | null;
    groups: string[];
    bans: TShockBan[];
    online: boolean;
    canManage: boolean;
}

export type PlayerAction =
    | { action: 'kick' | 'heal' | 'godmode' | 'unmute'; name: string; reason?: string }
    | { action: 'ban'; name?: string; account?: string; reason?: string; duration?: string }
    | { action: 'unban'; ticket?: number; name?: string }
    | { action: 'say'; text: string }
    | { action: 'message'; name: string; text: string }
    | { action: 'mute'; name: string; reason?: string }
    | { action: 'give'; name: string; item: number; amount: number }
    | { action: 'group'; account: string; group: string }
    | { action: 'delete-account'; account: string };

export const playerKeys = {
    overview: (server: string) => ['prism-terraria', server, 'players'] as const,
    account: (server: string, id: number) => ['prism-terraria', server, 'players', id] as const,
};

export async function getPlayers(server: string): Promise<PlayersOverview> {
    return (await http.get<PlayersOverview>(`${base(server)}/players`)).data;
}

export async function getAccount(server: string, id: number): Promise<AccountDetails> {
    return (await http.get<AccountDetails>(`${base(server)}/players/accounts/${id}`)).data;
}

export async function playerAction(server: string, action: PlayerAction): Promise<void> {
    await http.post(`${base(server)}/players/action`, action);
}
