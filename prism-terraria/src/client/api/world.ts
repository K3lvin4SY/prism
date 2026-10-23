import { http } from '@pterodactyl/sdk';
import { base } from './client';

export interface WorldOverview {
    name: string;
    path: string;
    exists: boolean;
    size: number | null;
    modified: string | null;
    version: number | null;
    terraria: string | null;
    maxBytes: number;
    modData: boolean;
    backup: boolean;
}

export const worldKeys = {
    overview: (server: string) => ['prism-terraria', server, 'world'] as const,
    file: (server: string, modified: string | null) => ['prism-terraria', server, 'world', 'file', modified] as const,
};

export async function getWorld(server: string): Promise<WorldOverview> {
    return (await http.get<WorldOverview>(`${base(server)}/world`)).data;
}

export async function getWorldFile(server: string, onProgress?: (fraction: number) => void): Promise<ArrayBuffer> {
    const { data } = await http.get<ArrayBuffer>(`${base(server)}/world/file`, {
        responseType: 'arraybuffer',
        onDownloadProgress: (event: { loaded: number; total?: number }) => onProgress?.(event.total ? event.loaded / event.total : 0),
    });

    return data;
}
