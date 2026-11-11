import { describe, expect, it } from 'vitest';
import { packed, packedWord, words } from './anvil';
import { readNbt } from './nbt';

/** The plain bigint reading packed() used to do, to check the faster one against. */
function reference(data: BigInt64Array, index: number, bits: number): number {
    const perLong = Math.floor(64 / bits);
    const long = data[Math.floor(index / perLong)];
    if (long === undefined) return 0;

    return Number((BigInt.asUintN(64, long) >> BigInt((index % perLong) * bits)) & ((1n << BigInt(bits)) - 1n));
}

function randomLongs(count: number, seed: number): BigInt64Array {
    let state = seed;
    const next = () => {
        state = (state * 1103515245 + 12345) >>> 0;

        return BigInt(state);
    };
    const data = new BigInt64Array(count);
    for (let i = 0; i < count; i++) data[i] = BigInt.asIntN(64, (next() << 32n) | next());

    return data;
}

describe('packed values', () => {
    it('match the bigint reading for every width blocks and heightmaps use', () => {
        for (const bits of [4, 5, 6, 7, 8, 9, 10, 12, 15]) {
            const data = randomLongs(Math.ceil(4096 / Math.floor(64 / bits)), bits);
            const halves = words(data);
            for (let index = 0; index < 4096; index++) {
                expect(packedWord(halves, index, bits)).toBe(reference(data, index, bits));
            }
        }
    });

    it('reads past the end as zero', () => {
        const data = randomLongs(2, 1);
        expect(packed(data, 1000, 9)).toBe(0);
        expect(packed(data, 13, 9)).toBe(reference(data, 13, 9));
    });
});

describe('NBT long arrays', () => {
    it('reads big-endian longs, negative ones included', () => {
        const values = [0n, 1n, -1n, 0x0123456789abcdefn, -0x7edcba9876543210n];
        const bytes = [10, 0, 0, 12, 0, 1, 0x61, 0, 0, 0, values.length];
        for (const value of values) {
            const unsigned = BigInt.asUintN(64, value);
            for (let shift = 56n; shift >= 0n; shift -= 8n) bytes.push(Number((unsigned >> shift) & 0xffn));
        }
        bytes.push(0);

        const root = readNbt(new Uint8Array(bytes));
        expect(Array.from(root.a as BigInt64Array)).toEqual(values);
    });

    it('steps over skipped tags of every type and reads what follows', () => {
        const name = (text: string) => [0, text.length, ...Array.from(text, (c) => c.charCodeAt(0))];
        const int = (value: number) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
        const skipped = [
            [1, ...name('s'), 5],
            [2, ...name('s'), 0, 7],
            [3, ...name('s'), ...int(9)],
            [4, ...name('s'), ...int(0), ...int(1)],
            [5, ...name('s'), ...int(0)],
            [6, ...name('s'), ...int(0), ...int(0)],
            [7, ...name('s'), ...int(3), 1, 2, 3],
            [8, ...name('s'), ...name('hello').slice(0)],
            [9, ...name('s'), 3, ...int(2), ...int(1), ...int(2)],
            [9, ...name('s'), 10, ...int(2), 1, ...name('a'), 1, 0, 0],
            [10, ...name('s'), 8, ...name('in'), ...name('x'), 0],
            [11, ...name('s'), ...int(2), ...int(1), ...int(2)],
            [12, ...name('s'), ...int(1), ...int(0), ...int(1)],
        ];

        for (const tag of skipped) {
            const bytes = new Uint8Array([10, 0, 0, ...tag, 3, ...name('kept'), ...int(42), 0]);
            expect(readNbt(bytes, false, true, new Set(['s']))).toEqual({ kept: 42 });
        }
    });

    it('refuses an array longer than the data', () => {
        expect(() => readNbt(new Uint8Array([10, 0, 0, 12, 0, 1, 0x61, 0, 0, 0, 9, 1, 2, 3]))).toThrow();
    });
});
