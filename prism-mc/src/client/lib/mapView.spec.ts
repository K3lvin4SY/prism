import { describe, expect, it } from 'vitest';
import { ZOOMS, blockAt, zoomAt, type View } from './mapView';

describe('zooming the map', () => {
    const view: View = { zoom: ZOOMS.indexOf(1), center: [100, -40] };

    it('keeps the block under the pointer where it is, in and out', () => {
        for (const offset of [
            [250, -120],
            [-300, 90],
            [0, 0],
        ] as [number, number][]) {
            for (const step of [1, -1, 3, -4]) {
                const zoomed = zoomAt(view, step, offset);
                const [x, z] = blockAt(zoomed, offset);
                const [x0, z0] = blockAt(view, offset);
                expect(x).toBeCloseTo(x0, 6);
                expect(z).toBeCloseTo(z0, 6);
            }
        }
    });

    it('zooms around the middle without a pointer', () => {
        expect(zoomAt(view, 1).center).toEqual(view.center);
    });

    it('stays put at either end', () => {
        const smallest = { zoom: 0, center: [5, 5] as [number, number] };
        expect(zoomAt(smallest, -1, [200, 200])).toBe(smallest);
        const largest = { zoom: ZOOMS.length - 1, center: [5, 5] as [number, number] };
        expect(zoomAt(largest, 1, [200, 200])).toBe(largest);
    });
});
