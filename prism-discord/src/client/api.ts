import { http } from '@pterodactyl/sdk';

export interface HookEvent {
    key: string;
    label: string;
    default: string;
}

export interface Hook {
    id: number;
    name: string;
    /** Shortened, to tell webhooks apart; the address itself never comes back to the page. */
    webhook: string;
    events: string[];
    templates: Record<string, string>;
    mention_role: string | null;
    enabled: boolean;
    last_sent_at: string | null;
    last_error: string | null;
}

export interface Hooks {
    hooks: Hook[];
    events: HookEvent[];
    players: boolean;
    max: number;
}

export interface HookInput {
    name?: string;
    /** Left out or empty when changing a hook keeps its address. */
    webhook?: string;
    events?: string[];
    templates?: Record<string, string>;
    mention_role?: string | null;
    enabled?: boolean;
}

const base = (server: string) => `/api/client/servers/${server}/extensions/prism-discord`;

export const hooksKey = (server: string) => ['prism-discord', server, 'hooks'] as const;

export const getHooks = async (server: string) => (await http.get<{ data: Hooks }>(`${base(server)}/hooks`)).data.data;

export const createHook = async (server: string, input: HookInput) => (await http.post<{ data: Hook }>(`${base(server)}/hooks`, input)).data.data;

export const updateHook = async (server: string, id: number, input: HookInput) => (await http.patch<{ data: Hook }>(`${base(server)}/hooks/${id}`, input)).data.data;

export const deleteHook = (server: string, id: number) => http.delete(`${base(server)}/hooks/${id}`);

export const testHook = async (server: string, id: number, event: string) => (await http.post<{ data: Hook }>(`${base(server)}/hooks/${id}/test`, { event })).data.data;
