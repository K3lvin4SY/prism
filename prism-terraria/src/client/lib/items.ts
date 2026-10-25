import items from './data/items.json';
import prefixes from './data/prefixes.json';

/**
 * Terraria item names, prefixes and rarity colors (generated from TEdit's data by
 * scripts/gen-terraria-data.mjs). Icons are loaded from the Terraria wiki by item name.
 */

/** Negative "net IDs" are old copper-tool variants still used by starting inventories. */
const LEGACY: Record<number, number> = { [-13]: 3509, [-14]: 3508, [-15]: 3507, [-16]: 3506 };

const RARITY_COLORS: Record<string, string> = {
    Gray: '#828282',
    Blue: '#9696ff',
    Green: '#96ff96',
    Orange: '#ffc896',
    LightRed: '#ff9696',
    Pink: '#ff96ff',
    LightPurple: '#d2a0ff',
    Lime: '#96ff0a',
    Yellow: '#ffff0a',
    Cyan: '#05c8ff',
    Red: '#ff2864',
    Purple: '#b428ff',
    Quest: '#ffaf00',
    Master: '#ff9600',
    StrongRed: '#ff2864',
};

export function itemId(netId: number): number {
    return LEGACY[netId] ?? netId;
}

export function itemName(netId: number, prefix = 0): string {
    const name = items.names[itemId(netId)] || `Item ${netId}`;
    const before = prefixes[prefix] ?? '';

    return before ? `${before} ${name}` : name;
}

export function rarityColor(netId: number): string {
    return RARITY_COLORS[items.rarities[itemId(netId)] ?? ''] ?? '#ffffff';
}

/** The wiki's picture of an item, found by its file name. */
export function itemIcon(netId: number): string {
    const name = items.names[itemId(netId)];

    return name ? `https://terraria.wiki.gg/wiki/Special:FilePath/${encodeURIComponent(name.replace(/ /g, '_'))}.png` : '';
}

/** Item search for the give dialog: id and name, best matches first. */
export function searchItems(term: string, limit = 30): { id: number; name: string }[] {
    const query = term.trim().toLowerCase();
    if (query === '') return [];

    const results: { id: number; name: string; rank: number }[] = [];
    items.names.forEach((name: string, id: number) => {
        const lower = name.toLowerCase();
        if (lower.includes(query)) results.push({ id, name, rank: lower === query ? 0 : lower.startsWith(query) ? 1 : 2 });
    });

    return results.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length).slice(0, limit);
}
