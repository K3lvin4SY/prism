import { describe, expect, it } from 'vitest';
import { read } from '../config';
import { ROLE_ID, WEBHOOK, fill, usable } from './template';

describe('fill', () => {
    it('fills placeholders and leaves the rest', () => {
        expect(fill('{player} joined {server}.', { server: 'Survival', player: 'Steve' })).toBe('Steve joined Survival.');
        expect(fill('{backup} {unknown}', {})).toBe(' {unknown}');
    });
});

describe('WEBHOOK and ROLE_ID', () => {
    it('take Discord webhook addresses only', () => {
        expect(WEBHOOK.test('https://discord.com/api/webhooks/123/abc_DEF-1')).toBe(true);
        expect(WEBHOOK.test('https://ptb.discord.com/api/webhooks/123/abc')).toBe(true);
        expect(WEBHOOK.test('https://evil.example/api/webhooks/123/abc')).toBe(false);
        expect(WEBHOOK.test('http://discord.com/api/webhooks/123/abc')).toBe(false);
    });

    it('take role ids only', () => {
        expect(ROLE_ID.test('123456789012345678')).toBe(true);
        expect(ROLE_ID.test('@everyone')).toBe(false);
    });
});

describe('usable', () => {
    it('hides player events when they are off', () => {
        const events = [{ key: 'start' }, { key: 'player.join' }];
        expect(usable(events, false)).toEqual([{ key: 'start' }]);
        expect(usable(events, true)).toHaveLength(2);
    });
});

describe('read', () => {
    it('falls back to the PHP defaults', () => {
        expect(read({})).toEqual({ enabled: true, players: true, maxHooks: 5 });
    });
});
