import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

// Only the plain editor and JSON workers are bundled; other languages highlight without one.
(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
    getWorker: (_: string, label: string) => (label === 'json' ? new JsonWorker() : new EditorWorker()),
};

function token(name: string, fallback: string): string {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    return /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

/** Whether the panel is showing a dark scheme, from its background colour. */
function panelIsDark(): boolean {
    const colour = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g)?.map(Number) ?? [20, 20, 20];

    return (colour[0] * 299 + colour[1] * 587 + colour[2] * 114) / 1000 < 140;
}

let defined = false;

/** The Monaco theme to use: the panel's editor tokens over VS Code's dark or light theme. */
export function themeFor(setting: 'auto' | 'dark' | 'light' | 'contrast'): string {
    if (setting === 'contrast') return 'hc-black';
    const dark = setting === 'dark' || (setting === 'auto' && panelIsDark());
    if (!defined) {
        defined = true;
        for (const [name, base, background] of [
            ['prism-dark', 'vs-dark', '#1e2530'],
            ['prism-light', 'vs', '#ffffff'],
        ] as const) {
            monaco.editor.defineTheme(name, {
                base,
                inherit: true,
                rules: [],
                colors: {
                    'editor.background': token('--editor-background', background),
                    'editor.foreground': token('--editor-foreground', base === 'vs' ? '#1f2937' : '#d4d4d4'),
                    'editor.lineHighlightBackground': token('--editor-active-line', base === 'vs' ? '#f3f4f6' : '#2a3240'),
                    'editorLineNumber.foreground': token('--editor-muted', base === 'vs' ? '#9ca3af' : '#6b7280'),
                    'editorCursor.foreground': token('--editor-caret', base === 'vs' ? '#111827' : '#e5e7eb'),
                    'editor.selectionBackground': token('--editor-selection', base === 'vs' ? '#bfdbfe' : '#264f78'),
                },
            });
        }
    }

    return dark ? 'prism-dark' : 'prism-light';
}

/** Turns "Ctrl+Shift+P" into a Monaco keybinding. */
export function keybinding(chord: string): number | null {
    if (!chord) return null;
    let binding = 0;
    for (const part of chord.split('+').map((piece) => piece.trim())) {
        const lower = part.toLowerCase();
        if (lower === 'ctrl' || lower === 'cmd' || lower === 'meta') binding |= monaco.KeyMod.CtrlCmd;
        else if (lower === 'shift') binding |= monaco.KeyMod.Shift;
        else if (lower === 'alt') binding |= monaco.KeyMod.Alt;
        else if (/^[a-z]$/i.test(part)) binding |= monaco.KeyCode[`Key${part.toUpperCase()}` as keyof typeof monaco.KeyCode] as number;
        else if (/^\d$/.test(part)) binding |= monaco.KeyCode[`Digit${part}` as keyof typeof monaco.KeyCode] as number;
        else if (/^F\d{1,2}$/i.test(part)) binding |= monaco.KeyCode[part.toUpperCase() as keyof typeof monaco.KeyCode] as number;
        else return null;
    }

    return binding;
}

/** Whether a keyboard event is the chord, for shortcuts outside the editor. */
export function matchesChord(event: KeyboardEvent, chord: string): boolean {
    if (!chord) return false;
    const parts = chord.toLowerCase().split('+');
    const key = parts[parts.length - 1];

    return (
        (event.ctrlKey || event.metaKey) === (parts.includes('ctrl') || parts.includes('cmd') || parts.includes('meta')) &&
        event.shiftKey === parts.includes('shift') &&
        event.altKey === parts.includes('alt') &&
        event.key.toLowerCase() === key
    );
}

export default monaco;
