import type { ExtensionConfig } from '@pterodactyl/sdk';

/** The admin's Prism Schedules settings, from Prism Properties. */
export interface SchedulesConfig {
    enabled: boolean;
    defaultView: 'plus' | 'classic';
    discord: boolean;
    stateTriggers: boolean;
    emptyTrigger: boolean;
    maxSchedules: number;
    maxSteps: number;
    historyDays: number;
}

export function read(raw: ExtensionConfig): SchedulesConfig {
    const get = (key: string) => (raw as Record<string, unknown>)[key];
    const bool = (key: string, fallback: boolean) => (typeof get(key) === 'boolean' ? (get(key) as boolean) : fallback);
    const num = (key: string, fallback: number) => Number(get(key)) || fallback;

    return {
        enabled: bool('enabled', true),
        defaultView: get('default_view') === 'classic' ? 'classic' : 'plus',
        discord: bool('feature_discord', true),
        stateTriggers: bool('feature_state_triggers', true),
        emptyTrigger: bool('feature_empty_trigger', true),
        maxSchedules: num('max_schedules', 25),
        maxSteps: num('max_steps', 50),
        historyDays: num('history_days', 7),
    };
}

let config: SchedulesConfig = read({});

export const getConfig = () => config;

export function setConfig(raw: ExtensionConfig): void {
    config = read(raw);
}

let applied: unknown = null;

/** Takes the admin's current settings from the backend, so changes show without a reload. */
export function applyConfig(raw: unknown): void {
    if (!raw || raw === applied || typeof raw !== 'object' || Array.isArray(raw)) return;
    applied = raw;
    config = read(raw as ExtensionConfig);
}
