import { http } from '@pterodactyl/sdk';
import type { Impact, Incident, IncidentStatus, State } from '../status/api';

export type { Impact, Incident, IncidentStatus, State };

export interface AdminComponent {
    id: number;
    type: 'node' | 'server';
    ref_id: number;
    /** The node's or server's own name, or null when it was deleted. */
    source: string | null;
    label: string;
    group: string;
    state: State;
    checked_at: string | null;
}

export interface Candidate {
    id: number;
    name: string;
    hint: string;
}

export interface AdminIncident extends Incident {
    announced: boolean;
}

const base = '/api/admin/extensions/prism-status';

export const componentsKey = ['prism-status', 'components'] as const;
export const incidentsKey = ['prism-status', 'incidents'] as const;

export const getComponents = async () => (await http.get<{ data: AdminComponent[] }>(`${base}/components`)).data.data;
export const getCandidates = async (type: 'node' | 'server', q: string) => (await http.get<{ data: Candidate[] }>(`${base}/candidates`, { params: { type, q } })).data.data;
export const addComponent = (input: { type: 'node' | 'server'; ref_id: number; label: string; group: string }) => http.post(`${base}/components`, input);
export const updateComponent = (id: number, input: { label: string; group: string }) => http.patch(`${base}/components/${id}`, input);
export const orderComponents = (ids: number[]) => http.put(`${base}/components/order`, { ids });
export const removeComponent = (id: number) => http.delete(`${base}/components/${id}`);

export const getIncidents = async () => (await http.get<{ data: AdminIncident[]; meta: { announce: boolean } }>(`${base}/incidents`)).data;
export const createIncident = (input: { title: string; impact: Impact; status: IncidentStatus; components: number[]; body: string; announce: boolean }) => http.post(`${base}/incidents`, input);
export const postUpdate = (id: number, input: { status: IncidentStatus; body: string }) => http.post(`${base}/incidents/${id}/updates`, input);
export const removeIncident = (id: number) => http.delete(`${base}/incidents/${id}`);
