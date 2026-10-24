// Writes src/client/lib/data/java-items.json and java-enchantments.json for the inventory editor,
// from PrismarineJS minecraft-data. Run from prism-mc: node scripts/items.mjs [version]
import { writeFileSync } from 'node:fs';

const base = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data';
const get = async (path) => {
    const response = await fetch(`${base}/${path}`);
    if (!response.ok) throw new Error(`${path}: ${response.status}`);

    return response.json();
};

const paths = (await get('dataPaths.json')).pc;
const release = (version) => /^\d+(\.\d+)+$/.test(version);
const order = (a, b) => {
    const x = a.split('.').map(Number);
    const y = b.split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);

    return 0;
};
const version = process.argv[2] ?? Object.keys(paths).filter(release).sort(order).at(-1);
const items = await get(`${paths[version].items}/items.json`);
const enchantments = await get(`${paths[version].enchantments}/enchantments.json`);

// [id, name, stack size, durability (0 for none), enchantment categories]
const itemRows = items.filter((item) => item.name !== 'air').map((item) => [item.name, item.displayName, item.stackSize, item.maxDurability ?? 0, item.enchantCategories ?? []]);
// [id, name, max level, category, curse, conflicts]
const enchantmentRows = enchantments.map((entry) => [entry.name, entry.displayName, entry.maxLevel, entry.category, entry.curse, entry.exclude ?? []]);

writeFileSync('src/client/lib/data/java-items.json', JSON.stringify({ version, items: itemRows }));
writeFileSync('src/client/lib/data/java-enchantments.json', JSON.stringify({ version, enchantments: enchantmentRows }));
console.log(`${version}: ${itemRows.length} items, ${enchantmentRows.length} enchantments`);
