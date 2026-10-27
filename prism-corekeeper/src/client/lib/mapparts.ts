/**
 * Core Keeper's map files, `<n>.mapparts.gzip`: gzipped JSON in which every 256×256-tile part of
 * the explored map is a PNG, one pixel per tile, in the game's own map colors:
 *
 *   {"mapParts":{"keys":[{"x":-1,"y":-1},…],"values":[{"png":[137,80,…],"timestampPng":[…]},…]}}
 *
 * keys[i] and values[i] belong together; x and y count parts, the Core is at tile (0,0) and y
 * points up. Unexplored pixels are transparent. The format is the one CoreKeeperMapTool (MIT)
 * reads. Every PNG byte is a JSON number, so the byte arrays are scanned directly rather than
 * with JSON.parse, which is slow and memory hungry on millions of numbers.
 */

export const PART = 256;

export interface MapPart {
    x: number;
    y: number;
    png: Uint8Array;
}

export interface MapBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

/** Gunzips a map file, or passes plain JSON through as some tools save it. */
export async function readMapFile(data: ArrayBuffer): Promise<Uint8Array> {
    const head = new Uint8Array(data, 0, Math.min(2, data.byteLength));
    if (head[0] === 0x1f && head[1] === 0x8b) {
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));

        return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    if (head[0] === 0x7b || head[0] === 0x20 || head[0] === 0x0a || head[0] === 0x0d) {
        return new Uint8Array(data);
    }

    throw new Error('This is not a Core Keeper map file. Map files end in .mapparts.gzip; world files (.world.gzip) hold no map.');
}

const QUOTE = 0x22;
const isSpace = (byte: number) => byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09;

function find(bytes: Uint8Array, text: string, from = 0): number {
    const pattern = new TextEncoder().encode(text);
    outer: for (let i = from; i <= bytes.length - pattern.length; i++) {
        for (let j = 0; j < pattern.length; j++) {
            if (bytes[i + j] !== pattern[j]) continue outer;
        }

        return i;
    }

    return -1;
}

/** A tiny cursor over JSON bytes, enough to walk the values array. */
class Cursor {
    constructor(
        private readonly bytes: Uint8Array,
        public pos: number
    ) {}

    skipSpace(): number {
        while (this.pos < this.bytes.length && isSpace(this.bytes[this.pos])) this.pos++;

        return this.bytes[this.pos];
    }

    expect(byte: number): void {
        if (this.skipSpace() !== byte) throw new Error(`The map file is damaged near byte ${this.pos}.`);
        this.pos++;
    }

    string(): string {
        this.expect(QUOTE);
        const start = this.pos;
        while (this.pos < this.bytes.length && this.bytes[this.pos] !== QUOTE) {
            if (this.bytes[this.pos] === 0x5c) this.pos++;
            this.pos++;
        }
        const text = new TextDecoder().decode(this.bytes.subarray(start, this.pos));
        this.pos++;

        return text;
    }

    /** A JSON array of byte values, or null. */
    byteArray(): Uint8Array | null {
        if (this.skipSpace() === 0x6e) {
            this.pos += 4;

            return null;
        }
        this.expect(0x5b);
        let out = new Uint8Array(4096);
        let length = 0;
        let value = 0;
        let has = false;
        for (; this.pos < this.bytes.length; this.pos++) {
            const c = this.bytes[this.pos];
            if (c >= 0x30 && c <= 0x39) {
                value = value * 10 + (c - 0x30);
                has = true;
            } else if (c === 0x2c || c === 0x5d) {
                if (has) {
                    if (length === out.length) {
                        const grown = new Uint8Array(out.length * 2);
                        grown.set(out);
                        out = grown;
                    }
                    out[length++] = value;
                    value = 0;
                    has = false;
                }
                if (c === 0x5d) {
                    this.pos++;

                    return out.subarray(0, length);
                }
            }
        }

        throw new Error('The map file ends in the middle of a picture.');
    }

    /** Skips any JSON value. */
    skipValue(): void {
        const c = this.skipSpace();
        if (c === QUOTE) {
            this.string();

            return;
        }
        if (c === 0x7b || c === 0x5b) {
            let depth = 0;
            for (; this.pos < this.bytes.length; this.pos++) {
                const b = this.bytes[this.pos];
                if (b === QUOTE) {
                    this.string();
                    this.pos--;
                } else if (b === 0x7b || b === 0x5b) depth++;
                else if (b === 0x7d || b === 0x5d) {
                    depth--;
                    if (depth === 0) {
                        this.pos++;

                        return;
                    }
                }
            }

            return;
        }
        while (this.pos < this.bytes.length && ![0x2c, 0x7d, 0x5d].includes(this.bytes[this.pos])) this.pos++;
    }
}

/** The map's parts that have a picture, with their part coordinates. */
export function parseMapParts(bytes: Uint8Array): MapPart[] {
    const keysAt = find(bytes, '"keys"');
    const valuesAt = find(bytes, '"values"');
    if (keysAt < 0 || valuesAt < 0) {
        throw new Error('This file has no map parts. If it is a world file, the map is in the maps folder next to the worlds folder.');
    }

    // The keys are small objects: read them as JSON.
    const keysStart = bytes.indexOf(0x5b, keysAt);
    const keysEnd = bytes.indexOf(0x5d, keysStart);
    const keys = JSON.parse(new TextDecoder().decode(bytes.subarray(keysStart, keysEnd + 1))) as ({ x: number; y: number } | null)[];

    const cursor = new Cursor(bytes, bytes.indexOf(0x5b, valuesAt) + 1);
    const pictures: (Uint8Array | null)[] = [];
    while (cursor.skipSpace() !== 0x5d && cursor.pos < bytes.length) {
        if (bytes[cursor.pos] === 0x2c) {
            cursor.pos++;
            continue;
        }
        if (bytes[cursor.pos] === 0x6e) {
            cursor.pos += 4;
            pictures.push(null);
            continue;
        }

        cursor.expect(0x7b);
        let png: Uint8Array | null = null;
        while (cursor.skipSpace() !== 0x7d) {
            if (bytes[cursor.pos] === 0x2c) {
                cursor.pos++;
                continue;
            }
            const key = cursor.string();
            cursor.expect(0x3a);
            if (key === 'png') png = cursor.byteArray();
            else cursor.skipValue();
        }
        cursor.pos++;
        pictures.push(png);
    }

    const parts: MapPart[] = [];
    keys.forEach((key, index) => {
        const png = pictures[index];
        if (key && png && png.length > 8) parts.push({ x: key.x, y: key.y, png });
    });

    return parts;
}

export function boundsOf(parts: { x: number; y: number }[]): MapBounds {
    return parts.reduce<MapBounds>(
        (bounds, part) => ({ minX: Math.min(bounds.minX, part.x), maxX: Math.max(bounds.maxX, part.x), minY: Math.min(bounds.minY, part.y), maxY: Math.max(bounds.maxY, part.y) }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    );
}

/** Where a part's picture goes, in map pixels from the top-left corner. */
export function partOrigin(part: { x: number; y: number }, bounds: MapBounds): { left: number; top: number } {
    return { left: (part.x - bounds.minX) * PART, top: (bounds.maxY - part.y) * PART };
}

/** The tile under a map pixel; the Core is at (0,0) and y points up. */
export function tileAt(pixelX: number, pixelY: number, bounds: MapBounds): { x: number; y: number } {
    return { x: Math.floor(pixelX) + bounds.minX * PART, y: bounds.maxY * PART + PART - 1 - Math.floor(pixelY) };
}

/** The map pixel of a tile: the inverse of tileAt. */
export function pixelOf(tileX: number, tileY: number, bounds: MapBounds): { x: number; y: number } {
    return { x: tileX - bounds.minX * PART, y: bounds.maxY * PART + PART - 1 - tileY };
}
