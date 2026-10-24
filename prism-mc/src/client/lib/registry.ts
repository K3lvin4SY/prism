import enchantmentData from './data/java-enchantments.json';
import itemData from './data/java-items.json';

/** Every Java item and enchantment, from scripts/items.mjs, for the inventory editor. */
export interface ItemInfo {
    id: string;
    name: string;
    stackSize: number;
    maxDurability: number;
    categories: string[];
}

export interface EnchantmentInfo {
    id: string;
    name: string;
    maxLevel: number;
    category: string;
    curse: boolean;
    conflicts: string[];
}

export const ITEMS: ItemInfo[] = (itemData.items as [string, string, number, number, string[]][]).map(([name, display, stackSize, maxDurability, categories]) => ({
    id: `minecraft:${name}`,
    name: display,
    stackSize,
    maxDurability,
    categories,
}));

export const ENCHANTMENTS: EnchantmentInfo[] = (enchantmentData.enchantments as [string, string, number, string, boolean, string[]][]).map(([name, display, maxLevel, category, curse, conflicts]) => ({
    id: `minecraft:${name}`,
    name: display,
    maxLevel,
    category,
    curse,
    conflicts: conflicts.map((other) => `minecraft:${other}`),
}));

export const DATA_VERSION = itemData.version;

const byId = new Map(ITEMS.map((item) => [item.id, item]));

export const itemInfo = (id: string): ItemInfo | undefined => byId.get(id);

/** Items whose name or id contains every word typed, best matches first. */
export function searchItems(term: string, limit = 200): ItemInfo[] {
    const words = term.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return ITEMS.slice(0, limit);
    const found = ITEMS.filter((item) => words.every((word) => item.name.toLowerCase().includes(word) || item.id.includes(word)));
    const first = words.join(' ');

    return found.sort((a, b) => Number(!a.name.toLowerCase().startsWith(first)) - Number(!b.name.toLowerCase().startsWith(first)) || a.name.length - b.name.length).slice(0, limit);
}

/** The enchantments the game allows on an item; books take any. */
export function enchantmentsFor(id: string): EnchantmentInfo[] {
    if (id === 'minecraft:book' || id === 'minecraft:enchanted_book') return ENCHANTMENTS;
    const categories = itemInfo(id)?.categories ?? [];

    return ENCHANTMENTS.filter((enchantment) => categories.includes(enchantment.category));
}

export const enchantmentName = (id: string) => ENCHANTMENTS.find((entry) => entry.id === id)?.name ?? id.replace(/^minecraft:/, '').replace(/_/g, ' ');
