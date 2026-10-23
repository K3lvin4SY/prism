import type { ExtensionConfig } from '@pterodactyl/sdk';
import { parsePatterns } from './lib/paths';

export interface EditorSettings {
    theme: 'auto' | 'dark' | 'light' | 'contrast';
    fontSize: number;
    tabSize: number;
    wordWrap: boolean;
    minimap: boolean;
    stickyScroll: boolean;
    bracketColors: boolean;
    autosave: 'off' | 'delay' | 'focus';
}

export type Keybinds = Record<'save' | 'saveAll' | 'quickOpen' | 'commandPalette' | 'closeTab' | 'reopenTab' | 'toggleExplorer' | 'goToLine', string>;

export interface FilesConfig {
    enabled: boolean;
    workbench: boolean;
    monacoEditPage: boolean;
    trash: boolean;
    openOn: 'files' | 'editor';
    defaultView: 'list' | 'grid';
    editor: EditorSettings;
    allowEditorSettings: boolean;
    trashDays: number;
    maxEditBytes: number;
    maxUploadBytes: number;
    parallelUploads: number;
    hidden: string[];
    protected: string[];
    protectAdmins: boolean;
    keybinds: Keybinds;
}

export const DEFAULT_KEYBINDS: Keybinds = {
    save: 'Ctrl+S',
    saveAll: 'Ctrl+Alt+S',
    quickOpen: 'Ctrl+P',
    commandPalette: 'Ctrl+Shift+P',
    closeTab: 'Alt+W',
    reopenTab: 'Ctrl+Shift+T',
    toggleExplorer: 'Ctrl+B',
    goToLine: 'Ctrl+G',
};

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const num = (value: unknown, fallback: number) => (typeof value === 'number' ? value : Number(value) || fallback);

function json<T>(value: unknown, fallback: T): T {
    if (typeof value !== 'string') return fallback;
    try {
        return { ...fallback, ...JSON.parse(value) } as T;
    } catch {
        return fallback;
    }
}

function read(raw: ExtensionConfig): FilesConfig {
    const get = (key: string) => (raw as Record<string, unknown>)[key];

    return {
        enabled: bool(get('enabled'), true),
        workbench: bool(get('workbench'), true),
        monacoEditPage: bool(get('monaco_edit_page'), true),
        trash: bool(get('trash'), true),
        openOn: get('open_on') === 'editor' ? 'editor' : 'files',
        defaultView: get('default_view') === 'grid' ? 'grid' : 'list',
        editor: {
            theme: (['auto', 'dark', 'light', 'contrast'].includes(String(get('editor_theme'))) ? get('editor_theme') : 'auto') as EditorSettings['theme'],
            fontSize: num(get('editor_font_size'), 13),
            tabSize: num(get('editor_tab_size'), 4),
            wordWrap: bool(get('editor_word_wrap'), false),
            minimap: bool(get('editor_minimap'), true),
            stickyScroll: bool(get('editor_sticky_scroll'), true),
            bracketColors: bool(get('editor_bracket_colors'), true),
            autosave: (['off', 'delay', 'focus'].includes(String(get('editor_autosave'))) ? get('editor_autosave') : 'off') as EditorSettings['autosave'],
        },
        allowEditorSettings: bool(get('allow_editor_settings'), true),
        trashDays: num(get('trash_days'), 7),
        maxEditBytes: num(get('max_edit_mb'), 4) * 1024 * 1024,
        maxUploadBytes: num(get('max_upload_mb'), 1024) * 1024 * 1024,
        parallelUploads: num(get('parallel_uploads'), 3),
        hidden: parsePatterns(String(get('hidden_paths') ?? '')),
        protected: parsePatterns(String(get('protected_paths') ?? '')),
        protectAdmins: bool(get('protect_admins'), false),
        keybinds: json<Keybinds>(get('keybinds'), DEFAULT_KEYBINDS),
    };
}

let config: FilesConfig = read({});

export function setConfig(raw: ExtensionConfig): void {
    config = read(raw);
}

export function getConfig(): FilesConfig {
    return config;
}
