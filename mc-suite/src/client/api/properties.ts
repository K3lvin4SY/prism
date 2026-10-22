import { http } from '@pterodactyl/sdk';
import schema from '../../../resources/properties.json';
import { base } from './client';

export interface PropertyDefinition {
    key: string;
    editions: string[];
    category: string;
    type: 'motd' | 'string' | 'int' | 'bool' | 'enum';
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

export interface PropertyCategory {
    id: string;
    label: string;
    icon: string;
}

export const categories: PropertyCategory[] = schema.categories;
export const managedKeys: string[] = schema.managed;
const definitions = schema.properties as PropertyDefinition[];

export function definitionsFor(edition: string): PropertyDefinition[] {
    return definitions.filter((definition) => definition.editions.includes(edition));
}

export interface PropertiesResponse {
    exists: boolean;
    edition: 'java' | 'bedrock';
    /** Which property definitions apply: the edition, or pumpkin on Pumpkin servers. */
    schema: 'java' | 'bedrock' | 'pumpkin';
    /** server.properties, or pumpkin.toml on Pumpkin. */
    file: string;
    software: string | null;
    values: Record<string, string>;
    icon: string | null;
    serverName: string;
    canRename: boolean;
    /** Keys the egg rewrites on start: the startup variable they come from, or null when fixed. */
    eggBindings: Record<string, string | null>;
}

export async function getProperties(server: string): Promise<PropertiesResponse> {
    const { data } = await http.get<PropertiesResponse>(`${base(server)}/properties`);

    return data;
}

export async function updateProperties(server: string, values: Record<string, string | number | boolean>): Promise<Record<string, string>> {
    const { data } = await http.patch<{ changed: Record<string, string> }>(`${base(server)}/properties`, { values });

    return data.changed;
}

export async function uploadIcon(server: string, image: string): Promise<void> {
    await http.put(`${base(server)}/properties/icon`, { image });
}

export async function deleteIcon(server: string): Promise<void> {
    await http.delete(`${base(server)}/properties/icon`);
}

/** Renames the server in the Panel, through the core settings endpoint. */
export async function renameServer(server: string, name: string): Promise<void> {
    await http.post(`/api/client/servers/${server}/settings/rename`, { name });
}

/** Checks a value against its definition. Returns an error message or null. */
export function validate(definition: PropertyDefinition, value: string): string | null {
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
        case 'motd':
            if (definition.maxLength && value.length > definition.maxLength) return `Use at most ${definition.maxLength} characters.`;
            if (definition.pattern && value !== '' && !new RegExp(definition.pattern, 'u').test(value)) return 'This value is not allowed.';

            return null;
        default:
            return null;
    }
}
