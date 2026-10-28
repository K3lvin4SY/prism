import { http } from '@pterodactyl/sdk';
import { base } from './client';

export interface SeenPlayer {
    name: string;
    /** unix seconds the Panel first and last saw them */
    firstSeen: number;
    lastSeen: number;
    joins: number;
    online: boolean;
}

export interface GameState {
    session: string;
    /** Whether a game is loaded; a new server waits in its menu until one is made. */
    running: boolean;
    paused: boolean;
    tier: number;
    phase: string;
    /** seconds played */
    duration: number;
    tickRate: number;
}

export interface PlayersOverview {
    running: boolean;
    /** How many are connected, from the API; null when the Panel cannot ask it. */
    count: number | null;
    limit: number | null;
    /** The latest names to join, as many as are connected. */
    online: string[];
    history: SeenPlayer[];
    game: GameState | null;
}

export async function getPlayers(server: string): Promise<PlayersOverview> {
    return (await http.get<PlayersOverview>(`${base(server)}/players`)).data;
}

export async function getPlayer(server: string, player: string): Promise<{ player: SeenPlayer }> {
    return (await http.get<{ player: SeenPlayer }>(`${base(server)}/players/${encodeURIComponent(player)}`)).data;
}
