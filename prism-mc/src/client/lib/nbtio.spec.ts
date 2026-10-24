import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyFields, clearInventory, detectFormat, makeItem, readFields, readSlots, writeSlots } from './inventoryEdit';
import { readNbtFile } from './nbt';
import { readNbtFileTyped, readTypedNbt, tag, toPlain, writeNbtFileTyped, writeTypedNbt } from './nbtio';
import { readPlayer } from './player';
import { parseCompound, stringify } from './snbt';

// A real 1.21.4 player file, saved from the Fabric test server after giving the bot items.
const fixture = new Uint8Array(readFileSync(join(__dirname, '__fixtures__', 'player-1.21.4.dat')));

describe('typed NBT', () => {
    it('writes a player file back byte for byte', async () => {
        const file = await readNbtFileTyped(fixture);
        expect(file.compression).toBe('gzip');
        const plain = new Uint8Array(await new Response(new Response(fixture as BodyInit).body!.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());

        expect(writeTypedNbt(file.name, file.root)).toEqual(plain);
    });

    it('survives gzip on the way out', async () => {
        const file = await readNbtFileTyped(fixture);
        const again = await readNbtFileTyped(await writeNbtFileTyped(file));

        expect(toPlain(again.root)).toEqual(toPlain(file.root));
    });

    it('keeps the element type of an empty list', () => {
        const root = tag.compound([['empty', tag.list(10)]]);
        const read = readTypedNbt(writeTypedNbt('', root));

        expect(read.root.value.get('empty')).toEqual({ type: 9, element: 10, value: [] });
    });
});

describe('editing a 1.21.4 inventory', async () => {
    const file = await readNbtFileTyped(fixture);
    const format = detectFormat(file.root);
    const slots = readSlots(file.root, format);

    it('knows the format from the DataVersion', () => {
        expect(format).toEqual({ components: true, nbtText: false, equipment: false });
    });

    it('reads every slot the viewer shows', async () => {
        const player = readPlayer(await readNbtFile(fixture));
        const shown = player.inventory.length + Object.keys(player.equipment).length + player.enderChest.length;

        expect(slots.size).toBe(shown);
    });

    it('writes unchanged slots back to the same player', () => {
        const again = writeSlots(file.root, format, slots);

        expect(readPlayer(toPlain(again) as never)).toEqual(readPlayer(toPlain(file.root) as never));
    });

    it('renames, enchants and moves an item', () => {
        const [key, sword] = [...slots].find(([, item]) => readFields(item, format).id === 'minecraft:netherite_sword')!;
        const fields = readFields(sword, format);
        const changed = applyFields(sword, { ...fields, name: { text: 'Bane', color: 'gold', bold: true, italic: false }, lore: [{ text: 'Forged in tests', color: null, bold: false, italic: null }], enchantments: [...fields.enchantments, { id: 'minecraft:looting', level: 3 }] }, format);
        const next = new Map(slots);
        next.delete(key);
        next.set('inv:35', changed);
        next.set('ender:26', makeItem('minecraft:diamond', 12, format));
        const player = readPlayer(toPlain(writeSlots(file.root, format, next)) as never);

        const moved = player.inventory.find((item) => item.slot === 35)!;
        expect(moved).toMatchObject({ id: 'minecraft:netherite_sword', name: 'Bane', lore: ['Forged in tests'] });
        expect(moved.enchantments).toEqual(expect.arrayContaining([{ id: 'minecraft:looting', level: 3 }, { id: 'minecraft:sharpness', level: 5 }]));
        expect(player.enderChest.find((item) => item.slot === 26)).toMatchObject({ id: 'minecraft:diamond', count: 12 });
    });

    it('clears everything but the ender chest', () => {
        const player = readPlayer(toPlain(clearInventory(file.root, format)) as never);

        expect(player.inventory).toEqual([]);
        expect(player.equipment).toEqual({});
        expect(player.enderChest.length).toBeGreaterThan(0);
    });
});

describe('SNBT', async () => {
    const file = await readNbtFileTyped(fixture);
    const slots = readSlots(file.root, detectFormat(file.root));

    it('reads back every item it writes, types and all', () => {
        for (const item of slots.values()) expect(parseCompound(stringify(item))).toEqual(item);
    });

    it('reads typed numbers, arrays and quoted keys', () => {
        const parsed = parseCompound('{a: 1b, b: 2s, c: 3, d: 4L, e: 1.5f, f: 2.0d, g: [I; 1, 2], "odd key": "x", h: [], i: [{x: 1}]}');

        expect(stringify(parsed, '', 0).replace(/\n/g, '')).toBe('{a: 1b,b: 2s,c: 3,d: 4L,e: 1.5f,f: 2.0d,g: [I; 1, 2],"odd key": "x",h: [],i: [{x: 1}]}');
    });

    it('says where text is wrong', () => {
        expect(() => parseCompound('{a: 1,\n b: }')).toThrow(/line 2/);
        expect(() => parseCompound('{a: [1, "x"]}')).toThrow(/one type/);
    });
});

describe('item formats', () => {
    const base = { name: { text: 'Hi', color: 'red', bold: false, italic: null }, lore: [], enchantments: [{ id: 'minecraft:unbreaking', level: 3 }], stored: [], damage: 5, unbreakable: true };

    it('writes 1.21.5 items with NBT text and plain enchantment maps', () => {
        const format = { components: true, nbtText: true, equipment: true };
        const item = applyFields(makeItem('minecraft:iron_pickaxe', 1, format), { ...readFields(makeItem('minecraft:iron_pickaxe', 1, format), format), ...base }, format);
        const components = toPlain(item) as { components: Record<string, unknown> };

        expect(components.components['minecraft:custom_name']).toEqual({ text: 'Hi', color: 'red' });
        expect(components.components['minecraft:enchantments']).toEqual({ 'minecraft:unbreaking': 3 });
        expect(readFields(item, format)).toMatchObject({ damage: 5, unbreakable: true, name: { text: 'Hi', color: 'red' } });
    });

    it('writes pre-1.20.5 items in the old tag shape', () => {
        const format = { components: false, nbtText: false, equipment: false };
        const item = applyFields(makeItem('minecraft:iron_pickaxe', 1, format), { ...readFields(makeItem('minecraft:iron_pickaxe', 1, format), format), ...base }, format);
        const plain = toPlain(item) as { Count: number; tag: { display: { Name: string }; Enchantments: unknown[]; Damage: number; Unbreakable: number } };

        expect(plain.Count).toBe(1);
        expect(JSON.parse(plain.tag.display.Name)).toEqual({ text: 'Hi', color: 'red' });
        expect(plain.tag.Enchantments).toEqual([{ id: 'minecraft:unbreaking', lvl: 3 }]);
        expect(plain.tag).toMatchObject({ Damage: 5, Unbreakable: 1 });
    });
});
