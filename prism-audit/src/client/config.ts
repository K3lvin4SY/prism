import type { ExtensionConfig } from '@pterodactyl/sdk';
import { createConfigStore } from './configStore';

/** Prism Audit's settings from Prism Properties that the browser needs. */
export interface AuditConfig {
    alerts: boolean;
}

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

export function read(raw: ExtensionConfig): AuditConfig {
    const get = (key: string) => (raw as Record<string, unknown>)[key];

    return { alerts: bool(get('alerts'), true) };
}

/** The settings, with Prism Core's live preview draft over them in its preview window. */
export const configStore = createConfigStore('prism-audit', read);

export function setConfig(raw: ExtensionConfig): void {
    configStore.set(raw);
}

export function getConfig(): AuditConfig {
    return configStore.get();
}
