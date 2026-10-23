import { describe, expect, it } from 'vitest';
import { itemName, rarityColour, searchItems } from './items';

describe('items', () => {
    it('names items, prefixes and the old copper tool ids of starting kits', () => {
        expect(itemName(2)).toBe('Dirt Block');
        expect(itemName(-15)).toBe('Copper Shortsword');
        expect(itemName(-13)).toBe('Copper Pickaxe');
        expect(itemName(-16)).toBe('Copper Axe');
        // Prefix 1 is "Large".
        expect(itemName(2, 1)).toBe('Large Dirt Block');
        expect(itemName(999_999)).toBe('Item 999999');
    });

    it('finds items by name, exact and prefix matches first', () => {
        const results = searchItems('copper pickaxe');
        expect(results[0].name).toBe('Copper Pickaxe');
        expect(searchItems('')).toEqual([]);
    });

    it('colours names by rarity', () => {
        expect(rarityColour(2)).toBe('#ffffff');
    });
});
