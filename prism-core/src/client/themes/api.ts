import { http } from '@pterodactyl/sdk';

export const THEME_ID = 'prism-themes';

export interface ThemeInfo {
    id: string;
    name: string;
    enabled: boolean;
    active: boolean;
    previewing: boolean;
    problem: string | null;
}

export interface ThemeSetting {
    key: string;
    type: 'color' | 'select' | 'toggle' | 'number' | 'text' | 'image';
    label: string;
    help: string | null;
    tab: string | null;
    default: unknown;
    value: unknown;
    options: Record<string, string> | { value: string; label: string }[];
    min: number | null;
    max: number | null;
    step: number | null;
    unit: string | null;
    max_length: number | null;
}

type Settings = { data: { attributes: ThemeSetting }[] };
const settingsUrl = `/api/admin/themes/${THEME_ID}/settings`;
const unwrap = (data: Settings) => data.data.map((item) => item.attributes);

export const themeKeys = {
    themes: ['prism-core', 'themes'] as const,
    settings: ['prism-core', 'themes', THEME_ID, 'settings'] as const,
};

export const themeApi = {
    themes: async () => {
        const { data } = await http.get<{ data: { attributes: ThemeInfo }[]; meta: { active: string; preview: string | null } }>('/api/admin/themes');

        return { themes: data.data.map((item) => item.attributes), active: data.meta.active, preview: data.meta.preview };
    },
    settings: async () => unwrap((await http.get<Settings>(settingsUrl)).data),
    save: async (settings: Record<string, unknown>) => unwrap((await http.patch<Settings>(settingsUrl, { settings })).data),
    image: async (key: string, file: File | null) => {
        const url = `${settingsUrl}/${key}/image`;
        if (!file) return unwrap((await http.delete<Settings>(url)).data);
        const form = new FormData();
        form.append('file', file);

        return unwrap((await http.post<Settings>(url, form)).data);
    },
    preview: () => http.post(`/api/admin/themes/${THEME_ID}/preview`),
    stopPreview: () => http.delete('/api/admin/themes/preview'),
    activate: (id: string) => http.post(`/api/admin/themes/${id}/activate`),
};

/** Select options as value/label pairs, whichever shape the panel sends them in. */
export function optionsOf(setting: ThemeSetting): { value: string; label: string }[] {
    if (Array.isArray(setting.options)) return setting.options.map((option) => ({ value: String(option.value), label: option.label }));

    return Object.entries(setting.options ?? {}).map(([value, label]) => ({ value, label }));
}
