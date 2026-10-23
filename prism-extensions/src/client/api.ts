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

export type PrismId = 'prism-console' | 'prism-files' | 'prism-database';

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
