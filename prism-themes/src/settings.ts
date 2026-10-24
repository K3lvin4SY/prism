import { notifyThemeChange } from '@pterodactyl/sdk';
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

/** One preview window serves every Prism extension; each message names the extension it is for. */
export const PREVIEW_WINDOW = 'prism-preview';
export const PREVIEW_MESSAGE = 'prism-preview';
export const READY_MESSAGE = 'prism-preview:ready';

/**
 * In the preview window Prism Properties opens (the panel refuses to be framed): take the settings
 * being edited from the editor that opened it, and tell it when a page is ready for them.
 */
export function listenForPreview(): void {
    const editor = window.opener as Window | null;
    if (window.name !== PREVIEW_WINDOW || !editor) return;

    window.addEventListener('message', (event: MessageEvent) => {
        if (event.origin !== window.location.origin || event.source !== editor) return;
        const data = event.data as { type?: string; extension?: string; settings?: Record<string, unknown> } | null;
        if (data?.type === PREVIEW_MESSAGE && data.extension === 'prism-themes' && data.settings && typeof data.settings === 'object') applyPreview(data.settings);
    });

    try {
        editor.postMessage({ type: READY_MESSAGE, extension: 'prism-themes' }, window.location.origin);
    } catch {
        // The editor has gone; the saved settings show.
    }
}
