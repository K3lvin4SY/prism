import { describe, expect, it } from 'vitest';
import { customHours, expiryPresets, hoursLabel, timeLeft, toggleOption } from './options';

describe('toggleOption', () => {
    it('turns the console on with commands, and commands off with the console', () => {
        expect(toggleOption([], 'command', true)).toEqual(['console', 'command']);
        expect(toggleOption(['console', 'command', 'files'], 'console', false)).toEqual(['files']);
    });

    it('keeps a fixed order and no repeats', () => {
        expect(toggleOption(['backups', 'start'], 'start', true)).toEqual(['start', 'backups']);
    });
});

describe('expiry', () => {
    it('offers only the quick choices the admin allows', () => {
        expect(expiryPresets(720).map((preset) => preset.hours)).toEqual([1, 24, 168]);
        expect(expiryPresets(48).map((preset) => preset.hours)).toEqual([1, 24]);
    });

    it('keeps a custom length between an hour and the maximum', () => {
        expect(customHours(5, 'days', 720)).toEqual({ hours: 120, capped: false });
        expect(customHours(40, 'days', 720)).toEqual({ hours: 720, capped: true });
        expect(customHours(0, 'hours', 720)).toEqual({ hours: 1, capped: false });
        expect(customHours(Number.NaN, 'hours', 720)).toEqual({ hours: 1, capped: false });
    });

    it('says a length in words', () => {
        expect(hoursLabel(720)).toBe('30 days');
        expect(hoursLabel(24)).toBe('1 day');
        expect(hoursLabel(36)).toBe('36 hours');
    });
});

describe('timeLeft', () => {
    const now = Date.parse('2026-11-01T12:00:00Z');
    it('counts minutes, then hours, then days', () => {
        expect(timeLeft('2026-11-01T12:40:00Z', now)).toBe('40 min left');
        expect(timeLeft('2026-11-02T11:00:00Z', now)).toBe('23 h left');
        expect(timeLeft('2026-11-07T23:00:00Z', now)).toBe('6 days left');
        expect(timeLeft('2026-11-06T11:59:00Z', now)).toBe('5 days left');
    });
});
