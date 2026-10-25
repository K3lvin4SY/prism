import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

// Only the plain editor and JSON workers are bundled; other languages highlight without one.
(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
    getWorker: (_: string, label: string) => (label === 'json' ? new JsonWorker() : new EditorWorker()),
};

let probe: CanvasRenderingContext2D | null = null;

/**
 * Any CSS color as #rrggbbaa, which is all Monaco reads. Themes write their editor tokens as
 * oklch() or color-mix(), so the browser paints the color and the pixel is read back.
 */
function toHex(color: string): string | null {
    probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!probe || !color) return null;
    // A color the canvas cannot read leaves the fill as it was, this unlikely one.
    probe.fillStyle = '#010203';
    probe.fillStyle = color;
    if (probe.fillStyle === '#010203') return null;
    probe.clearRect(0, 0, 1, 1);
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;

    return `#${[r, g, b, a].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function token(name: string, fallback: string): string {
    return toHex(getComputedStyle(document.documentElement).getPropertyValue(name).trim()) ?? fallback;
}

/** Whether the panel is showing a dark scheme, from its background color. */
function panelIsDark(): boolean {
    const color = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g)?.map(Number) ?? [20, 20, 20];

    return (color[0] * 299 + color[1] * 587 + color[2] * 114) / 1000 < 140;
}

/** The colors each Monaco theme was last defined with, so it is only defined again when they change. */
const defined = new Map<string, string>();

/**
 * The Monaco theme to use: the panel's editor tokens over VS Code's dark or light theme. The
 * tokens are read each time, so a theme change or a preview reaches the editor.
 */
export function themeFor(setting: 'auto' | 'dark' | 'light' | 'contrast'): string {
    if (setting === 'contrast') return 'hc-black';
    const dark = setting === 'dark' || (setting === 'auto' && panelIsDark());
    const [name, base, background] = dark ? (['prism-dark', 'vs-dark', '#1e2530'] as const) : (['prism-light', 'vs', '#ffffff'] as const);
    const colors = {
        'editor.background': token('--editor-background', background),
        'editor.foreground': token('--editor-foreground', base === 'vs' ? '#1f2937' : '#d4d4d4'),
        'editor.lineHighlightBackground': token('--editor-active-line', base === 'vs' ? '#f3f4f6' : '#2a3240'),
        'editorLineNumber.foreground': token('--editor-muted', base === 'vs' ? '#9ca3af' : '#6b7280'),
        'editorCursor.foreground': token('--editor-caret', base === 'vs' ? '#111827' : '#e5e7eb'),
        'editor.selectionBackground': token('--editor-selection', base === 'vs' ? '#bfdbfe' : '#264f78'),
    };
    const key = JSON.stringify(colors);
    if (defined.get(name) !== key) {
        defined.set(name, key);
        monaco.editor.defineTheme(name, { base, inherit: true, rules: [], colors });
    }

    return name;
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
