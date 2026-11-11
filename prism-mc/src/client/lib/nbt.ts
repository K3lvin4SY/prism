/**
 * A reader for Java Edition NBT, the format of player and level files. Numbers become plain
 * numbers, except longs, which become bigints so nothing is rounded.
 */

export type NbtValue = number | bigint | string | NbtValue[] | NbtCompound | Int8Array | Int32Array | BigInt64Array;

export interface NbtCompound {
    [key: string]: NbtValue;
}

const decoder = new TextDecoder();

/** Whether this machine stores numbers little-endian, as typed arrays use its own order. */
export const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

class Reader {
    private offset = 0;
    private readonly view: DataView;

    /**
     * Java files are big-endian; Bedrock files are little-endian. Tags named in `skip` are
     * stepped over without being read, at any depth.
     */
    constructor(
        private readonly bytes: Uint8Array,
        private readonly little = false,
        private readonly skip?: ReadonlySet<string>
    ) {
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }

    byte(): number {
        return this.view.getInt8(this.offset++);
    }

    short(): number {
        const value = this.view.getInt16(this.offset, this.little);
        this.offset += 2;

        return value;
    }

    int(): number {
        const value = this.view.getInt32(this.offset, this.little);
        this.offset += 4;

        return value;
    }

    long(): bigint {
        const value = this.view.getBigInt64(this.offset, this.little);
        this.offset += 8;

        return value;
    }

    float(): number {
        const value = this.view.getFloat32(this.offset, this.little);
        this.offset += 4;

        return value;
    }

    double(): number {
        const value = this.view.getFloat64(this.offset, this.little);
        this.offset += 8;

        return value;
    }

    string(): string {
        const length = this.view.getUint16(this.offset, this.little);
        this.offset += 2;
        // Java writes modified UTF-8; ordinary text decodes the same as UTF-8.
        const value = decoder.decode(this.bytes.subarray(this.offset, this.offset + length));
        this.offset += length;

        return value;
    }

    payload(type: number, depth: number): NbtValue {
        if (depth > 512) throw new Error('NBT nests too deeply.');

        switch (type) {
            case 1:
                return this.byte();
            case 2:
                return this.short();
            case 3:
                return this.int();
            case 4:
                return this.long();
            case 5:
                return this.float();
            case 6:
                return this.double();
            case 7: {
                const length = this.int();
                const value = new Int8Array(this.bytes.buffer.slice(this.bytes.byteOffset + this.offset, this.bytes.byteOffset + this.offset + length));
                this.offset += length;

                return value;
            }
            case 8:
                return this.string();
            case 9: {
                const itemType = this.byte();
                const length = this.int();
                const list: NbtValue[] = [];
                for (let i = 0; i < length; i++) list.push(this.payload(itemType, depth + 1));

                return list;
            }
            case 10: {
                const compound: NbtCompound = {};
                for (;;) {
                    const childType = this.byte();
                    if (childType === 0) return compound;
                    const name = this.string();
                    if (this.skip?.has(name)) this.pass(childType, depth + 1);
                    else compound[name] = this.payload(childType, depth + 1);
                }
            }
            case 11: {
                const length = this.int();
                const value = new Int32Array(length);
                for (let i = 0; i < length; i++) value[i] = this.int();

                return value;
            }
            case 12: {
                const length = this.int();
                if (length < 0 || this.offset + length * 8 > this.bytes.length) throw new Error('A long array runs past the end of the data.');
                const value = new BigInt64Array(length);
                // Region files hold millions of longs, so the bytes are copied in place of
                // making a bigint for each one.
                if (this.little === LITTLE_ENDIAN) {
                    new Uint8Array(value.buffer).set(this.bytes.subarray(this.offset, this.offset + length * 8));
                } else {
                    const target = new Uint8Array(value.buffer);
                    const source = this.bytes;
                    const start = this.offset;
                    for (let i = 0; i < length * 8; i += 8) {
                        for (let b = 0; b < 8; b++) target[i + b] = source[start + i + 7 - b];
                    }
                }
                this.offset += length * 8;

                return value;
            }
            default:
                throw new Error(`Unknown NBT tag type ${type}.`);
        }
    }

    /** Steps over a value without reading it. */
    private pass(type: number, depth: number): void {
        if (depth > 512) throw new Error('NBT nests too deeply.');
        const sizes = [0, 1, 2, 4, 8, 4, 8];

        if (type >= 1 && type <= 6) {
            this.offset += sizes[type];
        } else if (type === 7) {
            // The length is read first: `offset += int()` would add it to the offset from before.
            const length = this.int();
            this.offset += length;
        } else if (type === 8) {
            const length = this.view.getUint16(this.offset, this.little);
            this.offset += length + 2;
        } else if (type === 9) {
            const itemType = this.byte();
            const length = this.int();
            if (itemType >= 1 && itemType <= 6) this.offset += length * sizes[itemType];
            else for (let i = 0; i < length; i++) this.pass(itemType, depth + 1);
        } else if (type === 10) {
            for (;;) {
                const childType = this.byte();
                if (childType === 0) break;
                const nameLength = this.view.getUint16(this.offset, this.little);
                this.offset += nameLength + 2;
                this.pass(childType, depth + 1);
            }
        } else if (type === 11) {
            const length = this.int();
            this.offset += length * 4;
        } else if (type === 12) {
            const length = this.int();
            this.offset += length * 8;
        } else if (type !== 0) {
            throw new Error(`Unknown NBT tag type ${type}.`);
        }

        if (this.offset > this.bytes.length) throw new Error('A value runs past the end of the data.');
    }

    root(named = true): NbtCompound {
        const type = this.byte();
        if (type !== 10) throw new Error('The file does not start with a compound tag.');
        if (named) this.string();

        return this.payload(10, 0) as NbtCompound;
    }
}

/**
 * `named` false reads network-style NBT, whose root compound has no name. Tags named in `skip`
 * are left out, which saves time on data that is not needed.
 */
export function readNbt(bytes: Uint8Array, littleEndian = false, named = true, skip?: ReadonlySet<string>): NbtCompound {
    return new Reader(bytes, littleEndian, skip).root(named);
}

async function inflate(bytes: Uint8Array, format: 'gzip' | 'deflate'): Promise<Uint8Array> {
    const stream = new Response(bytes as BodyInit).body!.pipeThrough(new DecompressionStream(format));

    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads a player or level file: gzip-compressed, zlib-compressed or plain NBT. */
export async function readNbtFile(bytes: Uint8Array, skip?: ReadonlySet<string>): Promise<NbtCompound> {
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) return readNbt(await inflate(bytes, 'gzip'), false, true, skip);
    if (bytes[0] === 0x78) return readNbt(await inflate(bytes, 'deflate'), false, true, skip);

    return readNbt(bytes, false, true, skip);
}

export function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    return bytes;
}

/** Small helpers for reading values of a known shape. */
export const nbt = {
    num(value: NbtValue | undefined, fallback = 0): number {
        if (typeof value === 'number') return value;
        if (typeof value === 'bigint') return Number(value);

        return fallback;
    },
    str(value: NbtValue | undefined): string | null {
        return typeof value === 'string' ? value : null;
    },
    list(value: NbtValue | undefined): NbtValue[] {
        return Array.isArray(value) ? value : [];
    },
    compound(value: NbtValue | undefined): NbtCompound | null {
        return value !== null && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value) ? (value as NbtCompound) : null;
    },
};
