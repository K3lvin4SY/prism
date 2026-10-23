import { http } from '@pterodactyl/sdk';
import { base } from './client';

export type ForwardingMode = 'modern' | 'legacy' | 'none';

export interface LinkedServer {
    identifier: string;
    uuid: string;
    name: string;
    software: string | null;
    version: string | null;
    icon: string | null;
    address: string | null;
    canRestart: boolean;
}

export interface ProxyEntry {
    name: string;
    address: string;
    fallback: boolean;
    position: number | null;
    forcedHost: string | null;
    restricted: boolean;
    motd: string | null;
    type: 'velocity' | 'bungee';
    server?: LinkedServer | null;
}

export type ProxyOverview =
    | {
          role: 'proxy';
          type: 'velocity' | 'bungee' | string;
          ready: boolean;
          mode?: ForwardingMode;
          onlineMode?: boolean;
          examples?: boolean;
          bind?: number | null;
          port?: number | null;
          entries: ProxyEntry[];
          address?: string | null;
      }
    | (BackendInfo & { role: 'backend' })
    | (BackendInfo & { role: 'unsupported' });

interface BackendInfo {
    software: string | null;
    modes: ForwardingMode[];
    address: string | null;
    link: (ProxyEntry & { proxy: LinkedServer; mode: ForwardingMode }) | null;
}

export interface Candidate extends LinkedServer {
    modes: ForwardingMode[];
    /** The proxy UUID this server is already linked to, if any. */
    linkedTo: string | null;
}

export interface LinkInput {
    server: string;
    name: string;
    address?: string;
    fallback?: boolean;
    forcedHost?: string;
}

export interface EntryChanges {
    name?: string;
    address?: string;
    fallback?: boolean;
    forcedHost?: string | null;
    restricted?: boolean;
    position?: number;
}

const url = (server: string) => `${base(server)}/proxy`;

export const proxyKeys = {
    overview: (server: string) => ['prism-mc', server, 'proxy'] as const,
    candidates: (server: string) => ['prism-mc', server, 'proxy', 'candidates'] as const,
};

export async function getProxy(server: string): Promise<ProxyOverview> {
    return (await http.get<ProxyOverview>(url(server))).data;
}

export async function getCandidates(server: string): Promise<Candidate[]> {
    return (await http.get<{ servers: Candidate[] }>(`${url(server)}/candidates`)).data.servers;
}

export async function link(server: string, input: LinkInput): Promise<{ linked: string; mode: ForwardingMode; restart: LinkedServer[] }> {
    return (await http.post(`${url(server)}/links`, input)).data;
}

export async function updateEntry(server: string, name: string, changes: EntryChanges): Promise<{ name: string }> {
    return (await http.patch(`${url(server)}/links/${name}`, changes)).data;
}

export async function unlink(server: string, name: string): Promise<LinkedServer[]> {
    return (await http.delete<{ restart: LinkedServer[] }>(`${url(server)}/links/${name}`)).data.restart;
}

export async function updateProxySettings(server: string, settings: { mode?: 'modern' | 'legacy'; onlineMode?: boolean; fixBind?: boolean }): Promise<{ failed: string[] }> {
    return (await http.patch(`${url(server)}/settings`, settings)).data;
}

export async function restartServers(server: string, servers: string[]): Promise<string[]> {
    return (await http.post<{ restarted: string[] }>(`${url(server)}/restart`, { servers })).data.restarted;
}

/** "My Survival Server" → "my-survival-server", a valid proxy server name. */
export function entryName(name: string): string {
    const slug = name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32);

    return /^[a-z0-9]/.test(slug) ? slug : `server-${slug}`.slice(0, 32);
}
