/**
 * LZ4 as Minecraft writes it in region files (compression type 4): lz4-java's block stream,
 * a run of "LZ4Block" frames, each either stored or holding one raw LZ4 block.
 */

const MAGIC = [0x4c, 0x5a, 0x34, 0x42, 0x6c, 0x6f, 0x63, 0x6b]; // "LZ4Block"
const HEADER = MAGIC.length + 1 + 4 + 4 + 4;
const RAW = 0x10;
const COMPRESSED = 0x20;

export function decompressLz4Java(input: Uint8Array): Uint8Array {
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    const parts: Uint8Array[] = [];
    let total = 0;
    let offset = 0;

    while (offset + HEADER <= input.length) {
        for (let i = 0; i < MAGIC.length; i++) {
            if (input[offset + i] !== MAGIC[i]) throw new Error('Not an LZ4 block stream.');
        }

        const method = input[offset + MAGIC.length] & 0xf0;
        const compressedLength = view.getInt32(offset + MAGIC.length + 1, true);
        const length = view.getInt32(offset + MAGIC.length + 5, true);
        offset += HEADER;

        // An empty frame ends the stream.
        if (length === 0) break;
        if (compressedLength < 0 || length < 0 || offset + compressedLength > input.length) throw new Error('Truncated LZ4 block.');

        const body = input.subarray(offset, offset + compressedLength);
        offset += compressedLength;

        if (method === RAW) {
            parts.push(body);
        } else if (method === COMPRESSED) {
            parts.push(decompressBlock(body, length));
        } else {
            throw new Error('Unknown LZ4 block method.');
        }

        total += length;
    }

    if (parts.length === 1) return parts[0];
    const output = new Uint8Array(total);
    let position = 0;
    for (const part of parts) {
        output.set(part, position);
        position += part.length;
    }

    return output;
}

/** Decodes one raw LZ4 block into exactly `length` bytes. */
export function decompressBlock(input: Uint8Array, length: number): Uint8Array {
    const output = new Uint8Array(length);
    let i = 0;
    let o = 0;

    while (i < input.length) {
        const token = input[i++];

        let literals = token >>> 4;
        if (literals === 15) {
            let byte;
            do {
                byte = input[i++];
                literals += byte;
            } while (byte === 255);
        }

        if (o + literals > length || i + literals > input.length) throw new Error('Corrupt LZ4 block.');
        output.set(input.subarray(i, i + literals), o);
        i += literals;
        o += literals;

        // The last sequence has literals only.
        if (i >= input.length) break;

        const distance = input[i] | (input[i + 1] << 8);
        i += 2;
        if (distance === 0 || distance > o) throw new Error('Corrupt LZ4 block.');

        let match = (token & 15) + 4;
        if ((token & 15) === 15) {
            let byte;
            do {
                byte = input[i++];
                match += byte;
            } while (byte === 255);
        }

        if (o + match > length) throw new Error('Corrupt LZ4 block.');
        // Matches may overlap their own output, so copy byte by byte.
        for (let end = o + match; o < end; o++) output[o] = output[o - distance];
    }

    if (o !== length) throw new Error('LZ4 block ended early.');

    return output;
}
