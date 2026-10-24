import { describe, expect, it } from 'vitest';
import { centerLine, fromAmpersand, lineWidth, normalizeMotd, parseLine, rainbow, stripCodes, toAmpersand, toPropertiesValue } from './motd';

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
    it('resets styles on a colour code, as the client does', () => {
        const segments = parseLine('§l§aGreen');
        expect(segments).toHaveLength(1);
        expect(segments[0]).toMatchObject({ text: 'Green', color: '#55FF55', bold: false });
    });

    it('applies styles after a colour', () => {
        expect(parseLine('§a§lBold green')[0]).toMatchObject({ color: '#55FF55', bold: true });
    });

    it('reads hex colours', () => {
        expect(parseLine('§x§5§4§d§a§f§4Hi')[0].color).toBe('#54DAF4');
    });
});

describe('helpers', () => {
    it('colours each visible character for rainbow text', () => {
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
