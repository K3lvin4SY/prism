import { describe, expect, it } from 'vitest';
import { read } from '../config';
import { EMPTY, changed, customised, unknownPlaceholders } from './template';

describe('unknownPlaceholders', () => {
    it('lists each placeholder the email does not fill, once', () => {
        expect(unknownPlaceholders('Hi {name}, {server} and {sever} {sever}', ['name', 'server'])).toEqual(['sever']);
    });

    it('is empty for plain text', () => {
        expect(unknownPlaceholders('Welcome aboard', ['name'])).toEqual([]);
    });
});

describe('changed and customised', () => {
    it('ignores spaces at the ends', () => {
        expect(changed({ ...EMPTY, subject: 'Hi ' }, { ...EMPTY, subject: 'Hi' })).toBe(false);
        expect(changed({ ...EMPTY, outro: 'Bye' }, EMPTY)).toBe(true);
    });

    it('sees any field filled in', () => {
        expect(customised(EMPTY)).toBe(false);
        expect(customised({ ...EMPTY, action: 'Open' })).toBe(true);
    });
});

describe('read', () => {
    it('falls back to the PHP defaults', () => {
        expect(read({})).toEqual({ enabled: true });
    });
});
