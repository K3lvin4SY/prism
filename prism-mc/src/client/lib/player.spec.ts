import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNbtFile } from './nbt';
import { enchantmentLabel, maxDurability, readItem, readPlayer } from './player';

// A real 1.21.4 player file, saved from the Fabric test server after giving the bot items.
const fixture = new Uint8Array(readFileSync(join(__dirname, '__fixtures__', 'player-1.21.4.dat')));

describe('readPlayer on a 1.21.4 save', () => {
    it('reads the inventory, armour, offhand and ender chest', async () => {
        const player = readPlayer(await readNbtFile(fixture));

        const sword = player.inventory.find((item) => item.id === 'minecraft:netherite_sword');
        expect(sword).toMatchObject({ name: 'Dragonslayer', damage: 300, maxDamage: 2031 });
        expect(sword?.enchantments).toEqual(expect.arrayContaining([{ id: 'minecraft:sharpness', level: 5 }]));

        expect(player.inventory.find((item) => item.id === 'minecraft:golden_apple')?.count).toBe(16);
        expect(player.inventory.find((item) => item.id === 'minecraft:enchanted_book')?.stored).toEqual([{ id: 'minecraft:protection', level: 4 }]);

        expect(player.equipment.head?.id).toBe('minecraft:netherite_helmet');
        expect(player.equipment.chest?.id).toBe('minecraft:diamond_chestplate');
        expect(player.equipment.feet).toMatchObject({ id: 'minecraft:iron_boots', damage: 100 });
        expect(player.equipment.offhand?.id).toBe('minecraft:shield');

        expect(player.enderChest.map((item) => [item.slot, item.id])).toEqual(
            expect.arrayContaining([
                [0, 'minecraft:diamond'],
                [4, 'minecraft:elytra'],
                [13, 'minecraft:shulker_box'],
            ])
        );
    });

    it('reads mode, position and experience', async () => {
        const player = readPlayer(await readNbtFile(fixture));

        expect(player.gameMode).toBe('survival');
        expect(player.dimension).toBe('minecraft:overworld');
        expect(player.position).toHaveLength(3);
        expect(player.xpLevel).toBe(47);
    });
});

describe('item helpers', () => {
    it('reads the pre-1.20.5 item format', () => {
        const item = readItem({ id: 'minecraft:diamond_sword', Count: 1, Slot: 0, tag: { Damage: 10, Enchantments: [{ id: 'minecraft:sharpness', lvl: 3 }] } });
        expect(item).toMatchObject({ count: 1, damage: 10, maxDamage: 1561, enchantments: [{ id: 'minecraft:sharpness', level: 3 }] });
    });

    it('knows vanilla durability', () => {
        expect(maxDurability('minecraft:netherite_chestplate')).toBe(592);
        expect(maxDurability('minecraft:stone')).toBeNull();
    });

    it('names enchantments the way the game does', () => {
        expect(enchantmentLabel({ id: 'minecraft:sharpness', level: 5 })).toBe('Sharpness V');
        expect(enchantmentLabel({ id: 'minecraft:mending', level: 1 })).toBe('Mending');
    });
});
