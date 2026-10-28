import { describe, expect, it } from 'vitest';
import { compareVersions, groupByMajor, major, resolve } from './versions';

describe('versions', () => {
    it('compares versions number by number', () => {
        expect(compareVersions('2.1.10', '2.1.9')).toBeGreaterThan(0);
        expect(compareVersions('1.1.110', '2.0.7')).toBeLessThan(0);
        expect(compareVersions('2.1.23', '2.1.23')).toBe(0);
    });

    it('groups by major version, newest first', () => {
        expect(groupByMajor(['1.1.110', '2.1.23', '2.0.72', '2.1.24', '1.1.109'])).toEqual([
            { major: '2.1', versions: ['2.1.24', '2.1.23'] },
            { major: '2.0', versions: ['2.0.72'] },
            { major: '1.1', versions: ['1.1.110', '1.1.109'] },
        ]);
    });

    it('resolves latest and experimental', () => {
        const overview = { stable: '2.1.23', experimental: '2.1.24' };
        expect(resolve('latest', overview)).toBe('2.1.23');
        expect(resolve('experimental', overview)).toBe('2.1.24');
        expect(resolve('2.0.72', overview)).toBe('2.0.72');
        expect(major('2.1.23')).toBe('2.1');
    });
});
