import { http } from '@pterodactyl/sdk';
import type { Properties } from './lib/describe';

export interface Person {
    id: number;
    username: string;
    email: string;
    admin: boolean;
}

export interface Subject {
    type: string;
    id: number;
    label: string;
    /** A server's short id, for its link. */
    short: string | null;
}

export interface Entry {
    id: number;
    event: string;
    timestamp: string;
    ip: string;
    description: string | null;
    /** Null for the system, or for sign-ins where the person is the subject. */
    actor: Person | null;
    /** Done through an API key. */
    api: boolean;
    subjects: Subject[];
    properties: Properties;
}

export interface Alert {
    id: number;
    rule: 'new_ip' | 'failed' | 'two_factor' | 'admin';
    summary: string;
    ip: string | null;
    user_id: number | null;
    activity_log_id: number | null;
    created_at: string;
    read: boolean;
}

export interface Picked {
    id: number;
    label: string;
}

export interface Filters {
    user: Picked | null;
    server: Picked | null;
    family: '' | 'auth' | 'user' | 'server' | 'admin' | 'other';
    event: string;
    ip: string;
    from: string;
    to: string;
    q: string;
}

export const NO_FILTERS: Filters = { user: null, server: null, family: '', event: '', ip: '', from: '', to: '', q: '' };

const base = '/api/admin/extensions/prism-audit';

/** The filters as query parameters, leaving out the empty ones. */
export function params(filters: Filters): Record<string, string> {
    const all: Record<string, string | number | undefined> = {
        user: filters.user?.id,
        server: filters.server?.id,
        family: filters.family,
        event: filters.event,
        ip: filters.ip.trim(),
        from: filters.from,
        to: filters.to,
        q: filters.q.trim(),
    };

    return Object.fromEntries(Object.entries(all).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => [key, String(value)]));
}

export const eventsKey = (filters: Filters) => ['prism-audit', 'events', params(filters)] as const;
export const alertsKey = ['prism-audit', 'alerts'] as const;
export const filtersKey = ['prism-audit', 'filters'] as const;

export async function getEvents(filters: Filters, before: number | null) {
    const { data } = await http.get<{ data: Entry[]; meta: { next: number | null } }>(`${base}/events`, { params: { ...params(filters), ...(before ? { before } : {}) } });

    return data;
}

export const exportUrl = (filters: Filters) => `${base}/events/export?${new URLSearchParams(params(filters)).toString()}`;

export const getEventNames = async () => (await http.get<{ data: { events: string[] } }>(`${base}/filters`)).data.data.events;

export const lookup = async (type: 'user' | 'server', q: string) => (await http.get<{ data: (Picked & { hint: string })[] }>(`${base}/lookup`, { params: { type, q } })).data.data;

export const getAlerts = async () => (await http.get<{ data: Alert[]; meta: { unread: number; enabled: boolean } }>(`${base}/alerts`)).data;
export const readAlerts = () => http.post(`${base}/alerts/read`);
