import { describe, expect, it } from 'vitest';
import { readRegion } from './anvil';
import { decompressLz4Java } from './lz4';
import { isPumpRegion, stateName } from './pump';
import table from './pumpkinBlocks.json';

/** Pumpkin's block-state id for a block's first state. */
const stateOf = (name: string) => table.starts[table.names.indexOf(name)];

class Writer {
    private bytes: number[] = [];

    u8(value: number) {
        this.bytes.push(value & 0xff);

        return this;
    }

    u16(value: number) {
        return this.u8(value >> 8).u8(value);
    }

    u32(value: number) {
        return this.u16(value >>> 16).u16(value & 0xffff);
    }

    i64(value: bigint) {
        for (let shift = 56n; shift >= 0n; shift -= 8n) this.u8(Number((BigInt.asUintN(64, value) >> shift) & 0xffn));

        return this;
    }

    raw(values: ArrayLike<number>) {
        for (let i = 0; i < values.length; i++) this.bytes.push(values[i]);

        return this;
    }

    get length() {
        return this.bytes.length;
    }

    done() {
        return new Uint8Array(this.bytes);
    }
}

/** A zstd frame holding the bytes in one stored (raw) block. */
function zstdStored(content: Uint8Array): Uint8Array {
    const out = new Writer().raw([0x28, 0xb5, 0x2f, 0xfd]);
    // Single segment, two-byte content size (stored as size - 256).
    out.u8(0x60).u8((content.length - 256) & 0xff).u8((content.length - 256) >> 8);
    const header = (content.length << 3) | 1; // last block, raw
    out.u8(header).u8(header >> 8).u8(header >> 16);

    return out.raw(content).done();
}

/** One full chunk: stone up to y 63, a grass block at y 64 in every column, air above. */
function pumpChunk(x: number, z: number): Uint8Array {
    const minY = -64;
    const out = new Writer().raw([0x50, 0x43, 0x48, 0x4b]).u8(1);
    out.u32(4671).u32(x).u32(z).u32(minY >>> 0).u8(9).u8(0b10).i64(0n);

    // WORLD_SURFACE: every column is 64 - minY + 1 = 129, nine bits each, seven per long.
    for (let long = 0; long < 37; long++) {
        let value = 0n;
        for (let i = 0; i < 7 && long * 7 + i < 256; i++) value |= 129n << BigInt(i * 9);
        out.i64(value);
    }

    out.u16(24);
    for (let section = 0; section < 24; section++) {
        if (section < 8) {
            out.u8(0).u16(stateOf('stone'));
        } else if (section === 8) {
            // Indexed: grass on the bottom layer, air above it.
            out.u8(1).u16(2).u16(stateOf('grass_block') + 1).u16(256).u16(0).u16(3840);
            const indices = new Uint8Array(4096).fill(1);
            indices.fill(0, 0, 256);
            out.raw(indices);
        } else {
            out.u8(0).u16(0);
        }

        out.u8(0).u8(0); // homogeneous biome 0
        out.u8(0); // no light
    }

    return out.done();
}

function pumpRegion(chunks: Map<number, Uint8Array>): ArrayBuffer {
    const header = new Writer().raw([0x50, 0x55, 0x4d, 0x50, 0, 0, 0, 1]).u32(0).u32(0);
    header.raw(new Uint8Array(256 - header.length));

    const bodies: Uint8Array[] = [];
    let sector = 33;
    const table = new Writer();
    for (let slot = 0; slot < 1024; slot++) {
        const chunk = chunks.get(slot);
        if (!chunk) {
            table.u32(0).u32(0);
            continue;
        }

        const frame = new Writer().u32(chunk.length).i64(0n).raw(zstdStored(chunk)).done();
        table.u32(sector).u32(frame.length);
        const padded = new Uint8Array(Math.ceil(frame.length / 256) * 256);
        padded.set(frame);
        bodies.push(padded);
        sector += padded.length / 256;
    }

    const file = new Writer().raw(header.done()).raw(table.done());
    for (const body of bodies) file.raw(body);

    return file.done().buffer as ArrayBuffer;
}

describe('pump regions', () => {
    it('names block states from the generated table', () => {
        expect(stateName(0)).toBe('minecraft:air');
        expect(stateName(stateOf('stone'))).toBe('minecraft:stone');
        // Any state of a block, not only its first, has the block's name.
        expect(stateName(stateOf('grass_block') + 1)).toBe('minecraft:grass_block');
        expect(stateName(1_000_000)).toBe('minecraft:air');
    });

    it('reads the surface of a Pumpkin region', async () => {
        const buffer = pumpRegion(new Map([[0, pumpChunk(0, 0)], [33, pumpChunk(1, 1)]]));
        expect(isPumpRegion(buffer)).toBe(true);

        const surface = await readRegion(buffer, 'overworld');
        expect(surface.chunks).toBe(2);

        const grass = surface.names.indexOf('minecraft:grass_block');
        expect(grass).toBeGreaterThan(0);
        // Chunk 0 covers pixels 0..15 of the first rows; chunk 33 is one chunk right and down.
        expect(surface.blocks[0]).toBe(grass);
        expect(surface.heights[0]).toBe(64);
        expect(surface.blocks[17 * 512 + 17]).toBe(grass);
        // Columns of chunks that were never written stay empty.
        expect(surface.blocks[40 * 512 + 40]).toBe(0);
    });
});

describe('lz4', () => {
    it('reads the lz4-java block streams of LZ4 region chunks', () => {
        const text = 'abcabcabcabc';
        // One sequence: three literals, then a nine-byte match three bytes back.
        const block = new Uint8Array([0x35, 0x61, 0x62, 0x63, 0x03, 0x00]);
        const frame = (method: number, body: Uint8Array, length: number) =>
            new Writer()
                .raw([0x4c, 0x5a, 0x34, 0x42, 0x6c, 0x6f, 0x63, 0x6b, method])
                .raw([body.length & 0xff, body.length >> 8, 0, 0, length & 0xff, length >> 8, 0, 0, 0, 0, 0, 0])
                .raw(body)
                .done();

        const stream = new Writer()
            .raw(frame(0x26, block, text.length))
            .raw(frame(0x10, new TextEncoder().encode('!'), 1))
            .raw(frame(0x10, new Uint8Array(0), 0))
            .done();

        expect(new TextDecoder().decode(decompressLz4Java(stream))).toBe(text + '!');
    });
});
