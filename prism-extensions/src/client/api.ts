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

export type PrismId = 'prism-console' | 'prism-files' | 'prism-database' | 'prism-branding';

export interface PrismExtension {
    id: PrismId;
    name: string;
    icon: string;
    description: string;
}

/** The Prism extensions this page knows; only the installed and enabled ones are shown. */
export const PRISM: PrismExtension[] = [
    { id: 'prism-console', name: 'PrismConsole', icon: 'terminal', description: 'A better console for every server: layouts, history, search, highlights, exports and image pull progress.' },
    { id: 'prism-files', name: 'Prism File Browser', icon: 'folder-open', description: 'A better file manager for every server: an editor workbench with tabs, a trash bin, bulk actions and previews.' },
    { id: 'prism-database', name: 'Prism Database Manager', icon: 'database', description: 'Browse and edit tables, run SQL, import and export, back up on a schedule and share databases between servers.' },
    { id: 'prism-branding', name: 'Prism Branding', icon: 'image', description: 'Your own favicon and logo: beside or instead of the company name, and on the sign-in pages in place of the mascot.' },
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
export const REFRESHES: PrismId[] = ['prism-branding'];

export async function refresh(id: PrismId): Promise<void> {
    if (REFRESHES.includes(id)) await http.post(`/api/admin/extensions/${id}/refresh`).catch(() => undefined);
}
