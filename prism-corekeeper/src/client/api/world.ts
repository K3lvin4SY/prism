import { http } from '@pterodactyl/sdk';
import { base } from './client';

export interface SavedWorld {
    slot: number;
    path: string;
    size: number;
    modified: string | null;
}

export interface MapFile {
    path: string;
    name: string;
    size: number;
    modified: string | null;
}

export interface WorldOverview {
    slot: number;
    name: string | null;
    seed: string | null;
    mode: number;
    worlds: SavedWorld[];
    maps: MapFile[];
    maxBytes: number;
}

export async function getWorld(server: string): Promise<WorldOverview> {
    return (await http.get<WorldOverview>(`${base(server)}/world`)).data;
}

export const fileUrl = (server: string, path: string) => `${base(server)}/world/file?path=${encodeURIComponent(path)}`;

export async function getFile(server: string, path: string): Promise<ArrayBuffer> {
    return (await http.get<ArrayBuffer>(`${base(server)}/world/file`, { params: { path }, responseType: 'arraybuffer' })).data;
}

export const MODES: Record<number, string> = { 0: 'Normal', 1: 'Hard', 2: 'Creative', 4: 'Casual' };
