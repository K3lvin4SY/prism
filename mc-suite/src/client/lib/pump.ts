import { decompress as zstd } from 'fzstd';
import { SurfaceBuilder, packed, type RegionSurface } from './anvil';
import { nbt, readNbtFile } from './nbt';
import table from './pumpkinBlocks.json';

/**
 * Pumpkin's own region format (.pump), read from its source:
 *
 *  region  256-byte superblock ("PUMP" + version 1, region x and z), then 1024 entries of
 *          (sector offset u32, byte length u32) with 256-byte sectors.
 *  chunk   uncompressed length u32 and XXH64 u64, then a zstd frame. Inside, either NBT like
 *          Anvil or Pumpkin's binary chunk ("PCHK"), which stores global block-state ids.
 *
 * Every number is big-endian.
 */

const SIGNATURE = [0x50, 0x55, 0x4d, 0x50, 0, 0, 0, 1];
const SECTOR = 256;
const PCHK = [0x50, 0x43, 0x48, 0x4b];
const HEIGHTMAP_LONGS = 37;
const VOLUME = 4096;
const LIGHT = 2048;

export function isPumpRegion(buffer: ArrayBuffer): boolean {
    const bytes = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));

    return bytes.length === 8 && SIGNATURE.every((byte, i) => bytes[i] === byte);
}

/** The block name of a global block-state id, from Pumpkin's block list. */
export function stateName(id: number): string {
    const starts = table.starts;
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (starts[middle] <= id) low = middle;
        else high = middle - 1;
    }

    return id >= 0 && id < table.states ? `minecraft:${table.names[low]}` : 'minecraft:air';
}

/** One section's blocks: a single state, or 4096 states in y, z, x order. */
type Blocks = number | Uint16Array;

interface PumpChunk {
    minY: number;
    surface: BigInt64Array | null;
    sections: Blocks[];
}

class Reader {
    offset = 0;
    private readonly view: DataView;

    constructor(readonly bytes: Uint8Array) {
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }

    need(count: number) {
        if (this.offset + count > this.bytes.length) throw new Error('Unexpected end of chunk.');
    }

    u8() {
        this.need(1);

        return this.bytes[this.offset++];
    }

    u16() {
        this.need(2);
        const value = this.view.getUint16(this.offset);
        this.offset += 2;

        return value;
    }

    i32() {
        this.need(4);
        const value = this.view.getInt32(this.offset);
        this.offset += 4;

        return value;
    }

    i64() {
        this.need(8);
        const value = this.view.getBigInt64(this.offset);
        this.offset += 8;

        return value;
    }

    skip(count: number) {
        this.need(count);
        this.offset += count;
    }
}

function readBlocks(reader: Reader): Blocks {
    const mode = reader.u8();
    if (mode === 0) return reader.u16();

    if (mode === 1) {
        const length = reader.u16();
        const palette = new Uint16Array(length);
        for (let i = 0; i < length; i++) {
            palette[i] = reader.u16();
            reader.u16(); // how often the state occurs
        }

        reader.need(VOLUME);
        if (length === 1) {
            reader.skip(VOLUME);

            return palette[0];
        }

        const states = new Uint16Array(VOLUME);
        for (let i = 0; i < VOLUME; i++) states[i] = palette[reader.bytes[reader.offset + i]] ?? 0;
        reader.skip(VOLUME);

        return states;
    }

    if (mode === 2) {
        const states = new Uint16Array(VOLUME);
        for (let i = 0; i < VOLUME; i++) states[i] = reader.u16();

        return states;
    }

    throw new Error(`Unknown block palette mode ${mode}.`);
}

function skipBiomes(reader: Reader) {
    const mode = reader.u8();
    if (mode === 0) {
        reader.skip(1);
    } else if (mode === 1) {
        const length = reader.u8();
        reader.skip(length * 3 + 64);
    } else if (mode === 2) {
        reader.skip(64);
    } else {
        throw new Error(`Unknown biome palette mode ${mode}.`);
    }
}

/** Pumpkin's binary chunk, up to the end of its sections; ticks and block entities are not needed. */
export function readPumpChunk(bytes: Uint8Array): PumpChunk | null {
    const reader = new Reader(bytes);
    for (const byte of PCHK) {
        if (reader.u8() !== byte) throw new Error('Not a Pumpkin chunk.');
    }

    if (reader.u8() !== 1) throw new Error('Unsupported Pumpkin chunk version.');
    reader.skip(4 + 4 + 4); // data version, chunk x, chunk z
    const minY = reader.i32();
    const status = reader.u8();
    const flags = reader.u8();
    reader.skip(8); // inhabited time

    // Only finished chunks (status 9, "full") have their final surface.
    if (status !== 9) return null;

    let surface: BigInt64Array | null = null;
    for (const bit of [1, 2, 3]) {
        if ((flags & (1 << bit)) === 0) continue;
        const heightmap = new BigInt64Array(HEIGHTMAP_LONGS);
        for (let i = 0; i < HEIGHTMAP_LONGS; i++) heightmap[i] = reader.i64();
        if (bit === 1) surface = heightmap;
    }

    const count = reader.u16();
    const sections: Blocks[] = [];
    for (let i = 0; i < count; i++) {
        sections.push(readBlocks(reader));
        skipBiomes(reader);
        const light = reader.u8();
        if (light & 1) reader.skip(LIGHT);
        if (light & 2) reader.skip(LIGHT);
    }

    return { minY, surface, sections };
}

function blockAt(chunk: PumpChunk, x: number, y: number, z: number): string {
    const section = chunk.sections[Math.floor((y - chunk.minY) / 16)];
    if (section === undefined) return 'minecraft:air';
    if (typeof section === 'number') return stateName(section);

    return stateName(section[(((y - chunk.minY) & 15) << 8) | (z << 4) | x]);
}

export async function readPumpRegion(buffer: ArrayBuffer, dimension: string, onProgress?: (fraction: number) => void): Promise<RegionSurface> {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const builder = new SurfaceBuilder(dimension);
    const tableStart = SECTOR;

    for (let slot = 0; slot < 1024; slot++) {
        if (slot % 32 === 0) {
            onProgress?.(slot / 1024);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        if (bytes.length < tableStart + 1024 * 8) break;
        const sector = view.getUint32(tableStart + slot * 8);
        const length = view.getUint32(tableStart + slot * 8 + 4);
        const start = sector * SECTOR;
        if (sector === 0 || length < 12 || start + length > bytes.length) continue;

        try {
            const size = view.getUint32(start);
            const raw = zstd(bytes.subarray(start + 12, start + length));
            if (raw.length !== size) continue;

            const chunkX = slot & 31;
            const chunkZ = slot >> 5;

            if (PCHK.every((byte, i) => raw[i] === byte)) {
                const chunk = readPumpChunk(raw);
                if (chunk) builder.addChunk(chunkX, chunkZ, chunk.minY, chunk.surface, (x, y, z) => blockAt(chunk, x, y, z));
                continue;
            }

            // Chunks Pumpkin converted from Anvil keep their NBT until they are rewritten.
            const root = await readNbtFile(raw);
            const nested = readRegionChunkNbt(root);
            if (nested) builder.addChunk(chunkX, chunkZ, nested.minY, nested.surface, nested.blockAt);
        } catch {
            // A damaged chunk is left blank.
        }
    }

    onProgress?.(1);

    return builder.result();
}

/** An NBT chunk inside a pump file, read the way anvil.ts reads its chunks. */
function readRegionChunkNbt(root: Awaited<ReturnType<typeof readNbtFile>>) {
    const status = nbt.str(root.Status);
    if (status && !/full/.test(status)) return null;

    const palettes = new Map<number, { palette: string[]; data: BigInt64Array | null; bits: number }>();
    for (const entry of nbt.list(root.sections)) {
        const section = nbt.compound(entry);
        const states = nbt.compound(section?.block_states);
        if (!section || !states) continue;
        const palette = nbt.list(states.palette).map((block) => nbt.str(nbt.compound(block)?.Name) ?? 'minecraft:air');
        if (palette.length === 0) continue;
        palettes.set(nbt.num(section.Y), { palette, data: states.data instanceof BigInt64Array ? states.data : null, bits: Math.max(4, Math.ceil(Math.log2(palette.length))) });
    }

    const surface = nbt.compound(root.Heightmaps)?.WORLD_SURFACE;

    return {
        minY: nbt.num(root.yPos, -4) * 16,
        surface: surface instanceof BigInt64Array ? surface : null,
        blockAt: (x: number, y: number, z: number) => {
            const section = palettes.get(Math.floor(y / 16));
            if (!section) return 'minecraft:air';
            if (!section.data || section.palette.length === 1) return section.palette[0];

            return section.palette[packed(section.data, ((y & 15) << 8) | (z << 4) | x, section.bits)] ?? 'minecraft:air';
        },
    };
}
