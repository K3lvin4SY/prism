import { http } from '@pterodactyl/sdk';
import schema from '../../../resources/settings.json';
import { base } from './client';

export interface SettingDefinition {
    key: string;
    kinds: string[];
    category: string;
    type: 'string' | 'int' | 'bool' | 'enum';
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
    /** False until the server has written ServerConfig.json on its first start. */
    exists: boolean;
    files: string[];
    values: Record<string, string>;
    eggBindings: Record<string, string | null>;
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
        case 'string':
            if (definition.maxLength && value.length > definition.maxLength) return `Use at most ${definition.maxLength} characters.`;
            if (definition.pattern && !new RegExp(definition.pattern).test(value)) return 'This value does not have the right shape; see the description.';
            if (/[\r\n]/.test(value)) return 'Must be a single line.';

            return null;
        default:
            return null;
    }
}
