import { describe, expect, it, vi } from 'vitest';
import { formatBytes, takeToken } from './api';

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
