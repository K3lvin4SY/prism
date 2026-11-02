import { http } from '@pterodactyl/sdk';

export interface Limits {
    servers: number;
    /** MiB across all servers. */
    memory: number;
    disk: number;
    /** Percent of a thread across all servers. */
    cpu: number;
    /** Per server. */
    backups: number;
    databases: number;
    allocations: number;
}

export interface Usage {
    servers: number;
    memory: number;
    disk: number;
    cpu: number;
}

export interface MyOffer {
    id: number;
    label: string;
    description: string;
    locations: { id: number; name: string }[];
}

export interface MyServer {
    id: number;
    name: string;
    short: string;
    memory: number;
    disk: number;
    cpu: number;
    status: string | null;
}

export interface Me {
    allowed: boolean;
    reason: string | null;
    limits: Limits | null;
    usage: Usage;
    remaining: Usage | null;
    minimum: { memory: number; disk: number; cpu: number };
    offers: MyOffer[];
    servers: MyServer[];
    can_delete: boolean;
}

export interface Offer {
    id: number;
    egg_id: number;
    egg: string | null;
    label: string;
    description: string;
    image: string;
    /** Empty for every location. */
    locations: number[];
}

export interface Overview {
    default: Limits;
    users: { user: { id: number; username: string | null; email: string | null }; limits: Limits; usage: Usage | null }[];
    offers: Offer[];
    eggs: { id: number; name: string; images: Record<string, string> }[];
    locations: { id: number; name: string; description: string | null }[];
}

export type OfferInput = Omit<Offer, 'id' | 'egg'>;

const client = '/api/client/extensions/prism-quotas';
const admin = '/api/admin/extensions/prism-quotas';

export const meKey = ['prism-quotas', 'me'] as const;
export const overviewKey = ['prism-quotas', 'overview'] as const;

export const getMe = async () => (await http.get<{ data: Me }>(`${client}/me`)).data.data;
export const createServer = async (input: { name: string; offer_id: number; location_id: number; memory: number; disk: number; cpu: number }) =>
    (await http.post<{ data: { id: number; short: string; name: string } }>(`${client}/servers`, input)).data.data;
export const deleteServer = (id: number, confirm: string) => http.delete(`${client}/servers/${id}`, { data: { confirm } });

export const getOverview = async () => (await http.get<{ data: Overview }>(`${admin}/overview`)).data.data;
export const saveDefault = (limits: Limits) => http.put(`${admin}/limits/default`, limits);
export const saveUserLimits = (user: number, limits: Limits) => http.put(`${admin}/limits/${user}`, limits);
export const removeUserLimits = (user: number) => http.delete(`${admin}/limits/${user}`);
export const findUsers = async (q: string) => (await http.get<{ data: { id: number; username: string; email: string }[] }>(`${admin}/users`, { params: { q } })).data.data;
export const saveOffer = (input: OfferInput, id?: number) => (id ? http.patch(`${admin}/offers/${id}`, input) : http.post(`${admin}/offers`, input));
export const removeOffer = (id: number) => http.delete(`${admin}/offers/${id}`);
