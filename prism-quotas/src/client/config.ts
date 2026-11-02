import type { ExtensionConfig } from '@pterodactyl/sdk';
import { createConfigStore } from './configStore';

/** Prism Quotas' settings from Prism Properties. */
export interface QuotasConfig {
    enabled: boolean;
    who: 'everyone' | 'listed';
    allowDelete: boolean;
}

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

export function read(raw: ExtensionConfig): QuotasConfig {
    const get = (key: string) => (raw as Record<string, unknown>)[key];

    return {
        enabled: bool(get('enabled'), false),
        who: get('who') === 'listed' ? 'listed' : 'everyone',
        allowDelete: bool(get('allow_delete'), true),
    };
}

/** The settings, with Prism Core's live preview draft over them in its preview window. */
export const configStore = createConfigStore('prism-quotas', read);

export function setConfig(raw: ExtensionConfig): void {
    configStore.set(raw);
}

export function getConfig(): QuotasConfig {
    return configStore.get();
}
