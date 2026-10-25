import type { ExtensionConfig } from '@pterodactyl/sdk';
import { createConfigStore } from './configStore';

/** The admin's Prism Backups settings, from Prism Properties. */
export interface BackupsConfig {
    enabled: boolean;
    ownersOnly: boolean;
    profiles: boolean;
    browse: boolean;
    fileRestore: boolean;
    pteroignore: boolean;
    maxProfiles: number;
    browseMaxBytes: number;
    restoreMaxBytes: number;
}

export function read(raw: ExtensionConfig): BackupsConfig {
    const get = (key: string) => (raw as Record<string, unknown>)[key];
    const bool = (key: string, fallback: boolean) => (typeof get(key) === 'boolean' ? (get(key) as boolean) : fallback);
    const num = (key: string, fallback: number) => Number(get(key)) || fallback;

    return {
        enabled: bool('enabled', true),
        ownersOnly: bool('owners_only', false),
        profiles: bool('feature_profiles', true),
        browse: bool('feature_browse', true),
        fileRestore: bool('feature_file_restore', true),
        pteroignore: bool('feature_pteroignore', true),
        maxProfiles: num('max_profiles', 10),
        browseMaxBytes: num('browse_max_mb', 4096) * 1048576,
        restoreMaxBytes: num('restore_max_mb', 1024) * 1048576,
    };
}

/** The settings, with Prism Core's live preview draft over them in its preview window. */
export const configStore = createConfigStore('prism-backups', read);

export const getConfig = () => configStore.get();

export function setConfig(raw: ExtensionConfig): void {
    configStore.set(raw);
}

let applied: unknown = null;

/** Takes the admin's current settings from the backend, so changes show without a reload. */
export function applyConfig(raw: unknown): void {
    if (!raw || raw === applied || typeof raw !== 'object' || Array.isArray(raw)) return;
    applied = raw;
    configStore.set(raw as ExtensionConfig);
}
