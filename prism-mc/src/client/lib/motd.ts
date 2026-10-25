/**
 * Minecraft formatted text. The canonical form is legacy text with `§` codes and `\n` between
 * lines, which is what server.properties stores once its escapes are decoded. Hex colors use
 * the Bukkit `§x§r§r§g§g§b§b` form.
 */

export const SECTION = '§';

export const COLORS: ReadonlyArray<{ code: string; name: string; hex: string }> = [
    { code: '0', name: 'Black', hex: '#000000' },
    { code: '1', name: 'Dark blue', hex: '#0000AA' },
    { code: '2', name: 'Dark green', hex: '#00AA00' },
    { code: '3', name: 'Dark aqua', hex: '#00AAAA' },
    { code: '4', name: 'Dark red', hex: '#AA0000' },
    { code: '5', name: 'Dark purple', hex: '#AA00AA' },
    { code: '6', name: 'Gold', hex: '#FFAA00' },
    { code: '7', name: 'Gray', hex: '#AAAAAA' },
    { code: '8', name: 'Dark gray', hex: '#555555' },
    { code: '9', name: 'Blue', hex: '#5555FF' },
    { code: 'a', name: 'Green', hex: '#55FF55' },
    { code: 'b', name: 'Aqua', hex: '#55FFFF' },
    { code: 'c', name: 'Red', hex: '#FF5555' },
    { code: 'd', name: 'Light purple', hex: '#FF55FF' },
    { code: 'e', name: 'Yellow', hex: '#FFFF55' },
    { code: 'f', name: 'White', hex: '#FFFFFF' },
];

export const STYLES: ReadonlyArray<{ code: string; name: string; key: keyof Style }> = [
    { code: 'l', name: 'Bold', key: 'bold' },
    { code: 'o', name: 'Italic', key: 'italic' },
    { code: 'n', name: 'Underline', key: 'underline' },
    { code: 'm', name: 'Strike', key: 'strike' },
    { code: 'k', name: 'Obfuscated', key: 'obfuscated' },
];

const COLOR_BY_CODE = new Map(COLORS.map((color) => [color.code, color.hex]));

export interface Style {
    color: string | null;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    obfuscated: boolean;
}

export interface Segment extends Style {
    text: string;
}

const plainStyle = (): Style => ({ color: null, bold: false, italic: false, underline: false, strike: false, obfuscated: false });

/**
 * Reads a MOTD in any common form: a server.properties line or value (with § and \n
 * escapes), text with § codes, or text with & codes and &#RRGGBB hex colors.
 */
export function normalizeMotd(input: string): string {
    // Leading spaces stay: they are how a line is centred in the server list.
    let text = input.replace(/\r\n?/g, '\n').replace(/^\n+/, '').replace(/\s+$/, '');
    if (/^\s*motd\s*[=:]/i.test(text)) {
        text = text.replace(/^\s*motd\s*[=:]\s*/i, '');
    }

    const looksEscaped = /\\u[0-9a-fA-F]{4}|\\n/.test(text);
    if (looksEscaped) {
        text = decodePropertiesValue(text);
    }

    text = text
        .replace(/[&§]#([0-9a-fA-F]{6})/g, (_, hex: string) => hexToSection(hex))
        .replace(/<#([0-9a-fA-F]{6})>/g, (_, hex: string) => hexToSection(hex))
        .replace(/&([0-9a-fk-orxA-FK-ORX])/g, `${SECTION}$1`)
        .replace(/§([0-9a-fk-orxA-FK-ORX])/g, (_, code: string) => SECTION + code.toLowerCase());

    return text.split('\n').slice(0, 2).join('\n');
}

export function decodePropertiesValue(value: string): string {
    return value.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, escape: string) => {
        if (escape.length === 5 && escape[0] === 'u') {
            return String.fromCharCode(parseInt(escape.slice(1), 16));
        }

        return escape === 'n' ? '\n' : escape === 't' ? '\t' : escape;
    });
}

/** The value as server.properties stores it, Java-escaped. */
export function toPropertiesValue(motd: string): string {
    let out = '';
    for (const char of motd) {
        const code = char.codePointAt(0)!;
        if (char === '\\') out += '\\\\';
        else if (char === '\n') out += '\\n';
        else if (char === '=' || char === ':' || char === '#' || char === '!') out += `\\${char}`;
        else if (code >= 0x20 && code <= 0x7e) out += char;
        else if (code > 0xffff) {
            const offset = code - 0x10000;
            out += `\\u${(0xd800 + (offset >> 10)).toString(16).toUpperCase().padStart(4, '0')}`;
            out += `\\u${(0xdc00 + (offset & 0x3ff)).toString(16).toUpperCase().padStart(4, '0')}`;
        } else out += `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`;
    }

    return out.replace(/^ /, '\\ ');
}

/** & codes with &#RRGGBB hex, as the line fields and most plugins use. */
export function toAmpersand(motd: string): string {
    return motd
        .replace(/§x((?:§[0-9a-fA-F]){6})/g, (_, digits: string) => `&#${digits.replace(/§/g, '')}`)
        .replace(/§/g, '&');
}

export function fromAmpersand(text: string): string {
    return normalizeMotd(text.replace(/\\n/g, '\n'));
}

export function hexToSection(hex: string): string {
    return `${SECTION}x${hex
        .toLowerCase()
        .split('')
        .map((digit) => SECTION + digit)
        .join('')}`;
}

export function stripCodes(text: string): string {
    return text.replace(/§x(?:§[0-9a-fA-F]){6}/g, '').replace(/§[0-9a-fk-orA-FK-OR]/g, '');
}

/** Splits one line into runs of equally styled text. */
export function parseLine(line: string): Segment[] {
    const segments: Segment[] = [];
    let style = plainStyle();
    let text = '';

    const flush = () => {
        if (text !== '') {
            segments.push({ ...style, text });
            text = '';
        }
    };

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char !== SECTION || i + 1 >= line.length) {
            text += char;
            continue;
        }

        const code = line[i + 1].toLowerCase();
        if (code === 'x' && /^(?:§[0-9a-fA-F]){6}$/.test(line.slice(i + 2, i + 14))) {
            flush();
            const hex = line
                .slice(i + 2, i + 14)
                .replace(/§/g, '')
                .toUpperCase();
            style = { ...plainStyle(), color: `#${hex}` };
            i += 13;
            continue;
        }

        if (COLOR_BY_CODE.has(code)) {
            flush();
            style = { ...plainStyle(), color: COLOR_BY_CODE.get(code)! };
        } else if (code === 'r') {
            flush();
            style = plainStyle();
        } else {
            const definition = STYLES.find((entry) => entry.code === code);
            if (!definition) {
                text += char;
                continue;
            }

            flush();
            style = { ...style, [definition.key]: true };
        }

        i++;
    }

    flush();

    return segments;
}

export function parseMotd(motd: string): Segment[][] {
    return motd.split('\n').slice(0, 2).map(parseLine);
}

const RAINBOW_CODES = ['c', '6', 'e', 'a', 'b', '9', 'd'];

/**
 * Colors every visible character along the spectrum. Hex output gives a smooth gradient;
 * otherwise the seven bright legacy colors cycle.
 */
export function rainbow(text: string, hex: boolean, styles = ''): string {
    const characters = [...stripCodes(text)];
    const visible = characters.filter((char) => char !== ' ').length;
    let index = 0;

    return characters
        .map((char) => {
            if (char === ' ') return char;
            const position = index++;
            if (!hex) return `${SECTION}${RAINBOW_CODES[position % RAINBOW_CODES.length]}${styles}${char}`;

            const hue = visible <= 1 ? 0 : (position / visible) * 300;

            return `${hexToSection(hslToHex(hue, 100, 60))}${styles}${char}`;
        })
        .join('');
}

/** A rainbow's color for each of `count` characters: legacy codes cycling, or hex (`#rrggbb`) along the spectrum. */
export function rainbowColors(count: number, hex: boolean): string[] {
    return Array.from({ length: count }, (_, index) => (hex ? `#${hslToHex(count <= 1 ? 0 : (index / count) * 300, 100, 60)}` : RAINBOW_CODES[index % RAINBOW_CODES.length]));
}

/** A gradient's color (`#rrggbb`) for each of `count` characters, the first and last on its ends. */
export function gradientColors(count: number, stops: readonly GradientStop[]): string[] {
    return Array.from({ length: count }, (_, index) => `#${colorAt(stops, count <= 1 ? 0 : index / (count - 1))}`);
}

/** A color on a gradient: its place from 0 to 1 and its #rrggbb. */
export interface GradientStop {
    at: number;
    hex: string;
}

const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

/** The color at a place on a gradient of any number of stops, as rrggbb. */
export function colorAt(stops: readonly GradientStop[], t: number): string {
    const sorted = [...stops].sort((a, b) => a.at - b.at);
    const place = Math.min(1, Math.max(0, t));
    const after = sorted.findIndex((stop) => stop.at >= place);
    if (after <= 0) return (after === 0 ? sorted[0] : sorted[sorted.length - 1]).hex.slice(1).toLowerCase();
    const [left, right] = [sorted[after - 1], sorted[after]];
    const span = right.at - left.at;
    const mix = span === 0 ? 0 : (place - left.at) / span;
    const [a, b] = [channels(left.hex), channels(right.hex)];

    return a.map((channel, index) => Math.round(channel + (b[index] - channel) * mix).toString(16).padStart(2, '0')).join('');
}

/** Colors every visible character along a gradient of any number of stops. */
export function gradient(text: string, stops: readonly GradientStop[], styles = ''): string {
    const characters = [...stripCodes(text)];
    const visible = characters.filter((char) => char !== ' ').length;
    let index = 0;

    return characters
        .map((char) => {
            if (char === ' ') return char;
            const t = visible <= 1 ? 0 : index++ / (visible - 1);

            return `${hexToSection(colorAt(stops, t))}${styles}${char}`;
        })
        .join('');
}

function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

    return [f(0), f(8), f(4)]
        .map((channel) =>
            Math.round(channel * 255)
                .toString(16)
                .padStart(2, '0')
        )
        .join('');
}

/** Pixel widths of the Minecraft default font, including the one-pixel gap after each glyph. */
const NARROW: Record<string, number> = {
    ' ': 4, '!': 2, '"': 4, "'": 2, '(': 4, ')': 4, '*': 4, ',': 2, '.': 2, ':': 2, ';': 2,
    '<': 5, '>': 5, '@': 7, I: 4, '[': 4, ']': 4, '`': 3, f: 5, i: 2, k: 5, l: 3, t: 4, '{': 4, '|': 2, '}': 4, '~': 7,
};

export const MOTD_WIDTH = 270;

export function lineWidth(line: string): number {
    return parseLine(line).reduce((width, segment) => {
        for (const char of segment.text) {
            width += (NARROW[char] ?? 6) + (segment.bold && char !== ' ' ? 1 : 0);
        }

        return width;
    }, 0);
}

/** Pads a line with spaces so the client shows it centred, as MOTD generators do. */
export function centerLine(line: string): string {
    const trimmed = line.replace(/^ +/, '');
    const padding = Math.max(0, Math.floor((MOTD_WIDTH - lineWidth(trimmed)) / 2 / NARROW[' ']));

    return ' '.repeat(padding) + trimmed;
}

export const SYMBOLS = ['★', '☆', '✦', '✧', '❤', '♥', '✔', '✖', '➤', '►', '◄', '•', '●', '◆', '♦', '♣', '♠', '☀', '☁', '☂', '⚔', '⛏', '✪', '⚡', '♪', '♫', '«', '»', '▪', '▶', '◀', '┃', '│'];

/** Whether the server software reads hex colors in the MOTD. */
export function supportsHex(software: string | null | undefined): boolean {
    return ['paper', 'purpur', 'spigot', 'folia', 'pufferfish', 'leaf', 'mohist', 'arclight'].includes(software ?? '');
}
