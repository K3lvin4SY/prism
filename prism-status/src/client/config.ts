import type { ExtensionConfig } from '@pterodactyl/sdk';
import { createConfigStore } from './configStore';

/** Prism Status' settings from Prism Properties that the browser needs. */
export interface StatusConfig {
    enabled: boolean;
    requireSignIn: boolean;
}

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

export function read(raw: ExtensionConfig): StatusConfig {
    const get = (key: string) => (raw as Record<string, unknown>)[key];

    return { enabled: bool(get('enabled'), false), requireSignIn: bool(get('require_sign_in'), false) };
}

/** The settings, with Prism Core's live preview draft over them in its preview window. */
export const configStore = createConfigStore('prism-status', read);

export function setConfig(raw: ExtensionConfig): void {
    configStore.set(raw);
}

export function getConfig(): StatusConfig {
    return configStore.get();
}
