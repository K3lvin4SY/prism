export type State = 'up' | 'degraded' | 'down' | 'maintenance' | 'unknown';
export type Overall = 'ok' | 'minor' | 'major' | 'maintenance';
export type Impact = 'maintenance' | 'minor' | 'major';
export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';

export interface Component {
    id: number;
    label: string;
    group: string;
    state: State;
    /** Percent up over the shown days, or null before the first check. */
    uptime: number | null;
    /** One per day, oldest first: the share of checks that were up, or null without checks. */
    days: (number | null)[];
}

export interface IncidentUpdate {
    id: number;
    status: IncidentStatus;
    body: string;
    created_at: string;
}

export interface Incident {
    id: number;
    title: string;
    impact: Impact;
    status: IncidentStatus;
    components: number[];
    started_at: string;
    resolved_at: string | null;
    updates: IncidentUpdate[];
}

export interface Summary {
    title: string;
    intro: string;
    logo: string | null;
    overall: Overall;
    first_day: string;
    components: Component[];
    incidents: { active: Incident[]; recent: Incident[] };
    updated_at: string;
}

export async function getSummary(): Promise<Summary> {
    const response = await fetch('/status/api/summary', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    if (!response.ok) throw new Error(response.status === 429 ? 'Too many refreshes. Try again in a minute.' : 'The status could not be loaded.');

    return ((await response.json()) as { data: Summary }).data;
}
