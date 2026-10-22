import { decompressLz4Java } from './lz4';
import { nbt, readNbtFile, type NbtCompound, type NbtValue } from './nbt';
import { isPumpRegion, readPumpRegion } from './pump';

/**
 * Reads the surface of a region file: for every one of its 512×512 columns, the top block,
 * its height and, for water, how deep it is. Drawing is left to the caller. Anvil (.mca) is
 * read here; Pumpkin's own .pump format in pump.ts, through the same column scan.
 */

export interface RegionSurface {
    /** Block names; `blocks` holds indexes into this list, 0 meaning nothing was loaded there. */
    names: string[];
    blocks: Uint16Array;
    heights: Int16Array;
    waterDepth: Uint8Array;
    chunks: number;
}

export const SIZE = 512;

/** Blocks that do not count as ground when scanning down through the Nether. */
const AIR = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

interface Section {
    palette: string[];
    data: BigInt64Array | null;
    bits: number;
}

/** Surface data being collected for one region. */
export class SurfaceBuilder {
    readonly names = ['minecraft:air'];
    readonly blocks = new Uint16Array(SIZE * SIZE);
    readonly heights = new Int16Array(SIZE * SIZE);
    readonly waterDepth = new Uint8Array(SIZE * SIZE);
    chunks = 0;
    private readonly nameIndex = new Map<string, number>([['minecraft:air', 0]]);

    constructor(private readonly dimension: string) {}

    private indexOf(name: string): number {
        let index = this.nameIndex.get(name);
        if (index === undefined) {
            index = this.names.length;
            this.names.push(name);
            this.nameIndex.set(name, index);
        }

        return index;
    }

    /**
     * Scans the 16×16 columns of one chunk. `blockAt` takes chunk-local x and z and a world y;
     * `surface` is the packed WORLD_SURFACE heightmap, when the chunk has one.
     */
    addChunk(chunkX: number, chunkZ: number, minY: number, surface: BigInt64Array | null, blockAt: (x: number, y: number, z: number) => string): void {
        this.chunks++;

        for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
                let y: number;

                if (this.dimension === 'the_nether') {
                    // Under the bedrock roof: the first ground below open air.
                    y = 120;
                    let seenAir = false;
                    for (; y > minY; y--) {
                        const air = AIR.has(blockAt(x, y, z));
                        if (air) seenAir = true;
                        else if (seenAir) break;
                    }
                } else if (surface) {
                    y = minY + packed(surface, z * 16 + x, 9) - 1;
                } else {
                    continue;
                }

                let name = blockAt(x, y, z);
                // Light and air sometimes top the heightmap; step down to something visible.
                for (let guard = 0; AIR.has(name) && guard < 8 && y > minY; guard++) name = blockAt(x, --y, z);

                let depth = 0;
                if (name === 'minecraft:water' || name === 'minecraft:bubble_column') {
                    while (depth < 15 && /water|bubble_column|seagrass|kelp/.test(blockAt(x, y - depth - 1, z))) depth++;
                }

                const pixel = (chunkZ * 16 + z) * SIZE + chunkX * 16 + x;
                this.blocks[pixel] = this.indexOf(name);
                this.heights[pixel] = y;
                this.waterDepth[pixel] = depth;
            }
        }
    }

    result(): RegionSurface {
        return { names: this.names, blocks: this.blocks, heights: this.heights, waterDepth: this.waterDepth, chunks: this.chunks };
    }
}

function sectionsOf(root: NbtCompound): { sections: Map<number, Section>; minY: number } {
    const level = nbt.compound(root.Level);
    const list = nbt.list(root.sections ?? level?.Sections);
    const sections = new Map<number, Section>();

    for (const entry of list) {
        const section = nbt.compound(entry);
        if (!section) continue;
        const states = nbt.compound(section.block_states);
        const palette = nbt.list(states?.palette ?? section.Palette).map((block) => nbt.str(nbt.compound(block)?.Name) ?? 'minecraft:air');
        if (palette.length === 0) continue;

        const data = (states?.data ?? section.BlockStates) as NbtValue | undefined;
        sections.set(nbt.num(section.Y), {
            palette,
            data: data instanceof BigInt64Array ? data : null,
            bits: Math.max(4, Math.ceil(Math.log2(palette.length))),
        });
    }

    // 1.18 and newer start at yPos (usually -4); older worlds start at 0.
    const minY = level ? 0 : nbt.num(root.yPos, -4) * 16;

    return { sections, minY };
}

/** Reads one packed value; since 1.16 values never span two longs. */
export function packed(data: BigInt64Array, index: number, bits: number): number {
    const perLong = Math.floor(64 / bits);
    const long = data[Math.floor(index / perLong)];
    if (long === undefined) return 0;
    const shift = BigInt((index % perLong) * bits);

    return Number((BigInt.asUintN(64, long) >> shift) & ((1n << BigInt(bits)) - 1n));
}

function blockAt(sections: Map<number, Section>, x: number, y: number, z: number): string {
    const section = sections.get(Math.floor(y / 16));
    if (!section) return 'minecraft:air';
    if (!section.data || section.palette.length === 1) return section.palette[0];

    return section.palette[packed(section.data, ((y & 15) << 8) | (z << 4) | x, section.bits)] ?? 'minecraft:air';
}

async function inflateChunk(bytes: Uint8Array, compression: number): Promise<NbtCompound | null> {
    // 1 gzip, 2 zlib, 3 none, 4 LZ4 (Pumpkin's default for Anvil, and vanilla's option since
    // 24w04a). External chunk files (+128) are skipped.
    if (compression === 1 || compression === 2 || compression === 3) return readNbtFile(bytes);
    if (compression === 4) return readNbtFile(decompressLz4Java(bytes));

    return null;
}

export async function readRegion(buffer: ArrayBuffer, dimension: string, onProgress?: (fraction: number) => void): Promise<RegionSurface> {
    if (isPumpRegion(buffer)) return readPumpRegion(buffer, dimension, onProgress);

    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const builder = new SurfaceBuilder(dimension);

    for (let slot = 0; slot < 1024; slot++) {
        if (slot % 32 === 0) {
            onProgress?.(slot / 1024);
            // Let the page breathe between batches of chunks.
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        if (bytes.length < 8192) break;
        const location = view.getUint32(slot * 4);
        const offset = (location >>> 8) * 4096;
        if (offset === 0 || offset + 5 > bytes.length) continue;

        const length = view.getUint32(offset);
        const compression = bytes[offset + 4];
        if (length < 2 || offset + 4 + length > bytes.length) continue;

        let root: NbtCompound | null;
        try {
            root = await inflateChunk(bytes.subarray(offset + 5, offset + 4 + length), compression);
        } catch {
            continue;
        }

        if (!root) continue;
        const status = nbt.str(root.Status) ?? nbt.str(nbt.compound(root.Level)?.Status);
        if (status && !/full|postprocessed|fullchunk/.test(status)) continue;

        const { sections, minY } = sectionsOf(root);
        if (sections.size === 0) continue;

        const heightmaps = nbt.compound(root.Heightmaps ?? nbt.compound(root.Level)?.Heightmaps);
        const surface = heightmaps?.WORLD_SURFACE;
        builder.addChunk(slot & 31, slot >> 5, minY, surface instanceof BigInt64Array ? surface : null, (x, y, z) => blockAt(sections, x, y, z));
    }

    onProgress?.(1);

    return builder.result();
}
