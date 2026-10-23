import type { ExtensionConfig } from '@pterodactyl/sdk';
import type { HighlightSettings } from './lib/lines';

export type LayoutId = 'classic' | 'dashboard' | 'side' | 'monitor' | 'focus' | 'compact';

export interface QuickCommand {
    label: string;
    command: string;
    confirm: boolean;
    /** Egg tags the button shows for; empty shows it everywhere. */
    tags: string[];
}

export interface TerminalSettings {
    font: string;
    fontSize: number;
    lineHeight: number;
    wrap: boolean;
    timestamps: boolean;
}

/** The admin's PrismConsole settings, from Prism Properties. */
export interface ConsoleConfig {
    enabled: boolean;
    fullWidth: boolean;
    keepHeader: boolean;
    floatingProgress: boolean;
    maxLines: number;
    historyLimit: number;
    allow: { terminal: boolean; layouts: boolean; highlights: boolean; quickCommands: boolean };
    defaultLayout: LayoutId;
    features: { search: boolean; filters: boolean; export: boolean; charts: boolean; quickCommands: boolean; historySync: boolean; pullProgress: boolean };
    terminal: TerminalSettings;
    highlights: HighlightSettings;
    quickCommands: QuickCommand[];
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

let config: ConsoleConfig = read({});

export function read(raw: ExtensionConfig): ConsoleConfig {
    const get = (key: string) => (raw as Record<string, unknown>)[key];
    const layout = String(get('default_layout') ?? 'classic');

    return {
        enabled: bool(get('enabled'), true),
        fullWidth: bool(get('full_width'), true),
        keepHeader: bool(get('keep_header'), false),
        floatingProgress: bool(get('floating_progress'), true),
        maxLines: Math.max(200, num(get('max_lines'), 1000)),
        historyLimit: num(get('history_limit'), 50),
        allow: {
            terminal: bool(get('allow_terminal_settings'), true),
            layouts: bool(get('allow_layouts'), true),
            highlights: bool(get('allow_highlights'), true),
            quickCommands: bool(get('allow_quick_commands'), true),
        },
        defaultLayout: (['classic', 'dashboard', 'side', 'monitor', 'focus', 'compact'].includes(layout) ? layout : 'classic') as LayoutId,
        features: {
            search: bool(get('feature_search'), true),
            filters: bool(get('feature_filters'), true),
            export: bool(get('feature_export'), true),
            charts: bool(get('feature_charts'), true),
            quickCommands: bool(get('feature_quick_commands'), true),
            historySync: bool(get('feature_history_sync'), true),
            pullProgress: bool(get('feature_pull_progress'), true),
        },
        terminal: {
            font: String(get('default_font') ?? 'JetBrains Mono'),
            fontSize: num(get('default_font_size'), 13),
            lineHeight: num(get('default_line_height'), 1.4),
            wrap: bool(get('default_wrap'), true),
            timestamps: bool(get('default_timestamps'), false),
        },
        highlights: json<HighlightSettings>(get('highlights'), { builtin: {}, custom: [] }),
        quickCommands: json<QuickCommand[]>(get('quick_commands'), []),
    };
}

export function setConfig(raw: ExtensionConfig): void {
    config = read(raw);
}

export function getConfig(): ConsoleConfig {
    return config;
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
