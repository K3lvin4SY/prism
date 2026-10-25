import { notifyThemeChange } from '@pterodactyl/sdk';
import { onDraft, readDraft } from './configStore';
import manifest from '../extension.json';

interface SettingDefinition {
    type: string;
    token?: string;
    attribute?: string;
    unit?: string;
    default?: unknown;
}

const definitions = manifest.theme.settings as Record<string, SettingDefinition>;

/** Writes each previewed setting to the token or <html> attribute the panel would write it to. */
export function applyPreview(values: Record<string, unknown>): void {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(values)) {
        const definition = definitions[key];
        if (!definition) continue;

        if (definition.token) {
            if (value === null || value === undefined || value === '') root.style.removeProperty(definition.token);
            else if (definition.type === 'image') root.style.setProperty(definition.token, `url("${String(value).replace(/["\\]/g, '')}")`);
            else root.style.setProperty(definition.token, `${String(value)}${definition.type === 'number' ? (definition.unit ?? '') : ''}`);
        }

        if (definition.attribute) root.setAttribute(definition.attribute, String(value ?? definition.default ?? ''));
    }

    notifyThemeChange();
}

/**
 * In Prism Core's preview window: show the draft kept from an earlier page, then each new one as
 * the editor sends it.
 */
export function followPreview(): void {
    const draft = readDraft('prism-themes');
    if (Object.keys(draft).length > 0) applyPreview(draft);
    onDraft('prism-themes', applyPreview);
}
