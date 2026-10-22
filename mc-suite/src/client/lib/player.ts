import { nbt, type NbtCompound, type NbtValue } from './nbt';

export interface Enchantment {
    id: string;
    level: number;
}

export interface Item {
    id: string;
    count: number;
    slot: number;
    name: string | null;
    lore: string[];
    enchantments: Enchantment[];
    stored: Enchantment[];
    damage: number;
    maxDamage: number | null;
    unbreakable: boolean;
}

export interface PlayerState {
    gameMode: 'survival' | 'creative' | 'adventure' | 'spectator';
    dimension: string;
    position: [number, number, number] | null;
    health: number;
    maxHealth: number;
    food: number;
    saturation: number;
    xpLevel: number;
    xpProgress: number;
    xpTotal: number;
    selectedSlot: number;
    /** Hotbar 0–8, main inventory 9–35. */
    inventory: Item[];
    /** head, chest, legs, feet, offhand */
    equipment: Partial<Record<'head' | 'chest' | 'legs' | 'feet' | 'offhand', Item>>;
    enderChest: Item[];
    firstPlayed: number | null;
    lastPlayed: number | null;
}

const GAME_MODES = ['survival', 'creative', 'adventure', 'spectator'] as const;

const DIMENSIONS: Record<string, string> = { '-1': 'minecraft:the_nether', '0': 'minecraft:overworld', '1': 'minecraft:the_end' };

/** Flattens a chat component (a JSON string in older files, NBT in newer ones) to plain text. */
export function componentText(value: NbtValue | undefined): string | null {
    if (value === undefined) return null;

    if (typeof value === 'string') {
        try {
            return componentText(JSON.parse(value) as NbtValue) ?? value;
        } catch {
            return value;
        }
    }

    if (Array.isArray(value)) return value.map((part) => componentText(part) ?? '').join('');

    const compound = nbt.compound(value);
    if (!compound) return null;

    return (nbt.str(compound.text) ?? nbt.str(compound.translate) ?? '') + nbt.list(compound.extra).map((part) => componentText(part) ?? '').join('');
}

function enchantmentsFrom(value: NbtValue | undefined): Enchantment[] {
    // 1.20.5–1.21.4: {levels: {id: level}}. 1.21.5+: {id: level}. Older: [{id, lvl}].
    if (Array.isArray(value)) {
        return value.flatMap((entry) => {
            const compound = nbt.compound(entry);
            const id = compound ? nbt.str(compound.id) : null;

            return compound && id ? [{ id, level: nbt.num(compound.lvl, 1) }] : [];
        });
    }

    const compound = nbt.compound(value);
    if (!compound) return [];
    const levels = nbt.compound(compound.levels) ?? compound;

    return Object.entries(levels)
        .filter(([key]) => key !== 'show_in_tooltip')
        .map(([id, level]) => ({ id, level: nbt.num(level, 1) }));
}

export function readItem(value: NbtValue | undefined, slot = -1): Item | null {
    const item = nbt.compound(value);
    const id = item ? nbt.str(item.id) : null;
    if (!item || !id || id === 'minecraft:air') return null;

    const components = nbt.compound(item.components);
    const tag = nbt.compound(item.tag);
    const display = tag ? nbt.compound(tag.display) : null;
    const maxDamage = components && components['minecraft:max_damage'] !== undefined ? nbt.num(components['minecraft:max_damage']) : maxDurability(id);

    return {
        id,
        count: nbt.num(item.count ?? item.Count, 1),
        slot: item.Slot !== undefined ? nbt.num(item.Slot) : slot,
        name: componentText(components?.['minecraft:custom_name'] ?? display?.Name),
        lore: nbt.list(components?.['minecraft:lore'] ?? display?.Lore).map((line) => componentText(line) ?? ''),
        enchantments: enchantmentsFrom(components?.['minecraft:enchantments'] ?? tag?.Enchantments ?? tag?.ench),
        stored: enchantmentsFrom(components?.['minecraft:stored_enchantments'] ?? tag?.StoredEnchantments),
        damage: nbt.num(components?.['minecraft:damage'] ?? tag?.Damage, 0),
        maxDamage,
        unbreakable: components?.['minecraft:unbreakable'] !== undefined || nbt.num(tag?.Unbreakable, 0) === 1,
    };
}

export function readPlayer(root: NbtCompound): PlayerState {
    const inventory: Item[] = [];
    const equipment: PlayerState['equipment'] = {};
    const legacyArmour: Record<number, keyof PlayerState['equipment']> = { 100: 'feet', 101: 'legs', 102: 'chest', 103: 'head', [-106]: 'offhand' };

    for (const entry of nbt.list(root.Inventory)) {
        const item = readItem(entry);
        if (!item) continue;
        if (legacyArmour[item.slot]) equipment[legacyArmour[item.slot]] = item;
        else if (item.slot >= 0 && item.slot < 36) inventory.push(item);
    }

    // 1.21.5 and newer keep armour and the offhand in an "equipment" compound.
    const worn = nbt.compound(root.equipment);
    if (worn) {
        for (const part of ['head', 'chest', 'legs', 'feet', 'offhand'] as const) {
            const item = readItem(worn[part]);
            if (item) equipment[part] = item;
        }
    }

    const position = nbt.list(root.Pos).map((value) => nbt.num(value));
    const dimension = typeof root.Dimension === 'number' ? DIMENSIONS[String(root.Dimension)] : nbt.str(root.Dimension);
    const bukkit = nbt.compound(root.bukkit);
    const paper = nbt.compound(root.Paper);
    const maxHealth = nbt.list(root.attributes ?? root.Attributes).reduce<number>((max, entry) => {
        const attribute = nbt.compound(entry);
        const id = attribute ? (nbt.str(attribute.id) ?? nbt.str(attribute.Name)) : null;

        return id && /max_health$/.test(id) ? nbt.num(attribute!.base ?? attribute!.Base, max) : max;
    }, 20);

    return {
        gameMode: GAME_MODES[nbt.num(root.playerGameType, 0)] ?? 'survival',
        dimension: dimension ?? 'minecraft:overworld',
        position: position.length === 3 ? [position[0], position[1], position[2]] : null,
        health: nbt.num(root.Health, 20),
        maxHealth,
        food: nbt.num(root.foodLevel, 20),
        saturation: nbt.num(root.foodSaturationLevel, 5),
        xpLevel: nbt.num(root.XpLevel, 0),
        xpProgress: nbt.num(root.XpP, 0),
        xpTotal: nbt.num(root.XpTotal, 0),
        selectedSlot: nbt.num(root.SelectedItemSlot, 0),
        inventory,
        equipment,
        enderChest: nbt.list(root.EnderItems).flatMap((entry) => {
            const item = readItem(entry);

            return item ? [item] : [];
        }),
        firstPlayed: bukkit?.firstPlayed !== undefined ? nbt.num(bukkit.firstPlayed) : null,
        lastPlayed: paper?.LastSeen !== undefined ? nbt.num(paper.LastSeen) : bukkit?.lastPlayed !== undefined ? nbt.num(bukkit.lastPlayed) : null,
    };
}

const TOOL_DURABILITY: Record<string, number> = { wooden: 59, stone: 131, iron: 250, golden: 32, diamond: 1561, netherite: 2031 };
const ARMOUR_DURABILITY: Record<string, [number, number, number, number]> = {
    leather: [55, 80, 75, 65],
    chainmail: [165, 240, 225, 195],
    iron: [165, 240, 225, 195],
    golden: [77, 112, 105, 91],
    diamond: [363, 528, 495, 429],
    netherite: [407, 592, 555, 481],
    copper: [121, 176, 165, 143],
};
const OTHER_DURABILITY: Record<string, number> = {
    bow: 384,
    crossbow: 465,
    trident: 250,
    shield: 336,
    elytra: 432,
    fishing_rod: 64,
    shears: 238,
    flint_and_steel: 64,
    carrot_on_a_stick: 25,
    warped_fungus_on_a_stick: 100,
    mace: 500,
    brush: 64,
    turtle_helmet: 275,
    wolf_armor: 64,
};

/** The vanilla durability of an item, for files that do not store it. */
export function maxDurability(id: string): number | null {
    const name = id.replace(/^minecraft:/, '');
    if (OTHER_DURABILITY[name]) return OTHER_DURABILITY[name];

    const tool = name.match(/^(wooden|stone|iron|golden|diamond|netherite)_(sword|pickaxe|axe|shovel|hoe)$/);
    if (tool) return TOOL_DURABILITY[tool[1]];

    const armour = name.match(/^(leather|chainmail|iron|golden|diamond|netherite|copper)_(helmet|chestplate|leggings|boots)$/);
    if (armour) return ARMOUR_DURABILITY[armour[1]][['helmet', 'chestplate', 'leggings', 'boots'].indexOf(armour[2])];

    return null;
}

/** "minecraft:netherite_sword" → "Netherite Sword" */
export function prettyId(id: string): string {
    return id
        .replace(/^[a-z0-9_.-]+:/, '')
        .split(/[_/]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function enchantmentLabel(enchantment: Enchantment): string {
    const name = prettyId(enchantment.id);
    const single = ['minecraft:mending', 'minecraft:silk_touch', 'minecraft:infinity', 'minecraft:channeling', 'minecraft:multishot', 'minecraft:aqua_affinity', 'minecraft:flame', 'minecraft:binding_curse', 'minecraft:vanishing_curse'];
    if (single.includes(enchantment.id) && enchantment.level === 1) return name;

    return `${name} ${ROMAN[enchantment.level] ?? enchantment.level}`;
}

/** Ticks to a short duration: 27m, 4h 12m, 3d 2h. */
export function formatTicks(ticks: number): string {
    const minutes = Math.floor(ticks / 20 / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;

    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
