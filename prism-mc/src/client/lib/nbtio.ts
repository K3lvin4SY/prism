/**
 * Java Edition NBT that keeps every tag's type, so a file can be read, changed and written back
 * exactly. nbt.ts reads into plain values for display; this is for editing player files.
 */

export const TAG = { End: 0, Byte: 1, Short: 2, Int: 3, Long: 4, Float: 5, Double: 6, ByteArray: 7, String: 8, List: 9, Compound: 10, IntArray: 11, LongArray: 12 } as const;

export type Tag =
    | { type: 1 | 2 | 3 | 5 | 6; value: number }
    | { type: 4; value: bigint }
    | { type: 7; value: Int8Array }
    | { type: 8; value: string }
    | { type: 9; element: number; value: Tag[] }
    | { type: 10; value: Map<string, Tag> }
    | { type: 11; value: Int32Array }
    | { type: 12; value: BigInt64Array };

export type CompoundTag = Extract<Tag, { type: 10 }>;
export type ListTag = Extract<Tag, { type: 9 }>;

export type Compression = 'gzip' | 'deflate' | 'none';

/** A root compound with its name, as stored in a file, and how the file was compressed. */
export interface NbtFile {
    name: string;
    root: CompoundTag;
    compression: Compression;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

class Reader {
    private offset = 0;
    private readonly view: DataView;

    constructor(private readonly bytes: Uint8Array) {
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }

    private take(size: number): number {
        const at = this.offset;
        if (at + size > this.bytes.byteLength) throw new Error('The NBT data ends too early.');
        this.offset += size;

        return at;
    }

    string(): string {
        const length = this.view.getUint16(this.take(2));
        const at = this.take(length);

        return decoder.decode(this.bytes.subarray(at, at + length));
    }

    tag(type: number, depth: number): Tag {
        if (depth > 512) throw new Error('NBT nests too deeply.');
        switch (type) {
            case 1:
                return { type, value: this.view.getInt8(this.take(1)) };
            case 2:
                return { type, value: this.view.getInt16(this.take(2)) };
            case 3:
                return { type, value: this.view.getInt32(this.take(4)) };
            case 4:
                return { type, value: this.view.getBigInt64(this.take(8)) };
            case 5:
                return { type, value: this.view.getFloat32(this.take(4)) };
            case 6:
                return { type, value: this.view.getFloat64(this.take(8)) };
            case 7: {
                const length = this.view.getInt32(this.take(4));
                const at = this.take(length);

                return { type, value: new Int8Array(this.bytes.slice(at, at + length).buffer) };
            }
            case 8:
                return { type, value: this.string() };
            case 9: {
                const element = this.view.getInt8(this.take(1));
                const length = this.view.getInt32(this.take(4));
                const value: Tag[] = [];
                for (let i = 0; i < length; i++) value.push(this.tag(element, depth + 1));

                return { type, element, value };
            }
            case 10: {
                const value = new Map<string, Tag>();
                for (;;) {
                    const child = this.view.getInt8(this.take(1));
                    if (child === 0) return { type, value };
                    const name = this.string();
                    value.set(name, this.tag(child, depth + 1));
                }
            }
            case 11: {
                const length = this.view.getInt32(this.take(4));
                const value = new Int32Array(length);
                for (let i = 0; i < length; i++) value[i] = this.view.getInt32(this.take(4));

                return { type, value };
            }
            case 12: {
                const length = this.view.getInt32(this.take(4));
                const value = new BigInt64Array(length);
                for (let i = 0; i < length; i++) value[i] = this.view.getBigInt64(this.take(8));

                return { type, value };
            }
            default:
                throw new Error(`Unknown NBT tag type ${type}.`);
        }
    }

    root(): { name: string; root: CompoundTag } {
        if (this.view.getInt8(this.take(1)) !== 10) throw new Error('The file does not start with a compound tag.');
        const name = this.string();

        return { name, root: this.tag(10, 0) as CompoundTag };
    }
}

class Writer {
    private buffer = new Uint8Array(1024);
    private view = new DataView(this.buffer.buffer);
    private offset = 0;

    private room(size: number): number {
        if (this.offset + size > this.buffer.byteLength) {
            const bigger = new Uint8Array(Math.max(this.buffer.byteLength * 2, this.offset + size));
            bigger.set(this.buffer);
            this.buffer = bigger;
            this.view = new DataView(bigger.buffer);
        }
        const at = this.offset;
        this.offset += size;

        return at;
    }

    /** Grows the buffer first, then writes: the view must be read after room() may replace it. */
    private put(size: number, write: (view: DataView, at: number) => void): void {
        const at = this.room(size);
        write(this.view, at);
    }

    string(value: string): void {
        const bytes = encoder.encode(value);
        if (bytes.byteLength > 65535) throw new Error('A text value is too long for NBT.');
        this.put(2, (view, at) => view.setUint16(at, bytes.byteLength));
        // room() may replace the buffer, so the offset is taken before writing.
        const at = this.room(bytes.byteLength);
        this.buffer.set(bytes, at);
    }

    tag(tag: Tag): void {
        switch (tag.type) {
            case 1:
                return this.put(1, (view, at) => view.setInt8(at, tag.value));
            case 2:
                return this.put(2, (view, at) => view.setInt16(at, tag.value));
            case 3:
                return this.put(4, (view, at) => view.setInt32(at, tag.value));
            case 4:
                return this.put(8, (view, at) => view.setBigInt64(at, tag.value));
            case 5:
                return this.put(4, (view, at) => view.setFloat32(at, tag.value));
            case 6:
                return this.put(8, (view, at) => view.setFloat64(at, tag.value));
            case 7:
                this.put(4, (view, at) => view.setInt32(at, tag.value.length));
                {
                    const at = this.room(tag.value.length);
                    this.buffer.set(new Uint8Array(tag.value.buffer, tag.value.byteOffset, tag.value.byteLength), at);
                }

                return;
            case 8:
                return this.string(tag.value);
            case 9: {
                const element = tag.value.length > 0 ? tag.value[0].type : tag.element;
                this.put(1, (view, at) => view.setInt8(at, element));
                this.put(4, (view, at) => view.setInt32(at, tag.value.length));
                for (const item of tag.value) {
                    if (item.type !== element) throw new Error('A list holds tags of different types.');
                    this.tag(item);
                }

                return;
            }
            case 10:
                for (const [name, child] of tag.value) {
                    this.put(1, (view, at) => view.setInt8(at, child.type));
                    this.string(name);
                    this.tag(child);
                }
                this.put(1, (view, at) => view.setInt8(at, 0));

                return;
            case 11:
                this.put(4, (view, at) => view.setInt32(at, tag.value.length));
                for (const item of tag.value) this.put(4, (view, at) => view.setInt32(at, item));

                return;
            case 12:
                this.put(4, (view, at) => view.setInt32(at, tag.value.length));
                for (const item of tag.value) this.put(8, (view, at) => view.setBigInt64(at, item));

                return;
        }
    }

    root(name: string, root: CompoundTag): Uint8Array {
        this.put(1, (view, at) => view.setInt8(at, 10));
        this.string(name);
        this.tag(root);

        return this.buffer.slice(0, this.offset);
    }
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
    const body = new Response(bytes as BodyInit).body!.pipeThrough(stream);

    return new Uint8Array(await new Response(body).arrayBuffer());
}

export function readTypedNbt(bytes: Uint8Array): { name: string; root: CompoundTag } {
    return new Reader(bytes).root();
}

export function writeTypedNbt(name: string, root: CompoundTag): Uint8Array {
    return new Writer().root(name, root);
}

/** Reads a player file, remembering how it was compressed so it is written back the same way. */
export async function readNbtFileTyped(bytes: Uint8Array): Promise<NbtFile> {
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) return { ...readTypedNbt(await pipe(bytes, new DecompressionStream('gzip'))), compression: 'gzip' };
    if (bytes[0] === 0x78) return { ...readTypedNbt(await pipe(bytes, new DecompressionStream('deflate'))), compression: 'deflate' };

    return { ...readTypedNbt(bytes), compression: 'none' };
}

export async function writeNbtFileTyped(file: NbtFile): Promise<Uint8Array> {
    const plain = writeTypedNbt(file.name, file.root);
    if (file.compression === 'none') return plain;

    return pipe(plain, new CompressionStream(file.compression));
}

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));

    return btoa(binary);
}

/* Building and reading tags. */

export const tag = {
    byte: (value: number): Tag => ({ type: 1, value }),
    short: (value: number): Tag => ({ type: 2, value }),
    int: (value: number): Tag => ({ type: 3, value }),
    string: (value: string): Tag => ({ type: 8, value }),
    list: (element: number, value: Tag[] = []): ListTag => ({ type: 9, element, value }),
    compound: (entries: [string, Tag][] = []): CompoundTag => ({ type: 10, value: new Map(entries) }),
};

export function clone<T extends Tag>(value: T): T {
    switch (value.type) {
        case 9:
            return { type: 9, element: value.element, value: value.value.map(clone) } as T;
        case 10:
            return { type: 10, value: new Map([...value.value].map(([key, child]) => [key, clone(child)])) } as T;
        case 7:
            return { type: 7, value: value.value.slice() } as T;
        case 11:
            return { type: 11, value: value.value.slice() } as T;
        case 12:
            return { type: 12, value: value.value.slice() } as T;
        default:
            return { ...value };
    }
}

export const isCompound = (value: Tag | undefined): value is CompoundTag => value?.type === 10;
export const isList = (value: Tag | undefined): value is ListTag => value?.type === 9;
export const numberOf = (value: Tag | undefined, fallback = 0): number =>
    value && (value.type === 1 || value.type === 2 || value.type === 3 || value.type === 5 || value.type === 6) ? value.value : value?.type === 4 ? Number(value.value) : fallback;
export const stringOf = (value: Tag | undefined): string | null => (value?.type === 8 ? value.value : null);

/** The typed tree as the plain values nbt.ts produces, so the existing readers can show it. */
export function toPlain(value: Tag): import('./nbt').NbtValue {
    switch (value.type) {
        case 9:
            return value.value.map(toPlain);
        case 10:
            return Object.fromEntries([...value.value].map(([key, child]) => [key, toPlain(child)]));
        default:
            return value.value;
    }
}

/** Keeps the type of a number as it was: an int stays an int. */
export function sameKindNumber(previous: Tag | undefined, value: number, fallback: 1 | 2 | 3 = 3): Tag {
    const type = previous && (previous.type === 1 || previous.type === 2 || previous.type === 3) ? previous.type : fallback;

    return { type, value: Math.round(value) } as Tag;
}
