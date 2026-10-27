import { describe, expect, it } from 'vitest';
import { boundsOf, parseMapParts, partOrigin, pixelOf, tileAt } from './mapparts';

const PNG = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13];
const bytes = (text: string) => new TextEncoder().encode(text);

describe('parseMapParts', () => {
    it('pairs keys with their pictures and skips empty parts', () => {
        const file = bytes(
            JSON.stringify({
                mapParts: {
                    keys: [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }],
                    values: [{ png: PNG, timestampPng: [1, 2, 3] }, null, { timestampPng: null, png: [...PNG, 255] }],
                },
            })
        );

        const parts = parseMapParts(file);
        expect(parts.map((part) => [part.x, part.y, part.png.length])).toEqual([
            [-1, 0, PNG.length],
            [0, 1, PNG.length + 1],
        ]);
        expect([...parts[1].png].slice(-1)).toEqual([255]);
    });

    it('copes with spaces and other keys in a value', () => {
        const file = bytes('{ "mapParts" : { "values" : [ { "other" : {"a":[1,2]}, "png" : [ 137 , 80, 78, 71, 13, 10, 26, 10, 1 ] } ], "keys" : [ {"x":3,"y":-2} ] } }');
        expect(parseMapParts(file)).toEqual([{ x: 3, y: -2, png: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]) }]);
    });

    it('says when a file has no map parts', () => {
        expect(() => parseMapParts(bytes('{"worlds":[]}'))).toThrow(/no map parts/);
    });
});

describe('coordinates', () => {
    it('puts the Core at tile 0,0 and y upwards', () => {
        const bounds = boundsOf([{ x: -1, y: -1 }, { x: 1, y: 2 }]);
        expect(bounds).toEqual({ minX: -1, maxX: 1, minY: -1, maxY: 2 });
        expect(partOrigin({ x: -1, y: 2 }, bounds)).toEqual({ left: 0, top: 0 });
        expect(partOrigin({ x: 0, y: 0 }, bounds)).toEqual({ left: 256, top: 512 });

        const core = pixelOf(0, 0, bounds);
        expect(core).toEqual({ x: 256, y: 767 });
        expect(tileAt(core.x, core.y, bounds)).toEqual({ x: 0, y: 0 });
        expect(tileAt(core.x + 5, core.y - 3, bounds)).toEqual({ x: 5, y: 3 });
    });
});
