import type { ExtensionConfig } from '@pterodactyl/sdk';
import { createConfigStore } from './configStore';

export type Api = 'client' | 'application' | 'admin';

export const APIS: { key: Api; label: string; help: string }[] = [
    { key: 'client', label: 'Panel and client API', help: 'While using the panel, and with their own API keys.' },
    { key: 'application', label: 'Application API', help: 'With Application API keys they own.' },
    { key: 'admin', label: 'Admin API', help: 'In the admin area.' },
];

/** The panel's per-server create limits, as Prism Tweaks names them (src/Support/Limits.php). */
export const RESOURCES: { key: string; label: string; panel: string }[] = [
    { key: 'backup_limit', label: 'Backups started', panel: '3 every 15 minutes' },
    { key: 'database_limit', label: 'Databases created', panel: '2 a minute' },
    { key: 'filepull_limit', label: 'Files downloaded from a link', panel: '5 every 10 minutes' },
    { key: 'subuser_limit', label: 'Subusers added', panel: '10 every 15 minutes' },
    { key: 'schedule_limit', label: 'Schedules created', panel: '2 a minute' },
    { key: 'allocation_limit', label: 'Allocations added', panel: '2 a minute' },
    { key: 'websocket_limit', label: 'Console connections opened', panel: '5 a minute' },
];

/** The numbers set for everyone in Prism Properties; null where the panel's own is kept. */
export interface TweaksConfig {
    api: Record<Api, number | null>;
    resources: Record<string, number | null>;
}

/** A whole number above zero, or null for "not set". */
export const positive = (value: unknown): number | null => {
    const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;

    return Number.isInteger(number) && number > 0 ? number : null;
};

export function read(raw: ExtensionConfig): TweaksConfig {
    const get = (key: string) => (raw as Record<string, unknown>)[key];

    return {
        api: { client: positive(get('client_limit')), application: positive(get('application_limit')), admin: positive(get('admin_limit')) },
        resources: Object.fromEntries(RESOURCES.map((resource) => [resource.key, positive(get(resource.key))])),
    };
}

/** The settings, with Prism Core's live preview draft over them in its preview window. */
export const configStore = createConfigStore('prism-tweaks', read);

export function setConfig(raw: ExtensionConfig): void {
    configStore.set(raw);
}

export function getConfig(): TweaksConfig {
    return configStore.get();
}
