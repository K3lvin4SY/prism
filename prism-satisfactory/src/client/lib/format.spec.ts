import { describe, expect, it } from 'vitest';
import { duration } from './format';

describe('duration', () => {
    it('shows hours and minutes played', () => {
        expect(duration(0)).toBe('0 min');
        expect(duration(59 * 60 + 59)).toBe('59 min');
        expect(duration(2 * 3600 + 5 * 60)).toBe('2 h 5 min');
    });
});
