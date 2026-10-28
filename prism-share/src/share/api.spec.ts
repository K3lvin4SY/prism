import { describe, expect, it, vi } from 'vitest';
import { ShareError, ended, formatBytes, refused, takeToken } from './api';

const TOKEN = 'a'.repeat(24) + 'B'.repeat(24);

describe('takeToken', () => {
    it('reads the token from the fragment and clears it from the address', () => {
        const replaceState = vi.fn();
        expect(takeToken({ hash: `#${TOKEN}`, pathname: '/share', search: '' }, { replaceState })).toBe(TOKEN);
        expect(replaceState).toHaveBeenCalledWith(null, '', '/share');
    });

    it('refuses anything that is not a whole token, and still clears the fragment', () => {
        const replaceState = vi.fn();
        expect(takeToken({ hash: '#abc', pathname: '/share', search: '' }, { replaceState })).toBeNull();
        expect(takeToken({ hash: `#${TOKEN}<script>`, pathname: '/share', search: '' }, { replaceState })).toBeNull();
        expect(replaceState).toHaveBeenCalledTimes(2);
        expect(takeToken({ hash: '', pathname: '/share', search: '' }, { replaceState })).toBeNull();
        expect(replaceState).toHaveBeenCalledTimes(2);
    });
});

describe('formatBytes', () => {
    it('uses binary units', () => {
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(1536)).toBe('1.5 KiB');
        expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GiB');
    });
});

describe('ended and refused', () => {
    it('ends the page only when the link is gone or allows nothing', () => {
        expect(ended(new ShareError(404, 'gone'))).toBe(true);
        expect(ended(new ShareError(410, 'nothing'))).toBe(true);
        expect(ended(new ShareError(403, 'not that'))).toBe(false);
        expect(ended(new ShareError(429, 'slow down'))).toBe(false);
        expect(ended(new Error('network'))).toBe(false);
    });

    it('refuses one thing on 403', () => {
        expect(refused(new ShareError(403, 'not that'))).toBe(true);
        expect(refused(new ShareError(404, 'gone'))).toBe(false);
    });
});
