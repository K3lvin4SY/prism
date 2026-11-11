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
    status: ServerModStatus;
}

/** How the mod is doing on the running server. */
export interface ServerModStatus {
    /** off · stopped · loading (not loaded yet) · failed (did not compile) · quiet (loaded, not reporting) · reporting */
    state: 'off' | 'stopped' | 'loading' | 'failed' | 'quiet' | 'reporting';
    /** When it last wrote its report (Unix seconds). */
    reportedAt: number | null;
    /** How it catches Cartography Table syncs: its own system (all of them) or a look once a frame. */
    syncWatch: 'system' | 'frame' | 'starting' | null;
    /** Parts of its report that failed, by part (health, hunger, skills, gear, character, syncs, report, syncWatch). */
    problems: Record<string, string>;
    /** The compile errors when it failed. */
    errors: string[];
}

export async function getServerMod(server: string): Promise<ServerModState> {
    return (await http.get<ServerModState>(`${base(server)}/servermod`)).data;
}

export async function setServerMod(server: string, enabled: boolean): Promise<ServerModState> {
    return (await http.put<ServerModState>(`${base(server)}/servermod`, { enabled })).data;
}
