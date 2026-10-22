import { nbt, readNbtFile, type NbtCompound, type NbtValue } from './nbt';

/**
 * Reads the surface of a region file (.mca): for every one of its 512×512 columns, the top
 * block, its height and, for water, how deep it is. Drawing is left to the caller.
 */

export interface RegionSurface {
    /** Block names; `blocks` holds indexes into this list, 0 meaning nothing was loaded there. */
    names: string[];
    blocks: Uint16Array;
    heights: Int16Array;
    waterDepth: Uint8Array;
    chunks: number;
}

const SIZE = 512;

/** Blocks that do not count as ground when scanning down through the Nether. */
const AIR = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

interface Section {
    palette: string[];
    data: BigInt64Array | null;
    bits: number;
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
function packed(data: BigInt64Array, index: number, bits: number): number {
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
    // 1 gzip, 2 zlib, 3 none. LZ4 (4) and external chunk files are skipped.
    if (compression === 3) return readNbtFile(bytes);
    if (compression === 1 || compression === 2) return readNbtFile(bytes);

    return null;
}

export async function readRegion(buffer: ArrayBuffer, dimension: string, onProgress?: (fraction: number) => void): Promise<RegionSurface> {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const names = ['minecraft:air'];
    const nameIndex = new Map<string, number>([['minecraft:air', 0]]);
    const blocks = new Uint16Array(SIZE * SIZE);
    const heights = new Int16Array(SIZE * SIZE);
    const waterDepth = new Uint8Array(SIZE * SIZE);
    let chunks = 0;

    const indexOf = (name: string) => {
        let index = nameIndex.get(name);
        if (index === undefined) {
            index = names.length;
            names.push(name);
            nameIndex.set(name, index);
        }

        return index;
    };

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
        const chunkX = slot & 31;
        const chunkZ = slot >> 5;
        chunks++;

        for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
                let y: number;

                if (dimension === 'the_nether') {
                    // Under the bedrock roof: the first ground below open air.
                    y = 120;
                    let seenAir = false;
                    for (; y > minY; y--) {
                        const air = AIR.has(blockAt(sections, x, y, z));
                        if (air) seenAir = true;
                        else if (seenAir) break;
                    }
                } else if (surface instanceof BigInt64Array) {
                    y = minY + packed(surface, z * 16 + x, 9) - 1;
                } else {
                    continue;
                }

                let name = blockAt(sections, x, y, z);
                // Light and air sometimes top the heightmap; step down to something visible.
                for (let guard = 0; AIR.has(name) && guard < 8 && y > minY; guard++) name = blockAt(sections, x, --y, z);

                let depth = 0;
                if (name === 'minecraft:water' || name === 'minecraft:bubble_column') {
                    while (depth < 15 && /water|bubble_column|seagrass|kelp/.test(blockAt(sections, x, y - depth - 1, z))) depth++;
                }

                const pixel = (chunkZ * 16 + z) * SIZE + chunkX * 16 + x;
                blocks[pixel] = indexOf(name);
                heights[pixel] = y;
                waterDepth[pixel] = depth;
            }
        }
    }

    onProgress?.(1);

    return { names, blocks, heights, waterDepth, chunks };
}
