import { describe, expect, it } from 'vitest';
import { read } from '../config';

describe('read', () => {
    it('falls back to the PHP defaults: the page is off until the admin turns it on', () => {
        expect(read({})).toEqual({ enabled: false, requireSignIn: false });
    });
});
