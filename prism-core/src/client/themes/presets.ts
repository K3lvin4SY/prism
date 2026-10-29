import builtins from './builtins.json';

/**
 * Presets: named sets of Prism Themes values. The built-in ones are written by
 * prism-themes/scripts/generate.py, which also makes Prism Slate the theme's defaults; people's own
 * are kept in the theme's `presets` setting.
 */
export type Values = Record<string, unknown>;

export interface Preset {
    id: string;
    name: string;
    description?: string;
    values: Values;
    builtIn?: boolean;
}

export interface Role {
    key: string;
    label: string;
    help: string | null;
    group: string;
}

export type Mode = 'd' | 'l';

export const ROLES: Role[] = builtins.roles;

export const BUILT_IN: Preset[] = (builtins.presets as Preset[]).map((preset) => ({ ...preset, builtIn: true }));

/** Settings that are not part of a theme's look: the name of its preset and the saved presets. */
export const BOOKKEEPING = ['preset', 'presets'];

export const isLook = (key: string) => !BOOKKEEPING.includes(key);

/** People's own presets from the `presets` setting; anything unreadable is left out. */
export function readCustom(value: unknown): Preset[] {
    try {
        const list = JSON.parse(typeof value === 'string' ? value : '[]') as unknown;

        return Array.isArray(list)
            ? list.filter((item): item is Preset => typeof item?.id === 'string' && typeof item?.name === 'string' && item?.values !== null && typeof item?.values === 'object').map((item) => ({ id: item.id, name: item.name, values: item.values }))
            : [];
    } catch {
        return [];
    }
}

export const writeCustom = (presets: Preset[]) => JSON.stringify(presets.map(({ id, name, values }) => ({ id, name, values })));

/** The look part of the current values, which a preset stores. */
export const lookOf = (values: Values): Values => Object.fromEntries(Object.entries(values).filter(([key]) => isLook(key) && key !== 'background_image'));

/** Whether the values are exactly this preset, ignoring what it does not set. */
export const matches = (preset: Preset, values: Values) => Object.entries(preset.values).every(([key, value]) => key === 'background_image' || JSON.stringify(values[key]) === JSON.stringify(value));

export const newId = () => `own-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
