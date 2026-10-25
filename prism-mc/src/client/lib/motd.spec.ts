import { describe, expect, it } from 'vitest';
import { centerLine, fromAmpersand, lineWidth, normalizeMotd, parseLine, rainbow, stripCodes, toAmpersand, toPropertiesValue, colorAt, gradient, hexToSection } from './motd';

describe('normalizeMotd', () => {
    it('reads a server.properties line with unicode escapes', () => {
        expect(normalizeMotd('motd=\\u00A7aSurvival\\n\\u00A7bSkyblock')).toBe('§aSurvival\n§bSkyblock');
    });

    it('reads & codes and hex', () => {
        expect(normalizeMotd('&6&lHello &#FF0000Red')).toBe('§6§lHello §x§f§f§0§0§0§0Red');
    });

    it('keeps at most two lines', () => {
        expect(normalizeMotd('a\nb\nc')).toBe('a\nb');
    });
});

describe('round trips', () => {
    const motd = '§6§lFRAVOWO §7[§e1.21§7]\n§aSurvival §8| §x§5§4§d§a§f§4Hex';

    it('survives the properties format', () => {
        expect(normalizeMotd(toPropertiesValue(motd))).toBe(motd);
    });

    it('survives the ampersand format', () => {
        expect(fromAmpersand(toAmpersand(motd))).toBe(motd);
        expect(toAmpersand(motd)).toContain('&#54daf4');
    });

    it('escapes separators and non-ASCII for Java', () => {
        expect(toPropertiesValue('a=b:c §')).toBe('a\\=b\\:c \\u00A7');
    });
});

describe('parseLine', () => {
    it('resets styles on a color code, as the client does', () => {
        const segments = parseLine('§l§aGreen');
        expect(segments).toHaveLength(1);
        expect(segments[0]).toMatchObject({ text: 'Green', color: '#55FF55', bold: false });
    });

    it('applies styles after a color', () => {
        expect(parseLine('§a§lBold green')[0]).toMatchObject({ color: '#55FF55', bold: true });
    });

    it('reads hex colors', () => {
        expect(parseLine('§x§5§4§d§a§f§4Hi')[0].color).toBe('#54DAF4');
    });
});

describe('helpers', () => {
    it('colors each visible character for rainbow text', () => {
        const result = rainbow('ab c', false);
        expect(stripCodes(result)).toBe('ab c');
        expect(result.startsWith('§c')).toBe(true);
    });

    it('centres a line by padding with spaces', () => {
        const centred = centerLine('Hello');
        expect(centred.trim()).toBe('Hello');
        expect(Math.abs(270 - 2 * lineWidth(centred) + lineWidth('Hello'))).toBeLessThanOrEqual(8);
    });
});

describe('centred lines', () => {
    it('keep their leading spaces through saving', () => {
        const centred = centerLine('Hello');
        expect(normalizeMotd(`${centred}\nSecond`)).toBe(`${centred}\nSecond`);
        // Java drops leading spaces from a value unless the first is escaped.
        expect(toPropertiesValue(normalizeMotd(centred)).startsWith('\\ ')).toBe(true);
    });

    it('still reads a pasted properties line', () => {
        expect(normalizeMotd('  motd=Hi there  \n')).toBe('Hi there');
    });
});

describe('gradient', () => {
    const stops = [
        { at: 0, hex: '#000000' },
        { at: 0.5, hex: '#ff0000' },
        { at: 1, hex: '#0000ff' },
    ];

    it('blends between the stops either side, in any order', () => {
        expect(colorAt(stops, 0)).toBe('000000');
        expect(colorAt(stops, 0.25)).toBe('800000');
        expect(colorAt([...stops].reverse(), 0.75)).toBe('800080');
        expect(colorAt(stops, 1)).toBe('0000ff');
    });

    it('holds the end colors beyond the first and last stop', () => {
        expect(colorAt([{ at: 0.2, hex: '#112233' }, { at: 0.8, hex: '#445566' }], 0)).toBe('112233');
        expect(colorAt([{ at: 0.2, hex: '#112233' }, { at: 0.8, hex: '#445566' }], 1)).toBe('445566');
    });

    it('colors each visible character and leaves spaces alone', () => {
        const out = gradient('a b', [{ at: 0, hex: '#000000' }, { at: 1, hex: '#ffffff' }]);
        expect(stripCodes(out)).toBe('a b');
        expect(out.startsWith(hexToSection('000000'))).toBe(true);
        expect(out.endsWith(`${hexToSection('ffffff')}b`)).toBe(true);
    });
});
