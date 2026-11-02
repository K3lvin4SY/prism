import { describe, expect, it } from 'vitest';
import { read } from '../config';
import { canCreate, mib, misfit, percentUsed, suggested } from './quota';

const minimum = { memory: 256, disk: 1024, cpu: 10 };

describe('canCreate', () => {
    it('needs a server slot and at least the minimum of everything', () => {
        expect(canCreate({ servers: 1, memory: 2048, disk: 10240, cpu: 100 }, minimum)).toBe(true);
        expect(canCreate({ servers: 0, memory: 2048, disk: 10240, cpu: 100 }, minimum)).toBe(false);
        expect(canCreate({ servers: 1, memory: 128, disk: 10240, cpu: 100 }, minimum)).toBe(false);
        expect(canCreate(null, minimum)).toBe(false);
    });
});

describe('suggested', () => {
    it('starts at half of what is left, in steps', () => {
        expect(suggested({ servers: 1, memory: 4096, disk: 20480, cpu: 200 }, minimum)).toEqual({ memory: 2048, disk: 10240, cpu: 100 });
    });

    it('never goes under the minimum or over what is left', () => {
        expect(suggested({ servers: 1, memory: 300, disk: 1500, cpu: 15 }, minimum)).toEqual({ memory: 256, disk: 1024, cpu: 10 });
    });
});

describe('misfit', () => {
    const left = { servers: 1, memory: 1024, disk: 4096, cpu: 50 };

    it('accepts a size within what is left', () => {
        expect(misfit(left, { memory: 1024, disk: 4096, cpu: 50 })).toBeNull();
    });

    it('names the first thing over', () => {
        expect(misfit(left, { memory: 2048, disk: 1024, cpu: 10 })).toContain('memory');
        expect(misfit(left, { memory: 512, disk: 1024, cpu: 80 })).toContain('CPU');
        expect(misfit({ ...left, servers: 0 }, { memory: 512, disk: 1024, cpu: 10 })).toContain('Delete one');
    });
});

describe('percentUsed and mib', () => {
    it('treats a zero limit as full', () => {
        expect(percentUsed(0, 0)).toBe(100);
        expect(percentUsed(512, 2048)).toBe(25);
    });

    it('reads sizes', () => {
        expect(mib(512)).toBe('512 MiB');
        expect(mib(2048)).toBe('2 GiB');
        expect(mib(1536)).toBe('1.5 GiB');
    });
});

describe('read', () => {
    it('falls back to the PHP defaults: off until the admin turns it on', () => {
        expect(read({})).toEqual({ enabled: false, who: 'everyone', allowDelete: true });
    });
});
