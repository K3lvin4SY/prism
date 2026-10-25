import { describe, expect, it } from 'vitest';
import { formatSelection, parseRich, serializeRich } from './ampersand';

const select = (text: string, part: string) => [text.indexOf(part), text.indexOf(part) + part.length] as const;

describe('parseRich and serializeRich', () => {
    it('round trips a line, writing only the codes it needs', () => {
        expect(serializeRich(parseRich('&6&lGold &7[&e1.21&7]')).text).toBe('&6&lGold &7[&e1.21&7]');
        expect(serializeRich(parseRich('&6A&6B')).text).toBe('&6AB');
    });

    it('resets styles on a color, as in game', () => {
        const [first, second] = parseRich('&lA&cB');
        expect(first).toMatchObject({ bold: true, color: null });
        expect(second).toMatchObject({ bold: false, color: 'c' });
    });
});

describe('formatSelection', () => {
    it('colors a selection across differently colored text', () => {
        const text = '&cRed&9Blue';
        const [start, end] = select(text, 'd&9Bl');
        expect(formatSelection(text, start, end, { color: 'a' }).text).toBe('&cRe&adBl&9ue');
    });

    it('keeps the styles of the characters it recolors', () => {
        const text = '&c&lBold&r plain';
        const [start, end] = [0, text.length];
        expect(formatSelection(text, start, end, { color: '#112233' }).text).toBe('&#112233&lBold &#112233plain');
    });

    it('switches a style on across colors, and off when all of them have it', () => {
        const text = '&cAB&9CD';
        const [start, end] = select(text, 'B&9C');
        const bold = formatSelection(text, start, end, { toggle: 'bold' }).text;
        expect(bold).toBe('&cA&lB&9&lC&9D');
        const again = select(bold, 'B&9&lC');
        expect(formatSelection(bold, again[0], again[1], { toggle: 'bold' }).text).toBe(text);
    });

    it('resets only the selection', () => {
        const text = '&6&lGold text';
        const [start, end] = select(text, 'text');
        expect(formatSelection(text, start, end, { reset: true }).text).toBe('&6&lGold &rtext');
    });

    it('gives each visible character its own color for gradients, keeping styles', () => {
        const text = '&lA B';
        const result = formatSelection(text, 0, text.length, { colors: (count) => ['#000000', '#ffffff'].slice(0, count) });
        expect(result.text).toBe('&#000000&lA &#ffffff&lB');
    });

    it('keeps the formatted characters selected, and codes left for typing on', () => {
        const text = 'Hi there&6';
        const [start, end] = select(text, 'there');
        const result = formatSelection(text, start, end, { color: 'c' });
        expect(result.text).toBe('Hi &cthere&6');
        expect(result.text.slice(result.anchor, result.cursor)).toBe('there');
    });
});
