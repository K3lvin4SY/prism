import { http } from '@pterodactyl/sdk';
import { base } from './client';

export interface PlayerSync {
    /** The player's id in the history: their SteamID, or "name:<name>". */
    id: string;
    name: string;
    /** unix seconds */
    at: number;
    /** True when the Prism server mod saw them at a Cartography Table; otherwise a guess. */
    exact: boolean;
    online: boolean;
}

export interface MapOverview {
    slot: number;
    world: string | null;
    /** The shared map file, or null until someone adds their map at a Cartography Table. */
    map: { size: number; modified: string | null; tooLarge: boolean } | null;
    latest: PlayerSync[];
    serverMod: boolean;
}

export async function getMap(server: string): Promise<MapOverview> {
    return (await http.get<MapOverview>(`${base(server)}/map`)).data;
}

export async function getMapFile(server: string): Promise<ArrayBuffer> {
    return (await http.get<ArrayBuffer>(`${base(server)}/map/file`, { responseType: 'arraybuffer' })).data;
}
