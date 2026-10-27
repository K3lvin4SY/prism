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

export interface PlayerDetails {
    name: string;
    health: number | null;
    maxHealth: number | null;
    hunger: number | null;
    /** tiles from the Core; y points up */
    x: number | null;
    y: number | null;
    dead: boolean;
    skills: { name: string; level: number }[];
    equipment: { slot: string; name: string; id: number; amount: number }[];
    customization: Record<string, string>;
    /** unix seconds the server mod last reported them */
    capturedAt: number;
}

export interface PlayerPage {
    player: SeenPlayer;
    admin: boolean;
    latestSync: { at: number; exact: boolean } | null;
    /** From the Prism server mod, kept from the player's last visit. */
    details: PlayerDetails | null;
    serverMod: boolean;
}

export async function getPlayer(server: string, player: string): Promise<PlayerPage> {
    return (await http.get<PlayerPage>(`${base(server)}/players/${encodeURIComponent(player)}`)).data;
}

export async function getPlayers(server: string): Promise<PlayersOverview> {
    return (await http.get<PlayersOverview>(`${base(server)}/players`)).data;
}

export async function setAdmins(server: string, steamIds: string[]): Promise<Admin[]> {
    return (await http.put<{ admins: Admin[] }>(`${base(server)}/players/admins`, { admins: steamIds })).data.admins;
}
