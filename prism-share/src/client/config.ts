import type { ExtensionConfig } from '@pterodactyl/sdk';
import { createConfigStore } from './configStore';

/** Prism Share's settings from Prism Properties. */
export interface ShareConfig {
    enabled: boolean;
    maxHours: number;
}

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

export function read(raw: ExtensionConfig): ShareConfig {
    const get = (key: string) => (raw as Record<string, unknown>)[key];
    const hours = Number(get('max_hours'));

    return {
        enabled: bool(get('enabled'), true),
        maxHours: Number.isFinite(hours) && hours >= 1 ? Math.min(720, hours) : 168,
    };
}

/** The settings, with Prism Core's live preview draft over them in its preview window. */
export const configStore = createConfigStore('prism-share', read);

export function setConfig(raw: ExtensionConfig): void {
    configStore.set(raw);
}

export function getConfig(): ShareConfig {
    return configStore.get();
}
