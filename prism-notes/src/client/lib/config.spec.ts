import { describe, expect, it } from 'vitest';
import { read } from '../config';

describe('read', () => {
    it('falls back to the PHP defaults', () => {
        expect(read({})).toEqual({ enabled: true, maxNotes: 50, consolePinned: true });
    });

    it('keeps the most notes within 1 to 200', () => {
        expect(read({ max_notes: 500 }).maxNotes).toBe(200);
        expect(read({ max_notes: 0 }).maxNotes).toBe(50);
        expect(read({ max_notes: '12' }).maxNotes).toBe(12);
    });
});
