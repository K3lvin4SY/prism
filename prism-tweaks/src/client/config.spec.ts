import { describe, expect, it } from 'vitest';
import { positive, read } from './config';

describe('read', () => {
    it('keeps the panel values for 0 and missing settings', () => {
        const config = read({ client_limit: 0 } as never);
        expect(config.api).toEqual({ client: null, application: null, admin: null });
        expect(config.resources.backup_limit).toBeNull();
    });

    it('reads the numbers set for everyone', () => {
        const config = read({ client_limit: 600, admin_limit: '1000', backup_limit: 10 } as never);
        expect(config.api.client).toBe(600);
        expect(config.api.admin).toBe(1000);
        expect(config.resources.backup_limit).toBe(10);
    });
});

describe('positive', () => {
    it('accepts whole numbers above zero only', () => {
        expect(positive(5)).toBe(5);
        expect(positive('7')).toBe(7);
        expect(positive(0)).toBeNull();
        expect(positive(-3)).toBeNull();
        expect(positive(1.5)).toBeNull();
        expect(positive('')).toBeNull();
        expect(positive(null)).toBeNull();
    });
});
