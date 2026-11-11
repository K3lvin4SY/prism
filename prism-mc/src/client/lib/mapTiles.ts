import { http } from '@pterodactyl/sdk';
import { base } from '../api/client';
import type { RegionSurface } from './anvil';
import { blockColor, type Rgb } from './blockColors';
import { loadArea, pruneRegions, regionKey, saveRegion, type StoredRegion } from './mapCache';
import { readRegionInWorker } from './regionPool';

/**
 * The pictures of a world map, one per region, kept for the whole visit: a region that leaves the
 * view stays in memory and is painted again the moment it comes back. Nothing is let go on a
 * timer. Only regions the world no longer has are dropped.
 *
 * Each region has a 128px picture for zoomed-out views and its full 512px picture, kept
 * compressed and decoded once the map is zoomed in far enough to need it. Pictures are also
 * kept in the browser (mapCache.ts) and only drawn again when the region file has been saved
 * since. Drawing downloads the file, reads it in a worker (regionPool.ts) and colors it here.
 */

export const REGION = 512;
export const THUMB = 128;
/** Raise this when the drawing changes, so pictures kept from before are drawn again. */
export const DRAW_VERSION = 1;

/** Regions being loaded or drawn at once. */
const JOBS = 6;
/** Region files downloading at once; each is a few megabytes. */
const DOWNLOADS = 4;
/** A region that fails this often is left blank until its file changes. */
const ATTEMPTS = 2;
/** After the Panel's rate limit refused a region even after waiting, it is tried again this much later. */
const RATE_LIMITED_WAIT = 15_000;

/** A 429: the Panel's rate limit, not a broken file. */
function rateLimited(error: unknown): boolean {
    return (error as { response?: { status?: number } } | null)?.response?.status === 429;
}

export interface RegionInfo {
    x: number;
    z: number;
    size: number;
    modified: string | null;
}

export interface Tile {
    /** The 128px picture. */
    thumb: ImageBitmap;
    /** The 512px picture, decoded once the map is zoomed in far enough to need it. */
    full: ImageBitmap | null;
    /** The 512px picture as a PNG. */
    image: Blob;
    /** When the region file was saved, as the Panel reported it when this was drawn. */
    modified: string | null;
    version: number;
    /** Drawn on this visit, from the file the Panel listed. */
    fresh: boolean;
}

class Limit {
    private active = 0;
    private readonly waiting: (() => void)[] = [];

    constructor(private readonly size: number) {}

    async run<T>(work: () => Promise<T>): Promise<T> {
        if (this.active >= this.size) await new Promise<void>((resolve) => this.waiting.push(resolve));
        this.active++;
        try {
            return await work();
        } finally {
            this.active--;
            this.waiting.shift()?.();
        }
    }
}

const downloads = new Limit(DOWNLOADS);

/** Colors a region's surface, shading by height like an in-game map and by depth under water. */
export function shade(surface: RegionSurface, colors: Rgb[]): ImageData {
    const image = new ImageData(REGION, REGION);
    const data = image.data;
    const { blocks, heights, waterDepth } = surface;

    for (let z = 0; z < REGION; z++) {
        for (let x = 0; x < REGION; x++) {
            const pixel = z * REGION + x;
            const index = blocks[pixel];
            if (index === 0) continue;

            const color = colors[index];
            let light = 1;
            const depth = waterDepth[pixel];
            if (depth > 0) {
                light = 1.05 - Math.min(depth, 12) * 0.035;
            } else if (z > 0 && blocks[pixel - REGION] !== 0) {
                const difference = heights[pixel] - heights[pixel - REGION];
                light = difference > 0 ? 1.12 : difference < 0 ? 0.82 : 1;
            }

            const offset = pixel * 4;
            data[offset] = Math.min(255, color[0] * light);
            data[offset + 1] = Math.min(255, color[1] * light);
            data[offset + 2] = Math.min(255, color[2] * light);
            data[offset + 3] = 255;
        }
    }

    return image;
}

async function encode(picture: ImageBitmap, size: number): Promise<Blob> {
    if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(size, size);
        canvas.getContext('2d')!.drawImage(picture, 0, 0);

        return canvas.convertToBlob({ type: 'image/png' });
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d')!.drawImage(picture, 0, 0);

    return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be saved.'))), 'image/png'));
}

const shrink = (source: ImageBitmapSource) => createImageBitmap(source, { resizeWidth: THUMB, resizeHeight: THUMB, resizeQuality: 'medium' });

/** One dimension of one server's map. */
export class MapArea {
    readonly tiles = new Map<string, Tile>();
    /** How far along each region being drawn is. */
    readonly progress = new Map<string, number>();
    private regions = new Map<string, RegionInfo>();
    private readonly stored: Promise<Map<string, StoredRegion>>;
    private wanted: string[] = [];
    private wantFull = false;
    private readonly running = new Map<string, Promise<void>>();
    private readonly failures = new Map<string, number>();
    /** No new regions start before this, after the Panel's rate limit refused one. */
    private waitUntil = 0;
    private readonly listeners = new Set<() => void>();

    constructor(
        readonly server: string,
        readonly dimension: string
    ) {
        this.stored = loadArea(server, dimension)
            .catch(() => [])
            .then((records) => new Map(records.map((record) => [record.key, record])));
    }

    key(x: number, z: number): string {
        return regionKey(this.server, this.dimension, x, z);
    }

    /** Called whenever a picture or a region's progress changes. */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
    }

    private emit() {
        for (const listener of this.listeners) listener();
    }

    /** The regions the world has, as the Panel lists them. */
    setRegions(list: RegionInfo[]) {
        const next = new Map(list.map((region) => [this.key(region.x, region.z), region]));
        for (const [key, region] of next) {
            if (this.regions.get(key)?.modified !== region.modified) this.failures.delete(key);
        }
        // Pictures of regions the world no longer has are let go, here and in the browser.
        for (const key of [...this.tiles.keys()]) {
            if (!next.has(key)) this.tiles.delete(key);
        }
        this.regions = next;
        void pruneRegions(this.server, this.dimension, new Set(next.keys()));
        this.emit();
        this.pump();
    }

    /**
     * The regions in view, nearest the middle first, and whether they are shown large enough to
     * need their full pictures. Regions that leave the view keep their pictures.
     */
    want(keys: string[], full: boolean) {
        this.wanted = keys;
        this.wantFull = full;
        this.pump();
    }

    /** Whether a picture is of the file the Panel lists now. */
    isCurrent(key: string, tile = this.tiles.get(key)): boolean {
        const region = this.regions.get(key);
        if (!tile || !region || tile.version !== DRAW_VERSION || tile.modified !== region.modified) return false;

        // Without a save time the picture cannot be checked, so it is drawn once per visit.
        return tile.modified !== null || tile.fresh;
    }

    private done(key: string, full: boolean): boolean {
        const tile = this.tiles.get(key);

        return !!tile && this.isCurrent(key, tile) && (!full || !!tile.full);
    }

    private gaveUp(key: string): boolean {
        return (this.failures.get(key) ?? 0) >= ATTEMPTS;
    }

    /** How many regions in view are still to be drawn. */
    remaining(): number {
        return this.wanted.filter((key) => this.regions.has(key) && !this.isCurrent(key) && !this.gaveUp(key)).length;
    }

    private start(key: string, job: () => Promise<unknown>) {
        const promise = job()
            .then(() => undefined)
            .catch((error: unknown) => {
                // Too many requests is not the file's fault: the region waits and is tried again.
                if (rateLimited(error)) {
                    this.waitUntil = Date.now() + RATE_LIMITED_WAIT;
                    setTimeout(() => this.pump(), RATE_LIMITED_WAIT);
                    return;
                }
                this.failures.set(key, (this.failures.get(key) ?? 0) + 1);
            })
            .finally(() => {
                this.running.delete(key);
                this.progress.delete(key);
                this.emit();
                this.pump();
            });
        this.running.set(key, promise);
    }

    private pump() {
        if (Date.now() < this.waitUntil) return;
        for (const key of this.wanted) {
            if (this.running.size >= JOBS) return;
            if (this.running.has(key) || !this.regions.has(key) || this.gaveUp(key) || this.done(key, this.wantFull)) continue;
            this.start(key, () => this.ensure(key));
        }

        // With the view taken care of, the other kept pictures are made ready too, so moving and
        // zooming out shows them at once.
        if (this.running.size >= JOBS) return;
        void this.stored.then((stored) => {
            for (const key of stored.keys()) {
                if (this.running.size >= JOBS) return;
                if (this.tiles.has(key) || this.running.has(key) || !this.regions.has(key)) continue;
                this.start(key, () => this.fromStore(key));
            }
        });
    }

    /** Puts the picture kept in the browser on the map, when there is one. */
    private async fromStore(key: string): Promise<void> {
        if (this.tiles.has(key)) return;
        const record = (await this.stored).get(key);
        if (!record || this.tiles.has(key)) return;

        const thumb = await shrink(record.thumb ?? record.image);
        if (this.tiles.has(key)) return thumb.close();
        this.tiles.set(key, { thumb, full: null, image: record.image, modified: record.modified, version: record.version, fresh: false });
        this.emit();

        // Pictures kept before there were small ones get theirs now.
        if (!record.thumb) {
            const small = await encode(thumb, THUMB);
            const updated = { ...record, thumb: small };
            (await this.stored).set(key, updated);
            void saveRegion(updated);
        }
    }

    private async ensure(key: string): Promise<void> {
        await this.fromStore(key);

        const tile = this.tiles.get(key);
        if (tile && this.wantFull && !tile.full) {
            tile.full = await createImageBitmap(tile.image);
            this.emit();
        }
        if (tile && this.isCurrent(key, tile)) return;

        await this.draw(key);
    }

    private async draw(key: string): Promise<void> {
        const region = this.regions.get(key);
        if (!region) return;
        this.progress.set(key, 0);
        this.emit();

        // The save time in the address lets the browser keep the file until it changes.
        const buffer = await downloads.run(
            async () =>
                (
                    await http.get<ArrayBuffer>(`${base(this.server)}/map/${this.dimension}/${region.x}/${region.z}`, {
                        responseType: 'arraybuffer',
                        params: region.modified ? { v: region.modified } : undefined,
                    })
                ).data
        );
        const surface = await readRegionInWorker(buffer, this.dimension, (fraction) => {
            this.progress.set(key, fraction);
            this.emit();
        });
        const colors = await Promise.all(surface.names.map((name) => blockColor(name)));

        const full = await createImageBitmap(shade(surface, colors));
        const thumb = await shrink(full);
        const [image, small] = await Promise.all([encode(full, REGION), encode(thumb, THUMB)]);

        // The decoded full picture is only kept while it is needed; the PNG stays either way.
        const keepFull = this.wantFull;
        const before = this.tiles.get(key);
        before?.thumb.close();
        before?.full?.close();
        this.tiles.set(key, { thumb, full: keepFull ? full : null, image, modified: region.modified, version: DRAW_VERSION, fresh: true });
        if (!keepFull) full.close();
        this.emit();

        const record: StoredRegion = { key, server: this.server, dimension: this.dimension, modified: region.modified, version: DRAW_VERSION, image, thumb: small, drawnAt: Date.now() };
        (await this.stored).set(key, record);
        void saveRegion(record);
    }
}

const areas = new Map<string, MapArea>();

/** The map of one dimension of a server, the same one for the whole visit. */
export function mapArea(server: string, dimension: string): MapArea {
    const key = `${server}:${dimension}`;
    let area = areas.get(key);
    if (!area) {
        area = new MapArea(server, dimension);
        areas.set(key, area);
    }

    return area;
}
