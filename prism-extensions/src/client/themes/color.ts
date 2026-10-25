/**
 * Color values as the panel stores them: hex (#rgb, #rgba, #rrggbb, #rrggbbaa) or oklch(L C H),
 * with conversions for the color pickers and the contrast between text and its background.
 */

export interface Rgb {
    r: number;
    g: number;
    b: number;
    a: number;
}

const number = String.raw`(?:\d{1,3}(?:\.\d{1,6})?|\.\d{1,6})`;
/** The panel's own rule (ExtensionSettingValueGuard::COLOR_PATTERN), so nothing is refused on save. */
const PATTERN = new RegExp(String.raw`^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|oklch\(${number}%? ${number}%? ${number}(?:deg)?(?: / ${number}%?)?\))$`);

/** A typed color in the shape the panel stores, or null when it would be refused. */
export function normaliseColor(text: string): string | null {
    const value = text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/ ?\/ ?/, ' / ').replace('( ', '(').replace(' )', ')');

    return PATTERN.test(value) ? value : null;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const toLinear = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const toGamma = (value: number) => (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);

function oklchToRgb(l: number, c: number, h: number, a = 1): Rgb {
    const radians = (h * Math.PI) / 180;
    const A = c * Math.cos(radians);
    const B = c * Math.sin(radians);
    const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;

    return {
        r: clamp(toGamma(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_)),
        g: clamp(toGamma(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_)),
        b: clamp(toGamma(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_)),
        a,
    };
}

export function parseColor(text: string): Rgb | null {
    const value = normaliseColor(text);
    if (!value) return null;
    if (value.startsWith('#')) {
        const hex = value.slice(1);
        const full = hex.length <= 4 ? [...hex].map((char) => char + char).join('') : hex;
        const part = (index: number) => parseInt(full.slice(index * 2, index * 2 + 2), 16) / 255;

        return { r: part(0), g: part(1), b: part(2), a: full.length === 8 ? part(3) : 1 };
    }
    const [l, c, h, a] = value
        .slice(6, -1)
        .replace(' / ', ' ')
        .split(' ')
        .map((part) => (part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part)));

    return oklchToRgb(l, c, h, a ?? 1);
}

const byte = (value: number) =>
    Math.round(clamp(value) * 255)
        .toString(16)
        .padStart(2, '0');

/** A color as #rrggbb for the native picker, which has no alpha or oklch. */
export const toHex = (text: string): string => {
    const rgb = parseColor(text);

    return rgb ? `#${byte(rgb.r)}${byte(rgb.g)}${byte(rgb.b)}` : '#000000';
};

/** Lightness, chroma and hue of a color, for the palette generator. */
export function toOklch(text: string): { l: number; c: number; h: number } {
    const rgb = parseColor(text) ?? { r: 0, g: 0, b: 0, a: 1 };
    const [r, g, b] = [toLinear(rgb.r), toLinear(rgb.g), toLinear(rgb.b)];
    const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
    const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
    const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
    const h = (Math.atan2(B, A) * 180) / Math.PI;

    return { l: L, c: Math.sqrt(A * A + B * B), h: h < 0 ? h + 360 : h };
}

const luminance = ({ r, g, b }: Rgb) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

/** The WCAG contrast ratio of text on a background, from 1 to 21. */
export function contrast(text: string, background: string): number | null {
    const a = parseColor(text);
    const b = parseColor(background);
    if (!a || !b) return null;
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);

    return (light + 0.05) / (dark + 0.05);
}
