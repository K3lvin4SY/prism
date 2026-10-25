import { http } from '@pterodactyl/sdk';

export type FieldType = 'text' | 'password' | 'number' | 'toggle' | 'select' | 'color' | 'textarea' | 'multiselect' | 'list' | 'file';

export interface SettingField {
    input: string;
    label: string;
    help: string | null;
    tab: string | null;
    field: FieldType;
    options: { value: string | number | boolean; label: string }[];
    value: unknown;
}

export type PrismId = 'prism-layout' | 'prism-console' | 'prism-files' | 'prism-database' | 'prism-backups' | 'prism-schedules' | 'prism-mc' | 'prism-terraria';

export interface PrismExtension {
    id: PrismId;
    name: string;
    icon: string;
    description: string;
}

/** The Prism extensions this page knows; only the installed and enabled ones are shown. */
export const PRISM: PrismExtension[] = [
    { id: 'prism-layout', name: 'Prism Layout', icon: 'layout-dashboard', description: 'Navigation layouts, page width, server cards, your logo and favicon, the sign-in page, announcements and the Ctrl+K palette. Works with any theme.' },
    { id: 'prism-console', name: 'Prism Console', icon: 'terminal', description: 'A better console for every server: layouts, history, search, highlights, exports and image pull progress.' },
    { id: 'prism-files', name: 'Prism File Browser', icon: 'folder-open', description: 'A better file manager for every server: an editor workbench with tabs, a trash bin, bulk actions and previews.' },
    { id: 'prism-database', name: 'Prism Database Manager', icon: 'database', description: 'Browse and edit tables, run SQL, import and export, back up on a schedule and share databases between servers.' },
    { id: 'prism-backups', name: 'Prism Backups', icon: 'archive', description: 'Backup profiles, browsing inside backups, restoring single files and a .pteroignore editor.' },
    { id: 'prism-schedules', name: 'Prism Schedules', icon: 'calendar-clock', description: 'Schedules with countdowns, waits, Discord messages, If/Else, crash and start triggers, conditions, presets and a calendar.' },
    { id: 'prism-mc', name: 'Prism MC', icon: 'blocks', description: 'Players, versions, properties, plugins, mods and modpacks for Minecraft Java and Bedrock servers.' },
    { id: 'prism-terraria', name: 'Prism Terraria', icon: 'pickaxe', description: 'Players, settings, versions, the world map, tModLoader mods and TShock plugins for Terraria servers.' },
];

export const settingsKey = (id: PrismId) => ['prism-extensions', 'settings', id] as const;

/**
 * The extension's settings schema, or null when it is not installed or is disabled, in which
 * case it has not registered its settings.
 */
export async function getSettings(id: PrismId): Promise<SettingField[] | null> {
    try {
        const { data } = await http.get<{ data: { registered: boolean; schema: SettingField[] } }>(`/api/admin/extensions/${id}/settings`);

        return data.data.registered ? data.data.schema : null;
    } catch (error) {
        if ((error as { response?: { status?: number } }).response?.status === 404) return null;
        throw error;
    }
}

export async function saveSettings(id: PrismId, settings: Record<string, unknown>): Promise<SettingField[]> {
    const { data } = await http.patch<{ data: { schema: SettingField[] } }>(`/api/admin/extensions/${id}/settings`, { settings });

    return data.data.schema;
}

/** Uploads a file setting's file, or clears it with null; the file is saved straight away, not with the other changes. */
export async function setSettingFile(id: PrismId, input: string, file: File | null): Promise<SettingField[]> {
    const url = `/api/admin/extensions/${id}/settings/${input}/file`;
    if (file === null) return (await http.delete<{ data: { schema: SettingField[] } }>(url)).data.data.schema;

    const form = new FormData();
    form.append('file', file);

    return (await http.post<{ data: { schema: SettingField[] } }>(url, form)).data.data.schema;
}

/** Extensions with settings the panel caches, such as head tags, offer this to drop the cache after a save. */
export const REFRESHES: PrismId[] = ['prism-layout'];

export async function refresh(id: PrismId): Promise<void> {
    if (REFRESHES.includes(id)) await http.post(`/api/admin/extensions/${id}/refresh`).catch(() => undefined);
}
