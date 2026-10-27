import { http } from '@pterodactyl/sdk';
import { base } from './client';

export interface OnlinePlayer {
    /** The SteamID64, or "name:<name>" for players without one. */
    id: string;
    name: string;
    steamId: string | null;
}

export interface Admin {
    steamId: string;
    name: string;
    privileges: number | null;
}

export interface SeenPlayer {
    id: string;
    name: string;
    steamId: string | null;
    /** unix seconds the Panel first and last saw them */
    firstSeen: number;
    lastSeen: number;
    online: boolean;
}

export interface PlayersOverview {
    running: boolean;
    online: OnlinePlayer[];
    history: SeenPlayer[];
    admins: Admin[];
    adminsFile: boolean;
    join: { gameId: string | null; direct: { address: string; port: number; password: string; paste: string } | null };
}

export async function getPlayers(server: string): Promise<PlayersOverview> {
    return (await http.get<PlayersOverview>(`${base(server)}/players`)).data;
}

export async function setAdmins(server: string, steamIds: string[]): Promise<Admin[]> {
    return (await http.put<{ admins: Admin[] }>(`${base(server)}/players/admins`, { admins: steamIds })).data.admins;
}
