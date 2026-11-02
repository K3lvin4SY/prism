import { describe, expect, it } from 'vitest';
import type { Component } from './api';
import { barTone, dayAt, grouped, uptimeText } from './lib';

const component = (id: number, group: string): Component => ({ id, label: `C${id}`, group, state: 'up', uptime: 100, days: [] });

describe('barTone', () => {
    it('grades a day by how much of it was up', () => {
        expect(barTone(null)).toBe('none');
        expect(barTone(1)).toBe('up');
        expect(barTone(0.97)).toBe('minor');
        expect(barTone(0.6)).toBe('major');
        expect(barTone(0.1)).toBe('down');
    });
});

describe('uptimeText', () => {
    it('shows whole numbers plainly and others to two places', () => {
        expect(uptimeText(100)).toBe('100%');
        expect(uptimeText(99.95)).toBe('99.95%');
        expect(uptimeText(99.5)).toBe('99.5%');
        expect(uptimeText(null)).toBe('No data');
    });
});

describe('dayAt', () => {
    it('counts days from the first, across months', () => {
        const date = dayAt('2026-10-30', 3);
        expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([2026, 11, 2]);
    });
});

describe('grouped', () => {
    it('keeps the order and puts components without a group first', () => {
        const groups = grouped([component(1, 'Games'), component(2, ''), component(3, 'Games'), component(4, 'Nodes')]);
        expect(groups.map((group) => group.name)).toEqual(['', 'Games', 'Nodes']);
        expect(groups[1].components.map((item) => item.id)).toEqual([1, 3]);
    });
});
