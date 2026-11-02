import type { ExtensionConfig } from '@pterodactyl/sdk';
import { createConfigStore } from './configStore';

/** Prism Mail's settings from Prism Properties that the browser needs. */
export interface MailConfig {
    enabled: boolean;
}

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

export function read(raw: ExtensionConfig): MailConfig {
    const get = (key: string) => (raw as Record<string, unknown>)[key];

    return { enabled: bool(get('enabled'), true) };
}

/** The settings, with Prism Core's live preview draft over them in its preview window. */
export const configStore = createConfigStore('prism-mail', read);

export function setConfig(raw: ExtensionConfig): void {
    configStore.set(raw);
}

export function getConfig(): MailConfig {
    return configStore.get();
}
