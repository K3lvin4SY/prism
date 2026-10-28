import { http } from '@pterodactyl/sdk';
import schema from '../../../resources/settings.json';
import { base } from './client';

export interface SettingDefinition {
    key: string;
    kinds: string[];
    category: string;
    type: 'string' | 'int' | 'bool' | 'enum' | 'secret';
    label: string;
    description: string;
    default: string | number | boolean;
    min?: number;
    max?: number;
    maxLength?: number;
    pattern?: string;
    options?: string[];
    optionLabels?: Record<string, string>;
}

export interface SettingCategory {
    id: string;
    label: string;
    icon: string;
}

export const categories: SettingCategory[] = schema.categories;
export const managedKeys: string[] = schema.managed;
const definitions = schema.settings as SettingDefinition[];

export function definitionsFor(kind: string): SettingDefinition[] {
    return definitions.filter((definition) => definition.kinds.includes(kind));
}

export interface SettingsResponse {
    kind: string;
    exists: boolean;
    /** Whether the server is running; its own settings can only be read and changed then. */
    running: boolean;
    /** Whether the server's API answers, has an admin yet, and takes the Panel's password. */
    api: { reachable: boolean; claimed: boolean | null; connected: boolean; error?: string };
    files: string[];
    values: Record<string, string>;
    eggBindings: Record<string, string | null>;
    /** Secret keys with a saved value. */
    secrets: Record<string, boolean>;
    game: { running: boolean; session: string; autoLoad: string; tier: number; duration: number } | null;
    sessions: { name: string; saves: { name: string; saved: number | null; playTime: number }[] }[];
    /** Starting locations for a new game. */
    locations: string[];
}

export async function getSettings(server: string): Promise<SettingsResponse> {
    return (await http.get<SettingsResponse>(`${base(server)}/properties`)).data;
}

export async function updateSettings(server: string, values: Record<string, string>): Promise<Record<string, string>> {
    return (await http.patch<{ changed: Record<string, string> }>(`${base(server)}/properties`, { values })).data.changed;
}

/** Checks a value against its definition. Returns an error message or null. */
export function validate(definition: SettingDefinition, value: string): string | null {
    switch (definition.type) {
        case 'int': {
            if (!/^-?\d+$/.test(value.trim())) return 'Must be a whole number.';
            const number = Number(value);
            if (number < (definition.min ?? -Infinity) || number > (definition.max ?? Infinity)) {
                return `Must be between ${definition.min} and ${definition.max}.`;
            }

            return null;
        }
        case 'secret':
        case 'string':
            if (definition.maxLength && value.length > definition.maxLength) return `Use at most ${definition.maxLength} characters.`;
            if (definition.pattern && !new RegExp(definition.pattern).test(value)) return 'This value does not have the right shape; see the description.';
            if (/[\r\n]/.test(value)) return 'Must be a single line.';

            return null;
        default:
            return null;
    }
}

export async function connect(server: string, password: string): Promise<void> {
    await http.post(`${base(server)}/properties/connect`, { password });
}

export async function claim(server: string, name: string, password: string): Promise<void> {
    await http.post(`${base(server)}/properties/claim`, { name, password });
}

export async function disconnect(server: string): Promise<void> {
    await http.post(`${base(server)}/properties/disconnect`);
}

export async function newGame(server: string, session: string, location: string, skipTutorial: boolean): Promise<void> {
    await http.post(`${base(server)}/properties/new-game`, { session, location, skipTutorial });
}

export async function saveGame(server: string, name: string): Promise<void> {
    await http.post(`${base(server)}/properties/save-game`, { name });
}
