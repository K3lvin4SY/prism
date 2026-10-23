import { describe as group, expect, it } from 'vitest';
import { build, describe, parse } from './cron';

group('cron', () => {
    it('round-trips the simple forms', () => {
        for (const cron of ['*/15 * * * *', '5 * * * *', '0 */6 * * *', '30 4 * * *', '0 3 * * 0,6', '0 2 1 * *']) {
            expect(build(parse(cron))).toBe(cron);
        }
    });

    it('keeps anything else as custom', () => {
        expect(parse('0 4 * 1-6 *').mode).toBe('custom');
        expect(parse('nonsense').mode).toBe('custom');
        expect(build(parse('0 4 * 1-6 *'))).toBe('0 4 * 1-6 *');
    });

    it('says it in words', () => {
        expect(describe('*/15 * * * *')).toBe('Every 15 minutes');
        expect(describe('30 4 * * *')).toBe('Every day at 04:30');
        expect(describe('0 3 * * 0,6')).toBe('Sunday, Saturday at 03:00');
        expect(describe('0 */6 * * *')).toBe('Every 6 hours at :00');
    });
});
