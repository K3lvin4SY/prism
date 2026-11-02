import type { ExtensionConfig } from '@pterodactyl/sdk';
import { createConfigStore } from './configStore';

/** Prism Discord's settings from Prism Properties. */
export interface DiscordConfig {
    enabled: boolean;
    players: boolean;
    maxHooks: number;
}

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

export function read(raw: ExtensionConfig): DiscordConfig {
    const get = (key: string) => (raw as Record<string, unknown>)[key];
    const max = Number(get('max_hooks'));

    return {
        enabled: bool(get('enabled'), true),
        players: bool(get('players'), true),
        maxHooks: Number.isFinite(max) && max >= 1 ? Math.min(25, Math.floor(max)) : 5,
    };
}

/** The settings, with Prism Core's live preview draft over them in its preview window. */
export const configStore = createConfigStore('prism-discord', read);

export function setConfig(raw: ExtensionConfig): void {
    configStore.set(raw);
}

export function getConfig(): DiscordConfig {
    return configStore.get();
}
