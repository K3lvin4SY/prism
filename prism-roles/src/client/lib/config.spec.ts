import { describe, expect, it } from 'vitest';
import { read } from '../config';

describe('read', () => {
    it('falls back to the PHP defaults', () => {
        expect(read({})).toEqual({ enabled: true, personal: true, maxPersonal: 20 });
    });

    it('keeps the most roles within 1 to 100', () => {
        expect(read({ max_personal: 500 }).maxPersonal).toBe(100);
        expect(read({ max_personal: -1 }).maxPersonal).toBe(20);
    });
});
