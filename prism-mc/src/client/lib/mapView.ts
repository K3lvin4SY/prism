/** Where the world map looks and how far it is zoomed in. */

/** Screen pixels per block. At the smallest a region is 16px, so a whole world fits in view. */
export const ZOOMS = [1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8];

export interface View {
    /** An index into ZOOMS. */
    zoom: number;
    /** The block in the middle of the map, as x and z. */
    center: [number, number];
}

export const clampZoom = (zoom: number) => Math.max(0, Math.min(ZOOMS.length - 1, zoom));

/**
 * Zooms by `step` levels around a point given in screen pixels from the middle of the map, so
 * the block under that point stays under it. The buttons zoom around the middle (0, 0).
 */
export function zoomAt(view: View, step: number, offset: [number, number] = [0, 0]): View {
    const zoom = clampZoom(view.zoom + step);
    if (zoom === view.zoom) return view;
    const before = ZOOMS[view.zoom];
    const after = ZOOMS[zoom];

    return {
        zoom,
        center: [view.center[0] + offset[0] / before - offset[0] / after, view.center[1] + offset[1] / before - offset[1] / after],
    };
}

/** The block under a point given in screen pixels from the middle of the map. */
export const blockAt = (view: View, offset: [number, number]): [number, number] => [view.center[0] + offset[0] / ZOOMS[view.zoom], view.center[1] + offset[1] / ZOOMS[view.zoom]];
