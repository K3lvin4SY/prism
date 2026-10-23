import { useSyncExternalStore } from 'react';
import { notifyThemeChange } from '@pterodactyl/sdk';
import { useThemeSettings } from '@pterodactyl/sdk/theme';
import manifest from '../extension.json';

export type Bars = 'sidebar' | 'top' | 'dock' | 'sidebar_top' | 'rail' | 'rail_top' | 'top_dock';
export type CardStyle = 'banner' | 'tile' | 'neon' | 'minimal' | 'compact' | 'outline' | 'rows';

/** The theme's settings as the views read them; see extension.json for what each does. */
export interface PrismSettings {
    look: string;
    palette: string;
    bars: Bars;
    scheme_switch: boolean;
    dock_magnify: boolean;
    group_nav: boolean;
    server_card: boolean;
    cards: CardStyle;
    status_style: 'badge' | 'dot' | 'bar';
    usage_style: 'bars' | 'numbers' | 'hidden';
    egg_colors: boolean;
    power_buttons: boolean;
    background: string;
    announce_text: string;
    announce_level: 'info' | 'success' | 'warning' | 'danger';
    announce_style: 'bar' | 'card';
    announce_audience: 'everyone' | 'admins' | 'users';
    announce_link: string;
    announce_link_label: string;
    announce_from: string;
    announce_until: string;
    announce_dismiss: boolean;
    link1_label: string;
    link1_url: string;
    link2_label: string;
    link2_url: string;
    link3_label: string;
    link3_url: string;
    login_style: 'split' | 'centered' | 'classic';
    login_tagline: string;
    command_palette: boolean;
    admin_styled: boolean;
}

interface SettingDefinition {
    type: string;
    token?: string;
    attribute?: string;
    unit?: string;
    default?: unknown;
}

const definitions = manifest.theme.settings as Record<string, SettingDefinition>;

/*
 * Prism Properties shows the panel in a frame and sends the settings being edited, so the change
 * shows before it is saved. They are kept here, over the saved ones, only inside that frame.
 */
let preview: Partial<Record<string, unknown>> = {};
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => listeners.delete(listener);
};

/** The saved settings, with any being previewed laid over them. */
export function useSettings(): PrismSettings {
    const saved = useThemeSettings() as unknown as PrismSettings;
    const over = useSyncExternalStore(subscribe, () => preview, () => preview);

    return over === EMPTY ? saved : ({ ...saved, ...over } as PrismSettings);
}

const EMPTY = preview;

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

    preview = { ...preview, ...values };
    listeners.forEach((listener) => listener());
    notifyThemeChange();
}

export const PREVIEW_MESSAGE = 'prism-themes:preview';
export const READY_MESSAGE = 'prism-themes:ready';

export const PREVIEW_WINDOW = 'prism-themes-preview';

/**
 * In the preview window Prism Properties opens (the panel refuses to be framed): take the settings
 * being edited from the editor that opened it, and tell it when a page is ready for them.
 */
export function listenForPreview(): void {
    const editor = window.opener as Window | null;
    if (window.name !== PREVIEW_WINDOW || !editor) return;

    window.addEventListener('message', (event: MessageEvent) => {
        if (event.origin !== window.location.origin || event.source !== editor) return;
        const data = event.data as { type?: string; settings?: Record<string, unknown> } | null;
        if (data?.type === PREVIEW_MESSAGE && data.settings && typeof data.settings === 'object') applyPreview(data.settings);
    });

    try {
        editor.postMessage({ type: READY_MESSAGE }, window.location.origin);
    } catch {
        // The editor has gone; the saved settings show.
    }
}

/** A colour for a game, from its egg tag, so each game's cards look alike. */
export function eggColour(tags: readonly string[] | undefined): string | null {
    const tag = tags?.find((item) => item !== 'minecraft' || tags.length === 1) ?? tags?.[0];
    if (!tag) return null;
    let hash = 0;
    for (const char of tag) hash = (hash * 31 + char.charCodeAt(0)) % 360;

    return `oklch(0.66 0.15 ${hash})`;
}
