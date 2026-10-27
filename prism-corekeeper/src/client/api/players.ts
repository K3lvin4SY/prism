import { http } from '@pterodactyl/sdk';
import { base } from './client';

export interface OnlinePlayer {
    id: string;
    name: string;
    online: boolean;
    joins: number;
}

export interface SeenPlayer {
    id: string;
    name: string;
    /** unix seconds the Panel first and last saw them */
    firstSeen: number;
    lastSeen: number;
    online: boolean;
}

export interface PlayersOverview {
    running: boolean;
    online: OnlinePlayer[];
    history: SeenPlayer[];
    admins: string[];
    adminsFile: boolean;
    join: { gameId: string | null; direct: { address: string; port: number; password: string; paste: string } | null };
}

export async function getPlayers(server: string): Promise<PlayersOverview> {
    return (await http.get<PlayersOverview>(`${base(server)}/players`)).data;
}

export async function setAdmins(server: string, admins: string[]): Promise<string[]> {
    return (await http.put<{ admins: string[] }>(`${base(server)}/players/admins`, { admins })).data.admins;
}
