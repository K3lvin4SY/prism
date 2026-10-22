// Builds Terraria Suite's game data tables from TEdit's data files (MIT licence,
// https://github.com/TEdit/Terraria-Map-Editor, src/TEdit.Terraria/Data):
//   items.json    id → name, rarity
//   prefixes.json id → name
//   map.json      tile, wall and global (sky, liquids, …) map colours
// Usage: node scripts/gen-terraria-data.mjs <folder with TEdit's items.json, prefixes.json, tiles.json, walls.json, globalColors.json>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const source = process.argv[2];
if (!source) {
    console.error('usage: gen-terraria-data.mjs <TEdit data folder>');
    process.exit(2);
}

const read = (file) => JSON.parse(readFileSync(join(source, file), 'utf8'));
const out = new URL('../terraria-suite/src/client/lib/data/', import.meta.url);
mkdirSync(out, { recursive: true });

// Dense arrays indexed by id: smaller than objects keyed by number.
const items = read('items.json');
const maxItem = Math.max(...items.map((item) => item.id ?? 0));
const names = Array(maxItem + 1).fill('');
const rarities = Array(maxItem + 1).fill('');
for (const item of items) {
    if (typeof item.id !== 'number') continue;
    names[item.id] = item.name ?? '';
    rarities[item.id] = item.rarity ?? '';
}
writeFileSync(new URL('items.json', out), JSON.stringify({ names, rarities }) + '\n');

const prefixes = read('prefixes.json').map((prefix) => (prefix.name ?? '').trim());
writeFileSync(new URL('prefixes.json', out), JSON.stringify(prefixes) + '\n');

// "#RRGGBBAA" colours, by id; "" where TEdit has none.
const colours = (list) => {
    const max = Math.max(...list.map((entry) => entry.id ?? 0));
    const result = Array(max + 1).fill('');
    for (const entry of list) {
        if (typeof entry.id === 'number' && entry.color) result[entry.id] = entry.color.slice(0, 7);
    }

    return result;
};
const global = Object.fromEntries(read('globalColors.json').map((entry) => [entry.name, entry.color.slice(0, 7)]));
writeFileSync(new URL('map.json', out), JSON.stringify({ tiles: colours(read('tiles.json')), walls: colours(read('walls.json')), global }) + '\n');

console.log(`${items.length} items (max id ${maxItem}), ${prefixes.length} prefixes`);
