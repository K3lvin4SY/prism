/**
 * Editing helpers for the MOTD line fields, which hold & codes.
 *
 * Formatting a selection works on the line as characters, each with its own colour and styles,
 * rather than by inserting codes around the selection: a selection that crosses text already
 * coloured differently then changes exactly the characters in it, and the line is written back
 * with the fewest codes that give every character its look.
 */

const CODE = /&(#[0-9a-fA-F]{6}|[0-9a-fk-orA-FK-OR])/g;

export type StyleKey = 'bold' | 'italic' | 'underline' | 'strike' | 'obfuscated';

/** Style codes in the order they are written. */
const STYLE_CODES: [StyleKey, string][] = [
    ['bold', 'l'],
    ['italic', 'o'],
    ['underline', 'n'],
    ['strike', 'm'],
    ['obfuscated', 'k'],
];

const STYLE_BY_CODE = new Map(STYLE_CODES.map(([key, code]) => [code, key]));

/** One visible character: its colour (a legacy code such as `6`, or `#rrggbb`; null for none) and styles. */
export interface RichChar {
    char: string;
    color: string | null;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    obfuscated: boolean;
    /** Where the character sits in the & text. */
    at: number;
}

const plain = { color: null, bold: false, italic: false, underline: false, strike: false, obfuscated: false };

/** A line of & codes as characters with their look. A colour resets the styles, as in game. */
export function parseRich(text: string): RichChar[] {
    const chars: RichChar[] = [];
    let state = { ...plain } as Omit<RichChar, 'char' | 'at'>;
    let position = 0;

    for (const match of text.matchAll(CODE)) {
        for (const char of text.slice(position, match.index)) {
            chars.push({ ...state, char, at: position });
            position += char.length;
        }
        const code = match[1].toLowerCase();
        if (code.startsWith('#') || /^[0-9a-f]$/.test(code)) state = { ...plain, color: code };
        else if (code === 'r') state = { ...plain };
        else state = { ...state, [STYLE_BY_CODE.get(code)!]: true };
        position = match.index! + match[0].length;
    }
    for (const char of text.slice(position)) {
        chars.push({ ...state, char, at: position });
        position += char.length;
    }

    return chars;
}

const same = (a: Omit<RichChar, 'char' | 'at'>, b: Omit<RichChar, 'char' | 'at'>) => a.color === b.color && STYLE_CODES.every(([key]) => a[key] === b[key]);

/**
 * Characters back to & codes, writing a code only where the look changes. A space takes the
 * look before it unless it is underlined or struck through, where its look shows.
 */
export function serializeRich(chars: readonly Omit<RichChar, 'at'>[]): { text: string; ends: number[] } {
    let text = '';
    let state = { ...plain } as Omit<RichChar, 'char' | 'at'>;
    const ends: number[] = [];

    for (const entry of chars) {
        const { char, ...look } = entry;
        const invisible = char === ' ' && !look.underline && !look.strike && !state.underline && !state.strike;
        if (!invisible && !same(look, state)) {
            const lostStyle = STYLE_CODES.some(([key]) => state[key] && !look[key]);
            if (look.color !== state.color || lostStyle) {
                // A colour code (or &r) clears every style, so the styles kept are written again.
                text += look.color === null ? '&r' : `&${look.color}`;
                for (const [key, code] of STYLE_CODES) if (look[key]) text += `&${code}`;
            } else {
                for (const [key, code] of STYLE_CODES) if (look[key] && !state[key]) text += `&${code}`;
            }
            state = look;
        }
        text += char;
        ends.push(text.length);
    }

    return { text, ends };
}

/** The characters a selection of the & text covers, by index. */
function covered(chars: readonly RichChar[], start: number, end: number): [number, number] {
    const first = chars.findIndex((entry) => entry.at >= start);
    if (first === -1) return [chars.length, chars.length];
    const after = chars.findIndex((entry) => entry.at >= end);

    return [first, after === -1 ? chars.length : after];
}

/** An edited line, with the cursor (and the start of the selection to keep, if any). */
export interface Edited {
    text: string;
    cursor: number;
    anchor?: number;
}

export type Change ={ color: string | null } | { toggle: StyleKey } | { reset: true } | { colors: (count: number) => string[] };

/**
 * Formats the selected characters and writes the line back: a colour, a style switched on (or off
 * when every selected character has it), a reset, or a colour per visible character for rainbows
 * and gradients. The formatted characters stay selected, from `anchor` to `cursor`, so more can
 * be applied to them.
 */
export function formatSelection(text: string, start: number, end: number, change: Change): Edited {
    const chars = parseRich(text);
    const [from, to] = covered(chars, Math.min(start, end), Math.max(start, end));
    const range = chars.slice(from, to);

    if ('color' in change) range.forEach((entry) => (entry.color = change.color));
    else if ('reset' in change) range.forEach((entry) => Object.assign(entry, plain));
    else if ('toggle' in change) {
        const on = !range.every((entry) => entry[change.toggle]);
        range.forEach((entry) => (entry[change.toggle] = on));
    } else {
        const visible = range.filter((entry) => entry.char !== ' ');
        const colors = change.colors(visible.length);
        visible.forEach((entry, index) => (entry.color = colors[index]));
    }

    const written = serializeRich(chars);
    // Codes after the last character are kept for what is typed next.
    const tail = /(?:&(?:#[0-9a-fA-F]{6}|[0-9a-fk-orA-FK-OR]))+$/.exec(text)?.[0] ?? '';
    const anchor = from < chars.length ? written.ends[from] - chars[from].char.length : written.text.length;

    return { text: written.text + tail, anchor, cursor: to > 0 ? written.ends[to - 1] : 0 };
}

/**
 * Inserts a code at the cursor for what is typed next, as before, when nothing is selected.
 */
export function applyCode(text: string, start: number, end: number, code: string): { text: string; cursor: number } {
    const insert = `&${code}`;

    return { text: text.slice(0, start) + insert + text.slice(end), cursor: start + insert.length };
}

export function insertAt(text: string, start: number, end: number, value: string): { text: string; cursor: number } {
    return { text: text.slice(0, start) + value + text.slice(end), cursor: start + value.length };
}
