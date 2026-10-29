import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast, normaliseColor, toHex, toOklch } from './color';
import { asSettings, generatePalette } from './generate';
import { BUILT_IN, ROLES, matches, readCustom, writeCustom } from './presets';

const manifest = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', 'prism-themes', 'extension.json'), 'utf8')) as { theme: { settings: Record<string, { type: string; default: unknown }> } };
const settings = manifest.theme.settings;
const lookKeys = Object.keys(settings).filter((key) => !['preset', 'presets', 'background_image'].includes(key));

describe('built-in presets', () => {
    it('are the eight asked for', () => {
        expect(BUILT_IN.map((preset) => preset.name)).toEqual(['Studio', 'Studio classic', 'Terminal', 'Prism Slate', 'Catppuccin Mocha', 'Catppuccin Macchiato', 'Catppuccin Frappé', 'Catppuccin Latte']);
    });

    it('set every look setting, with colors the panel accepts', () => {
        for (const preset of BUILT_IN) {
            expect(Object.keys(preset.values).sort()).toEqual(lookKeys.sort());
            for (const [key, value] of Object.entries(preset.values)) {
                if (settings[key].type === 'color') expect(normaliseColor(String(value)), `${preset.name} ${key}`).toBe(value);
            }
        }
    });

    it('make Studio the defaults, with square switches and glass', () => {
        const defaults = Object.fromEntries(lookKeys.map((key) => [key, settings[key].default]));
        expect(matches({ ...BUILT_IN[0], values: { ...BUILT_IN[0].values, switches: 'square', surface_style: 'glass' } }, defaults)).toBe(true);
    });

    it('carry Catppuccin only as colors', () => {
        const mocha = BUILT_IN.find((preset) => preset.id === 'catppuccin-mocha')!;
        expect(mocha.values).toMatchObject({ d_background: '#1e1e2e', d_primary: '#cba6f7', l_background: '#eff1f5', l_primary: '#8839ef' });
    });

    it('have readable text', () => {
        for (const preset of BUILT_IN) {
            for (const mode of ['d', 'l']) {
                expect(contrast(String(preset.values[`${mode}_text`]), String(preset.values[`${mode}_background`]))!, `${preset.name} ${mode}`).toBeGreaterThan(7);
            }
        }
    });
});

describe('the palette generator', () => {
    it('gives Studio from blue, as generate.py does', () => {
        const studio = BUILT_IN[0].values;
        expect({ ...asSettings('d', generatePalette('d', 255, 0.17, 'subtle')), ...asSettings('l', generatePalette('l', 255, 0.17, 'subtle')) }).toEqual(Object.fromEntries(Object.entries(studio).filter(([key]) => /^[dl]_/.test(key))));
    });

    it('fills every role with a valid color', () => {
        for (const mode of ['d', 'l'] as const) {
            const palette = generatePalette(mode, 12.5, 0.2, 'strong');
            expect(Object.keys(palette).sort()).toEqual(ROLES.map((role) => role.key).sort());
            for (const value of Object.values(palette)) expect(normaliseColor(value)).toBe(value);
        }
    });
});

describe('colors', () => {
    it('accepts what the panel accepts and nothing else', () => {
        expect(normaliseColor(' #ABCDEF ')).toBe('#abcdef');
        expect(normaliseColor('oklch(0.5  0.1 200 /0.5)')).toBe('oklch(0.5 0.1 200 / 0.5)');
        expect(normaliseColor('red')).toBeNull();
        expect(normaliseColor('rgb(1, 2, 3)')).toBeNull();
    });

    it('converts between hex and oklch', () => {
        expect(toHex('#89b4fa')).toBe('#89b4fa');
        const blue = toOklch('#89b4fa');
        expect(toHex(`oklch(${blue.l.toFixed(4)} ${blue.c.toFixed(4)} ${blue.h.toFixed(2)})`)).toBe('#89b4fa');
        expect(toHex('oklch(1 0 0)')).toBe('#ffffff');
    });

    it('measures contrast as WCAG does', () => {
        expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
        expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
    });
});

describe('your presets', () => {
    it('read back what they write, and ignore anything else', () => {
        const list = [{ id: 'own-1', name: 'Mine', values: { d_primary: '#ff0000' } }];
        expect(readCustom(writeCustom(list))).toEqual(list);
        expect(readCustom('nonsense')).toEqual([]);
        expect(readCustom('[{"name":"no id"}]')).toEqual([]);
    });
});
