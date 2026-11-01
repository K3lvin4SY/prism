import type { ExtensionConfig } from '@pterodactyl/sdk';
import { createConfigStore } from './configStore';

/** Prism Notes' settings from Prism Properties. */
export interface NotesConfig {
    enabled: boolean;
    maxNotes: number;
    consolePinned: boolean;
}

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

export function read(raw: ExtensionConfig): NotesConfig {
    const get = (key: string) => (raw as Record<string, unknown>)[key];
    const max = Number(get('max_notes'));

    return {
        enabled: bool(get('enabled'), true),
        maxNotes: Number.isFinite(max) && max >= 1 ? Math.min(200, Math.floor(max)) : 50,
        consolePinned: bool(get('console_pinned'), true),
    };
}

/** The settings, with Prism Core's live preview draft over them in its preview window. */
export const configStore = createConfigStore('prism-notes', read);

export function setConfig(raw: ExtensionConfig): void {
    configStore.set(raw);
}

export function getConfig(): NotesConfig {
    return configStore.get();
}
