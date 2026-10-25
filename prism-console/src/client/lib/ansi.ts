/** A run of console text in one style. Colors are CSS values. */
export interface Segment {
    text: string;
    fg?: string;
    bg?: string;
    bold?: boolean;
    dim?: boolean;
    italic?: boolean;
    underline?: boolean;
}

const NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

const named = (index: number, bright: boolean) => `var(--terminal-ansi-${bright ? 'bright-' : ''}${NAMES[index]})`;

/** The xterm 256-color palette entry, for 38;5;n. */
function palette(n: number): string {
    if (n < 8) return named(n, false);
    if (n < 16) return named(n - 8, true);
    if (n < 232) {
        const value = n - 16;
        const level = (step: number) => (step === 0 ? 0 : 55 + step * 40);

        return `rgb(${level(Math.floor(value / 36))}, ${level(Math.floor(value / 6) % 6)}, ${level(value % 6)})`;
    }

    const grey = 8 + (n - 232) * 10;

    return `rgb(${grey}, ${grey}, ${grey})`;
}

// CSI sequences (colors, cursor moves, clears) and OSC sequences (window titles).
// eslint-disable-next-line no-control-regex
const ESCAPES = /\x1b\[([0-9;?]*)([A-Za-z])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Za-z0-9]|\x1b[=>78]/g;

/** Splits a console line into styled segments. Only color and style codes are kept. */
export function parseAnsi(line: string): Segment[] {
    const segments: Segment[] = [];
    let style: Omit<Segment, 'text'> = {};
    let last = 0;

    const push = (text: string) => {
        // Carriage returns rewrite the line in a terminal; keep what was written last.
        const visible = text.includes('\r') ? text.slice(text.lastIndexOf('\r') + 1) : text;
        if (visible !== '') segments.push({ text: visible, ...style });
    };

    for (const match of line.matchAll(ESCAPES)) {
        push(line.slice(last, match.index));
        last = match.index! + match[0].length;
        if (match[2] !== 'm') continue;

        const codes = (match[1] === '' ? '0' : match[1]).split(';').map((code) => Number(code || 0));
        for (let i = 0; i < codes.length; i++) {
            const code = codes[i];
            if (code === 0) style = {};
            else if (code === 1) style = { ...style, bold: true };
            else if (code === 2) style = { ...style, dim: true };
            else if (code === 3) style = { ...style, italic: true };
            else if (code === 4) style = { ...style, underline: true };
            else if (code === 22) style = { ...style, bold: false, dim: false };
            else if (code === 23) style = { ...style, italic: false };
            else if (code === 24) style = { ...style, underline: false };
            else if (code >= 30 && code <= 37) style = { ...style, fg: named(code - 30, false) };
            else if (code >= 90 && code <= 97) style = { ...style, fg: named(code - 90, true) };
            else if (code >= 40 && code <= 47) style = { ...style, bg: named(code - 40, false) };
            else if (code >= 100 && code <= 107) style = { ...style, bg: named(code - 100, true) };
            else if (code === 39) style = { ...style, fg: undefined };
            else if (code === 49) style = { ...style, bg: undefined };
            else if (code === 38 || code === 48) {
                let color: string | undefined;
                if (codes[i + 1] === 5) {
                    color = palette(codes[i + 2] ?? 0);
                    i += 2;
                } else if (codes[i + 1] === 2) {
                    color = `rgb(${codes[i + 2] ?? 0}, ${codes[i + 3] ?? 0}, ${codes[i + 4] ?? 0})`;
                    i += 4;
                }
                style = code === 38 ? { ...style, fg: color } : { ...style, bg: color };
            }
        }
    }

    push(line.slice(last));

    return segments;
}

export function plainText(segments: Segment[]): string {
    return segments.map((segment) => segment.text).join('');
}
