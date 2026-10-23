import { describe, expect, it } from 'vitest';
import { readNbt } from './nbt';
import { readBedrockPlayer } from './player';

/** A tiny little-endian NBT writer, enough to build a Bedrock player record for the test. */
type Tag = { t: number; v: unknown };
const byte = (v: number): Tag => ({ t: 1, v });
const short = (v: number): Tag => ({ t: 2, v });
const int = (v: number): Tag => ({ t: 3, v });
const float = (v: number): Tag => ({ t: 5, v });
const str = (v: string): Tag => ({ t: 8, v });
const list = (type: number, v: Tag[]): Tag => ({ t: 9, v: { type, items: v } });
const compound = (v: Record<string, Tag>): Tag => ({ t: 10, v });

function write(tag: Tag, out: number[]) {
    const view = (size: number, fill: (dv: DataView) => void) => {
        const dv = new DataView(new ArrayBuffer(size));
        fill(dv);
        out.push(...new Uint8Array(dv.buffer));
    };
    const name = (text: string) => {
        const bytes = new TextEncoder().encode(text);
        view(2, (dv) => dv.setUint16(0, bytes.length, true));
        out.push(...bytes);
    };

    switch (tag.t) {
        case 1: out.push((tag.v as number) & 0xff); break;
        case 2: view(2, (dv) => dv.setInt16(0, tag.v as number, true)); break;
        case 3: view(4, (dv) => dv.setInt32(0, tag.v as number, true)); break;
        case 5: view(4, (dv) => dv.setFloat32(0, tag.v as number, true)); break;
        case 8: name(tag.v as string); break;
        case 9: {
            const { type, items } = tag.v as { type: number; items: Tag[] };
            out.push(type);
            view(4, (dv) => dv.setInt32(0, items.length, true));
            items.forEach((item) => write(item, out));
            break;
        }
        case 10:
            for (const [key, child] of Object.entries(tag.v as Record<string, Tag>)) {
                out.push(child.t);
                name(key);
                write(child, out);
            }
            out.push(0);
            break;
    }
}

function encode(root: Record<string, Tag>): Uint8Array {
    const out = [10, 0, 0];
    write(compound(root), out);

    return new Uint8Array(out);
}

const item = (name: string, count: number, slot: number, extra: Record<string, Tag> = {}) =>
    compound({ Name: str(name), Count: byte(count), Slot: byte(slot), Damage: short(0), ...extra });

describe('readBedrockPlayer', () => {
    it('reads inventory, armour, ender chest and stats from a Bedrock record', () => {
        const record = encode({
            Pos: list(5, [float(10.5), float(64), float(-3.5)]),
            DimensionId: int(1),
            PlayerGameMode: int(1),
            PlayerLevel: int(30),
            PlayerLevelProgress: float(0.5),
            SelectedInventorySlot: int(2),
            Attributes: list(10, [compound({ Name: str('minecraft:health'), Current: float(14) }), compound({ Name: str('minecraft:player.hunger'), Current: float(9) })]),
            Inventory: list(10, [
                item('minecraft:diamond_sword', 1, 0, { tag: compound({ ench: list(10, [compound({ id: short(9), lvl: short(5) })]), Damage: int(40) }) }),
                item('minecraft:cobblestone', 64, 3),
                item('', 0, 4),
            ]),
            Armor: list(10, [item('minecraft:iron_helmet', 1, 0), item('', 0, 1), item('', 0, 2), item('minecraft:diamond_boots', 1, 3)]),
            Offhand: list(10, [item('minecraft:shield', 1, 0)]),
            EnderChestInventory: list(10, [item('minecraft:emerald', 12, 5)]),
        });

        const player = readBedrockPlayer(readNbt(record, true));

        expect(player).toMatchObject({ gameMode: 'creative', dimension: 'minecraft:the_nether', xpLevel: 30, health: 14, food: 9, selectedSlot: 2 });
        expect(player.position).toEqual([10.5, 64, -3.5]);
        expect(player.inventory).toHaveLength(2);
        expect(player.inventory[0]).toMatchObject({ id: 'minecraft:diamond_sword', damage: 40, enchantments: [{ id: 'minecraft:sharpness', level: 5 }] });
        expect(player.equipment.head?.id).toBe('minecraft:iron_helmet');
        expect(player.equipment.chest).toBeUndefined();
        expect(player.equipment.feet?.id).toBe('minecraft:diamond_boots');
        expect(player.equipment.offhand?.id).toBe('minecraft:shield');
        expect(player.enderChest).toEqual([expect.objectContaining({ id: 'minecraft:emerald', count: 12, slot: 5 })]);
    });
});
