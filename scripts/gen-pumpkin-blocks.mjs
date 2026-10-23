// Builds src/client/lib/pumpkinBlocks.json from Pumpkin's assets/blocks.json: the first
// block-state id of every block and its name. Pump worlds store global state ids, and each
// block's states are numbered in one run, so this is enough to name any state.
// Usage: node scripts/gen-pumpkin-blocks.mjs <path to Pumpkin's assets/blocks.json> <minecraft version>
import { readFileSync, writeFileSync } from 'node:fs';

const [source, version] = process.argv.slice(2);
if (!source || !version) {
    console.error('usage: gen-pumpkin-blocks.mjs <blocks.json> <minecraft version>');
    process.exit(2);
}

const blocks = JSON.parse(readFileSync(source, 'utf8')).blocks
    .map((block) => ({ name: `minecraft:${block.name}`, start: Math.min(...block.states.map((state) => state.id)), end: Math.max(...block.states.map((state) => state.id)) }))
    .sort((a, b) => a.start - b.start);

for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].start !== blocks[i - 1].end + 1) throw new Error(`state ids are not contiguous at ${blocks[i].name}`);
}

const out = new URL('../prism-mc/src/client/lib/pumpkinBlocks.json', import.meta.url);
writeFileSync(out, JSON.stringify({ version, states: blocks.at(-1).end + 1, starts: blocks.map((block) => block.start), names: blocks.map((block) => block.name.slice('minecraft:'.length)) }) + '\n');
console.log(`${blocks.length} blocks, ${blocks.at(-1).end + 1} states`);
