import { describe, expect, it } from 'vitest';
import { addPath, coveredBy, crumbs } from './paths';

describe('coveredBy', () => {
    it('finds the shared folder above a path, and not a folder that only starts the same', () => {
        expect(coveredBy(['/world'], '/world/screenshots/a.png')).toBe('/world');
        expect(coveredBy(['/world'], '/world')).toBe('/world');
        expect(coveredBy(['/world'], '/world_nether')).toBeNull();
        expect(coveredBy(['/'], '/anything')).toBe('/');
    });
});

describe('addPath', () => {
    it('drops what a newly shared folder covers', () => {
        expect(addPath(['/world/a.png', '/mods', '/world/b'], '/world')).toEqual(['/mods', '/world']);
        expect(addPath(['/mods', '/world'], '/')).toEqual(['/']);
    });

    it('adds nothing a shared folder already covers', () => {
        expect(addPath(['/world'], '/world/a.png')).toEqual(['/world']);
    });
});

describe('crumbs', () => {
    it('lists every folder from the top', () => {
        expect(crumbs('/')).toEqual([{ name: '/', path: '/' }]);
        expect(crumbs('/world/screenshots')).toEqual([
            { name: '/', path: '/' },
            { name: 'world', path: '/world' },
            { name: 'screenshots', path: '/world/screenshots' },
        ]);
    });
});
