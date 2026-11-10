import type { ExtensionConfig } from '@pterodactyl/sdk';
import { createConfigStore } from './configStore';
import type { HighlightSettings } from './lib/lines';

export type LayoutId = 'classic' | 'dashboard' | 'side' | 'monitor' | 'focus' | 'compact';

export type FilterStyle = 'switch' | 'pills';

/** A button above the command line, kept for one server and shared by everyone on it. */
export interface QuickCommand {
    id: number;
    label: string | null;
    command: string;
    confirm: boolean;
}

export interface TerminalSettings {
    font: string;
    fontSize: number;
    lineHeight: number;
    wrap: boolean;
    timestamps: boolean;
}

/** The admin's Prism Console settings, from Prism Properties. */
export interface ConsoleConfig {
    enabled: boolean;
    fullWidth: boolean;
    keepHeader: boolean;
    floatingProgress: boolean;
    maxLines: number;
    historyLimit: number;
    allow: { terminal: boolean; layouts: boolean; highlights: boolean };
    defaultLayout: LayoutId;
    features: { search: boolean; filters: boolean; filterStyle: FilterStyle; export: boolean; charts: boolean; quickCommands: boolean; historySync: boolean; pullProgress: boolean };
    terminal: TerminalSettings;
    highlights: HighlightSettings;
}

function json<T>(value: unknown, fallback: T): T {
    if (typeof value !== 'string') return (value as T) ?? fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || fallback);

/** The settings, with Prism Core's live preview draft over them in its preview window. */
export const configStore = createConfigStore('prism-console', read);

export function read(raw: ExtensionConfig): ConsoleConfig {
    const get = (key: string) => (raw as Record<string, unknown>)[key];
    const layout = String(get('default_layout') ?? 'classic');

    return {
        enabled: bool(get('enabled'), true),
        fullWidth: bool(get('full_width'), false),
        keepHeader: bool(get('keep_header'), true),
        floatingProgress: bool(get('floating_progress'), true),
        maxLines: Math.max(200, num(get('max_lines'), 1000)),
        historyLimit: num(get('history_limit'), 50),
        allow: {
            terminal: bool(get('allow_terminal_settings'), true),
            layouts: bool(get('allow_layouts'), true),
            highlights: bool(get('allow_highlights'), true),
        },
        defaultLayout: (['classic', 'dashboard', 'side', 'monitor', 'focus', 'compact'].includes(layout) ? layout : 'classic') as LayoutId,
        features: {
            search: bool(get('feature_search'), true),
            filters: bool(get('feature_filters'), true),
            filterStyle: get('filter_style') === 'pills' ? 'pills' : 'switch',
            export: bool(get('feature_export'), true),
            charts: bool(get('feature_charts'), true),
            quickCommands: bool(get('feature_quick_commands'), true),
            historySync: bool(get('feature_history_sync'), true),
            pullProgress: bool(get('feature_pull_progress'), false),
        },
        terminal: {
            font: String(get('default_font') ?? 'JetBrains Mono'),
            fontSize: num(get('default_font_size'), 13),
            lineHeight: num(get('default_line_height'), 1.4),
            wrap: bool(get('default_wrap'), false),
            timestamps: bool(get('default_timestamps'), false),
        },
        highlights: json<HighlightSettings>(get('highlights'), { builtin: {}, custom: [] }),
    };
}

export function setConfig(raw: ExtensionConfig): void {
    configStore.set(raw);
}

let applied: unknown = null;

/** Takes the admin's current settings from the backend, so changes show without a reload. */
export function applyConfig(raw: unknown): void {
    if (!raw || raw === applied || typeof raw !== 'object' || Array.isArray(raw)) return;
    applied = raw;
    configStore.set(raw as ExtensionConfig);
}

export function getConfig(): ConsoleConfig {
    return configStore.get();
}

/** Google Fonts families for the monospace fonts people can pick. */
export const FONT_FAMILIES: Record<string, string> = {
    'JetBrains Mono': 'JetBrains+Mono:wght@400;700',
    'Fira Code': 'Fira+Code:wght@400;700',
    'Source Code Pro': 'Source+Code+Pro:wght@400;700',
    'IBM Plex Mono': 'IBM+Plex+Mono:wght@400;700',
    'Roboto Mono': 'Roboto+Mono:wght@400;700',
    'Ubuntu Mono': 'Ubuntu+Mono:wght@400;700',
    Inconsolata: 'Inconsolata:wght@400;700',
    'Space Mono': 'Space+Mono:wght@400;700',
    'DM Mono': 'DM+Mono:wght@400;500',
};

export const FONTS = [...Object.keys(FONT_FAMILIES), 'System monospace'];

/** Loads a web font once, so the terminal can use it. */
export function loadFont(font: string): string {
    const family = FONT_FAMILIES[font];
    if (family && !document.querySelector(`link[data-prism-font="${font}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
        link.dataset.prismFont = font;
        document.head.appendChild(link);
    }

    return family ? `"${font}", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` : 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
}
