import { beforeEach, describe, expect, it } from 'vitest';
import { NO_FILTERS, filtering, gameTag, matches, readRecent, remember } from './dashboard';

const paper = { name: 'mc-suite-test-paper', power: 'running', tags: ['minecraft', 'paper'] };
const tshock = { name: 'mc-suite-test-tshock', power: 'offline', tags: ['terraria'] };
const unknown = { name: 'loading', power: null, tags: [] };

describe('matches', () => {
    it('shows everything without filters', () => {
        expect([paper, tshock, unknown].every((server) => matches(server, NO_FILTERS))).toBe(true);
        expect(filtering(NO_FILTERS)).toBe(false);
    });

    it('filters by status, counting a server still loading as neither', () => {
        expect(matches(paper, { ...NO_FILTERS, status: 'online' })).toBe(true);
        expect(matches(tshock, { ...NO_FILTERS, status: 'online' })).toBe(false);
        expect(matches(tshock, { ...NO_FILTERS, status: 'offline' })).toBe(true);
        expect(matches(unknown, { ...NO_FILTERS, status: 'offline' })).toBe(false);
    });

    it('filters by game and by part of the name, ignoring case', () => {
        expect(matches(paper, { ...NO_FILTERS, game: 'paper' })).toBe(true);
        expect(matches(tshock, { ...NO_FILTERS, game: 'paper' })).toBe(false);
        expect(matches(paper, { ...NO_FILTERS, name: '  PAPER ' })).toBe(true);
        expect(matches(tshock, { ...NO_FILTERS, name: 'paper' })).toBe(false);
    });
});

describe('gameTag', () => {
    it('prefers the tag that names the game over a shared one', () => {
        expect(gameTag(['minecraft', 'paper'])).toBe('paper');
        expect(gameTag(['minecraft'])).toBe('minecraft');
        expect(gameTag([])).toBeNull();
    });
});

describe('recent servers', () => {
    beforeEach(() => window.localStorage.clear());

    it('keeps the last five, newest first, without repeats', () => {
        for (const n of [1, 2, 3, 4, 5, 6]) remember({ identifier: `s${n}`, name: `Server ${n}` });
        remember({ identifier: 's3', name: 'Server 3' });
        expect(readRecent().map((item) => item.identifier)).toEqual(['s3', 's6', 's5', 's4', 's2']);
    });

    it('ignores what it cannot read', () => {
        window.localStorage.setItem('prism-layout:recent', '{oops');
        expect(readRecent()).toEqual([]);
    });
});
