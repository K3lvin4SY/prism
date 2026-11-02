import type { Component, Impact, IncidentStatus, Overall, State } from './api';

export const OVERALL: Record<Overall, string> = {
    ok: 'Everything is running',
    minor: 'Some things are not running as they should',
    major: 'Something is down',
    maintenance: 'Maintenance in progress',
};

export const STATES: Record<State, string> = {
    up: 'Up',
    degraded: 'Starting',
    down: 'Down',
    maintenance: 'Maintenance',
    unknown: 'Not checked yet',
};

export const IMPACTS: Record<Impact, string> = { maintenance: 'Maintenance', minor: 'Minor incident', major: 'Major outage' };

export const STATUSES: Record<IncidentStatus, string> = {
    investigating: 'Investigating',
    identified: 'Cause found',
    monitoring: 'Monitoring',
    resolved: 'Resolved',
};

/** A day's bar color: fully up, mostly up, partly up, mostly down, or no data. */
export function barTone(share: number | null): 'none' | 'up' | 'minor' | 'major' | 'down' {
    if (share === null) return 'none';
    if (share >= 0.999) return 'up';
    if (share >= 0.95) return 'minor';
    if (share >= 0.5) return 'major';

    return 'down';
}

/** "99.95%", "100%", or "No data". */
export function uptimeText(uptime: number | null): string {
    if (uptime === null) return 'No data';

    return `${Number.isInteger(uptime) ? uptime : uptime.toFixed(2).replace(/0$/, '')}%`;
}

/** The date of the nth bar, counted from the first day shown. */
export function dayAt(first: string, index: number): Date {
    const [year, month, day] = first.split('-').map(Number);

    return new Date(year, month - 1, day + index);
}

/** Components in their groups, in the order given; components without a group come first. */
export function grouped(components: Component[]): { name: string; components: Component[] }[] {
    const groups: { name: string; components: Component[] }[] = [];
    for (const component of components) {
        let group = groups.find((item) => item.name === component.group);
        if (!group) {
            group = { name: component.group, components: [] };
            groups.push(group);
        }
        group.components.push(component);
    }

    return groups.sort((a, b) => (a.name === '' ? -1 : b.name === '' ? 1 : 0));
}
