import type { Mode, Values } from './presets';

/**
 * A whole palette from one colour: the formulas behind the old Colour setting, the same ones
 * prism-themes/scripts/generate.py uses for Studio, Studio classic and Terminal.
 */
export type Tint = 'none' | 'subtle' | 'strong';

const num = (value: number) => {
    const text = value.toFixed(4).replace(/\.?0+$/, '');

    return text === '' || text === '-0' ? '0' : text;
};

const ok = (l: number, c: number, h: number) => `oklch(${num(l)} ${num(c)} ${num(((h % 360) + 360) % 360)})`;

export function generatePalette(mode: Mode, hue: number, chroma: number, tint: Tint): Record<string, string> {
    const n = { none: 0, subtle: chroma * 0.12, strong: chroma * 0.28 }[tint];

    return mode === 'd'
        ? {
              background: ok(0.165, n, hue),
              surface: ok(0.205, n, hue),
              sidebar: ok(0.185, n, hue),
              raised: ok(0.25, n, hue),
              deep: ok(0.145, n, hue),
              border: ok(0.3, n, hue),
              text: ok(0.95, n * 0.3, hue),
              muted_text: ok(0.72, n * 1.2, hue),
              primary: ok(0.64, chroma, hue),
              on_primary: ok(0.99, 0, 0),
              success: ok(0.72, 0.17, 150),
              warning: ok(0.8, 0.15, 80),
              danger: ok(0.65, 0.2, 25),
              red: ok(0.7, 0.17, 25),
              green: ok(0.76, 0.15, 145),
              yellow: ok(0.86, 0.13, 95),
              blue: ok(0.72, 0.13, 250),
              magenta: ok(0.72, 0.17, 330),
              cyan: ok(0.78, 0.11, 200),
          }
        : {
              background: ok(0.975, n, hue),
              surface: ok(1, 0, 0),
              sidebar: ok(0.96, n, hue),
              raised: ok(0.95, n, hue),
              deep: ok(0.955, n, hue),
              border: ok(0.9, n, hue),
              text: ok(0.21, n * 0.6, hue),
              muted_text: ok(0.5, n * 1.2, hue),
              primary: ok(0.56, chroma, hue),
              on_primary: ok(0.99, 0, 0),
              success: ok(0.55, 0.15, 150),
              warning: ok(0.68, 0.15, 70),
              danger: ok(0.55, 0.21, 25),
              red: ok(0.55, 0.2, 25),
              green: ok(0.55, 0.15, 145),
              yellow: ok(0.62, 0.13, 85),
              blue: ok(0.52, 0.15, 255),
              magenta: ok(0.55, 0.2, 330),
              cyan: ok(0.58, 0.1, 200),
          };
}

/** The palette as settings for one mode: `d_background`, `l_text` and so on. */
export const asSettings = (mode: Mode, palette: Record<string, string>): Values => Object.fromEntries(Object.entries(palette).map(([role, value]) => [`${mode}_${role}`, value]));
