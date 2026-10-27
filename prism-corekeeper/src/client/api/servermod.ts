import { http } from '@pterodactyl/sdk';
import { base } from './client';

export interface ServerModState {
    enabled: boolean;
    /** The version on the server, or null when it is not there. */
    installed: string | null;
    /** The version this extension brings. */
    version: string;
    outdated: boolean;
    running: boolean;
}

export async function getServerMod(server: string): Promise<ServerModState> {
    return (await http.get<ServerModState>(`${base(server)}/servermod`)).data;
}

export async function setServerMod(server: string, enabled: boolean): Promise<ServerModState> {
    return (await http.put<ServerModState>(`${base(server)}/servermod`, { enabled })).data;
}
