import { describe, expect, it } from 'vitest';
import { read } from '../config';
import { allocatedPercent, bytes, fullness, megabytes, sparkline } from './format';

describe('megabytes and bytes', () => {
    it('picks a readable unit', () => {
        expect(megabytes(512)).toBe('512 MiB');
        expect(megabytes(1536)).toBe('1.5 GiB');
        expect(megabytes(400000)).toBe('391 GiB');
        expect(bytes(67051913216)).toBe('62.4 GiB');
    });
});

describe('allocatedPercent', () => {
    it('counts overallocation into the limit', () => {
        expect(allocatedPercent({ used: 47008, limit: 58000, overallocate: 0 })).toBeCloseTo(81.05, 1);
        expect(allocatedPercent({ used: 1000, limit: 1000, overallocate: 100 })).toBe(50);
    });

    it('has no percent for unlimited nodes', () => {
        expect(allocatedPercent({ used: 10, limit: 100, overallocate: -1 })).toBeNull();
    });
});

describe('sparkline', () => {
    it('scales values into the box, oldest on the left', () => {
        expect(sparkline([0, 5, 10], 100, 20)).toBe('0,20 50,10 100,0');
        expect(sparkline([5], 100, 20, 10)).toBe('0,10');
        expect(sparkline([], 100, 20)).toBe('');
    });
});

describe('fullness', () => {
    it('warns as a node fills', () => {
        expect(fullness(50)).toBe('success');
        expect(fullness(80)).toBe('warning');
        expect(fullness(95)).toBe('danger');
        expect(fullness(null)).toBe('neutral');
    });
});

describe('read', () => {
    it('has nothing to read', () => {
        expect(read({})).toEqual({});
    });
});
