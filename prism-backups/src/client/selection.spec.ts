import { describe, expect, it } from 'vitest';
import { buildTree, covered, index, partial, toggle, totals } from './selection';

const entries = [
    { p: 'world/level.dat', s: 10, d: false },
    { p: 'world/region/r.0.0.mca', s: 100, d: false },
    { p: 'world/region/r.0.1.mca', s: 200, d: false },
    { p: 'server.properties', s: 5, d: false },
    { p: 'logs', s: 0, d: true },
];

describe('buildTree', () => {
    it('adds folders the archive leaves implicit and totals them', () => {
        const nodes = index(buildTree(entries));
        expect(nodes.get('world')?.files).toBe(3);
        expect(nodes.get('world/region')?.size).toBe(300);
        expect(nodes.get('logs')?.directory).toBe(true);
        expect(nodes.get('')?.children.map((child) => child.name)).toEqual(['logs', 'world', 'server.properties']);
    });
});

describe('toggle', () => {
    const nodes = index(buildTree(entries));

    it('keeps only the top-most pick', () => {
        let picked = toggle(new Set(), nodes, 'world/region/r.0.0.mca', true);
        picked = toggle(picked, nodes, 'world', true);
        expect([...picked]).toEqual(['world']);
        expect(covered(picked, 'world/region/r.0.1.mca')).toBe(true);
    });

    it('unticking inside a picked folder picks the rest of it', () => {
        const picked = toggle(new Set(['world']), nodes, 'world/region/r.0.0.mca', false);
        expect([...picked].sort()).toEqual(['world/level.dat', 'world/region/r.0.1.mca']);
        expect(partial(picked, 'world')).toBe(true);
        expect(covered(picked, 'world/region/r.0.0.mca')).toBe(false);
        expect(totals(picked, nodes)).toEqual({ files: 2, size: 210 });
    });
});
