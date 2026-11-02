import type { ExtensionConfig } from '@pterodactyl/sdk';
import { createConfigStore } from './configStore';

/** Prism Roles' settings from Prism Properties. */
export interface RolesConfig {
    enabled: boolean;
    personal: boolean;
    maxPersonal: number;
}

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

export function read(raw: ExtensionConfig): RolesConfig {
    const get = (key: string) => (raw as Record<string, unknown>)[key];
    const max = Number(get('max_personal'));

    return {
        enabled: bool(get('enabled'), true),
        personal: bool(get('personal'), true),
        maxPersonal: Number.isFinite(max) && max >= 1 ? Math.min(100, Math.floor(max)) : 20,
    };
}

/** The settings, with Prism Core's live preview draft over them in its preview window. */
export const configStore = createConfigStore('prism-roles', read);

export function setConfig(raw: ExtensionConfig): void {
    configStore.set(raw);
}

export function getConfig(): RolesConfig {
    return configStore.get();
}
