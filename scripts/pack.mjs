// Packages built extensions into .pteroext archives, as the Panel's p:extension:pack does, without needing PHP.
// Usage: node scripts/pack.mjs [--out <dir>] <extension folder>...
import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const argv = process.argv.slice(2);
const outAt = argv.indexOf('--out');
const out = resolve(outAt === -1 ? '.' : argv[outAt + 1]);
const folders = argv.filter((_, index) => outAt === -1 || (index !== outAt && index !== outAt + 1));
if (!folders.length) throw new Error('Usage: node scripts/pack.mjs [--out <dir>] <extension folder>...');

// The same rules as p:extension:pack: these folders and the PSR-4 ones, without dot files, dependencies, tests or source maps.
const SKIP = new Set(['node_modules', 'tests', 'test', 'coverage']);
// The client sources are already built into dist, so they stay out as they do in deploy.mjs.
const CLIENT = 'src/client';

function files(root, directory) {
    let entries;
    try {
        entries = readdirSync(join(root, directory), { withFileTypes: true });
    } catch {
        return [];
    }
    return entries.flatMap((entry) => {
        const path = `${directory}/${entry.name}`;
        if (entry.isSymbolicLink() || entry.name.startsWith('.') || SKIP.has(entry.name) || path === CLIENT) return [];
        if (entry.isDirectory()) return files(root, path);
        return entry.name.endsWith('.map') ? [] : [path];
    });
}

function zip(entries) {
    const local = [];
    const central = [];
    let offset = 0;
    for (const [name, data] of entries) {
        const nameBytes = Buffer.from(name, 'utf8');
        const packed = deflateRawSync(data);
        // Version, flags (UTF-8 names), deflate, a fixed 1980-01-01 time so builds of the same files match, CRC and sizes.
        const fields = (header) => {
            header.writeUInt16LE(20, 0);
            header.writeUInt16LE(0x0800, 2);
            header.writeUInt16LE(8, 4);
            header.writeUInt16LE(0, 6);
            header.writeUInt16LE(0x21, 8);
            header.writeUInt32LE(crc32(data), 10);
            header.writeUInt32LE(packed.length, 14);
            header.writeUInt32LE(data.length, 18);
            header.writeUInt16LE(nameBytes.length, 22);
            return header;
        };
        const head = Buffer.alloc(30);
        head.writeUInt32LE(0x04034b50, 0);
        fields(head.subarray(4)).writeUInt16LE(0, 24);
        local.push(head, nameBytes, packed);

        const entry = Buffer.alloc(46);
        entry.writeUInt32LE(0x02014b50, 0);
        entry.writeUInt16LE(20, 4);
        fields(entry.subarray(6));
        entry.writeUInt32LE(offset, 42);
        central.push(entry, nameBytes);
        offset += head.length + nameBytes.length + packed.length;
    }
    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, directory, end]);
}

mkdirSync(out, { recursive: true });
for (const folder of folders) {
    const root = resolve(folder);
    const manifest = JSON.parse(readFileSync(join(root, 'extension.json'), 'utf8'));
    if (!lstatSync(join(root, 'dist'), { throwIfNoEntry: false })?.isDirectory()) throw new Error(`${manifest.id} has no dist; build it first.`);

    const composer = lstatSync(join(root, 'composer.json'), { throwIfNoEntry: false }) ? JSON.parse(readFileSync(join(root, 'composer.json'), 'utf8')) : null;
    const autoload = Object.values(manifest.autoload ?? composer?.autoload?.['psr-4'] ?? {}).map((path) => path.replace(/\/+$/, ''));
    const names = [
        'extension.json',
        ...(composer ? ['composer.json'] : []),
        ...[...new Set(['routes', 'database', 'resources', 'dist', 'vendor', ...autoload])].flatMap((directory) => files(root, directory)),
    ];

    const archive = join(out, `${manifest.id}-${manifest.version}.pteroext`);
    writeFileSync(archive, zip(names.map((name) => [name, readFileSync(join(root, name))])));
    console.log(`Packaged ${manifest.id}: ${archive} (${names.length} files)`);
}
