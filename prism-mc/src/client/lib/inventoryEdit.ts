import { clone, isCompound, isList, numberOf, sameKindNumber, stringOf, tag, type CompoundTag, type Tag } from './nbtio';

/**
 * Editing the items in a Java player file. Item NBT changed shape over the years, so the file's
 * DataVersion decides how a name, lore, enchantments and the rest are written:
 * - before 1.20.5 (3837): `tag` with `display.Name` and `display.Lore` as JSON text, `Enchantments` as [{id, lvl}];
 * - 1.20.5 to 1.21.4: `components`, JSON text, enchantments as {levels: {id: level}};
 * - 1.21.5 (4325) and newer: `components`, text as NBT, enchantments as {id: level}, armour in `equipment`.
 */
export interface Format {
    components: boolean;
    nbtText: boolean;
    equipment: boolean;
}

export function detectFormat(root: CompoundTag): Format {
    const data = numberOf(root.value.get('DataVersion'), 0);
    if (data > 0) return { components: data >= 3837, nbtText: data >= 4325, equipment: data >= 4325 };

    // Without a DataVersion, judge by the items themselves.
    const items = [...listItems(root.value.get('Inventory')), ...listItems(root.value.get('EnderItems'))];
    const modern = items.some((item) => item.value.has('components') || item.value.has('count')) || isCompound(root.value.get('equipment'));

    return { components: modern, nbtText: isCompound(root.value.get('equipment')), equipment: isCompound(root.value.get('equipment')) };
}

const listItems = (value: Tag | undefined): CompoundTag[] => (isList(value) ? value.value.filter(isCompound) : []);

export type ArmourPart = 'head' | 'chest' | 'legs' | 'feet' | 'offhand';
export const ARMOUR_PARTS: ArmourPart[] = ['head', 'chest', 'legs', 'feet', 'offhand'];
const LEGACY_ARMOUR: Record<ArmourPart, number> = { feet: 100, legs: 101, chest: 102, head: 103, offhand: -106 };

/** Slot keys: inv:0–35 (hotbar 0–8), armour:head…offhand, ender:0–26. */
export type SlotKey = string;
export type Slots = Map<SlotKey, CompoundTag>;

/** Every item in the file by slot, without their Slot tags. */
export function readSlots(root: CompoundTag, format: Format): Slots {
    const slots: Slots = new Map();
    const strip = (item: CompoundTag) => {
        const copy = clone(item);
        copy.value.delete('Slot');

        return copy;
    };

    for (const item of listItems(root.value.get('Inventory'))) {
        const slot = numberOf(item.value.get('Slot'), -999);
        const legacy = ARMOUR_PARTS.find((part) => LEGACY_ARMOUR[part] === slot);
        if (slot >= 0 && slot < 36) slots.set(`inv:${slot}`, strip(item));
        else if (legacy) slots.set(`armour:${legacy}`, strip(item));
    }
    const equipment = root.value.get('equipment');
    if (format.equipment && isCompound(equipment)) {
        for (const part of ARMOUR_PARTS) {
            const item = equipment.value.get(part);
            if (isCompound(item)) slots.set(`armour:${part}`, clone(item));
        }
    }
    for (const item of listItems(root.value.get('EnderItems'))) {
        const slot = numberOf(item.value.get('Slot'), -1);
        if (slot >= 0 && slot < 27) slots.set(`ender:${slot}`, strip(item));
    }

    return slots;
}

const withSlot = (item: CompoundTag, slot: number): CompoundTag => {
    const copy = clone(item);
    copy.value.set('Slot', tag.byte(slot));

    return copy;
};

/** The file with its inventory, armour and ender chest replaced by these slots; everything else is kept. */
export function writeSlots(root: CompoundTag, format: Format, slots: Slots): CompoundTag {
    const next = clone(root);
    const managed = (slot: number) => (slot >= 0 && slot < 36) || (!format.equipment && Object.values(LEGACY_ARMOUR).includes(slot));
    const kept = listItems(root.value.get('Inventory')).filter((item) => !managed(numberOf(item.value.get('Slot'), -999)));

    const inventory: Tag[] = [...kept.map((item) => clone(item))];
    for (let slot = 0; slot < 36; slot++) {
        const item = slots.get(`inv:${slot}`);
        if (item) inventory.push(withSlot(item, slot));
    }
    if (format.equipment) {
        const previous = root.value.get('equipment');
        const equipment = isCompound(previous) ? clone(previous) : tag.compound();
        for (const part of ARMOUR_PARTS) {
            const item = slots.get(`armour:${part}`);
            if (item) equipment.value.set(part, clone(item));
            else equipment.value.delete(part);
        }
        if (equipment.value.size > 0) next.value.set('equipment', equipment);
        else next.value.delete('equipment');
    } else {
        for (const part of ARMOUR_PARTS) {
            const item = slots.get(`armour:${part}`);
            if (item) inventory.push(withSlot(item, LEGACY_ARMOUR[part]));
        }
    }
    next.value.set('Inventory', tag.list(10, inventory));

    const ender: Tag[] = [];
    for (let slot = 0; slot < 27; slot++) {
        const item = slots.get(`ender:${slot}`);
        if (item) ender.push(withSlot(item, slot));
    }
    next.value.set('EnderItems', tag.list(10, ender));

    return next;
}

/** Everything the player carries and wears gone; the ender chest stays. */
export function clearInventory(root: CompoundTag, format: Format): CompoundTag {
    const slots = readSlots(root, format);
    for (const key of [...slots.keys()]) if (!key.startsWith('ender:')) slots.delete(key);

    return writeSlots(root, format, slots);
}

export function makeItem(id: string, count: number, format: Format): CompoundTag {
    return format.components ? tag.compound([['id', tag.string(id)], ['count', tag.int(count)]]) : tag.compound([['id', tag.string(id)], ['Count', tag.byte(count)]]);
}

/* The parts of an item the editor shows as fields. */

export interface TextStyle {
    text: string;
    color: string | null;
    bold: boolean;
    italic: boolean | null;
}

export interface ItemFields {
    id: string;
    count: number;
    name: TextStyle | null;
    lore: TextStyle[];
    enchantments: { id: string; level: number }[];
    stored: { id: string; level: number }[];
    damage: number;
    unbreakable: boolean;
}

const COMPONENT = (name: string) => `minecraft:${name}`;

const parent = (item: CompoundTag, format: Format, create: boolean): CompoundTag | null => {
    const key = format.components ? 'components' : 'tag';
    const existing = item.value.get(key);
    if (isCompound(existing)) return existing;
    if (!create) return null;
    const made = tag.compound();
    item.value.set(key, made);

    return made;
};

/** Drops an empty components or tag compound so an unchanged item stays as small as before. */
const tidy = (item: CompoundTag, format: Format) => {
    const key = format.components ? 'components' : 'tag';
    const holder = item.value.get(key);
    if (isCompound(holder) && holder.value.size === 0) item.value.delete(key);
};

/* Text: a JSON string before 1.21.5, NBT from then on. */

function styleFromJson(value: unknown): TextStyle {
    if (typeof value === 'string') return { text: value, color: null, bold: false, italic: null };
    if (Array.isArray(value)) {
        const parts = value.map(styleFromJson);

        return { ...(parts[0] ?? { color: null, bold: false, italic: null }), text: parts.map((part) => part.text).join('') };
    }
    const object = (value ?? {}) as { text?: unknown; color?: unknown; bold?: unknown; italic?: unknown; extra?: unknown[] };
    const extra = Array.isArray(object.extra) ? object.extra.map(styleFromJson).map((part) => part.text).join('') : '';

    return { text: `${typeof object.text === 'string' ? object.text : ''}${extra}`, color: typeof object.color === 'string' ? object.color : null, bold: object.bold === true || object.bold === 1, italic: typeof object.italic === 'boolean' ? object.italic : object.italic === 1 ? true : object.italic === 0 ? false : null };
}

function readText(value: Tag | undefined): TextStyle | null {
    if (!value) return null;
    if (value.type === 8) {
        try {
            return styleFromJson(JSON.parse(value.value));
        } catch {
            return { text: value.value, color: null, bold: false, italic: null };
        }
    }
    if (value.type === 10) {
        return styleFromJson({ text: stringOf(value.value.get('text')) ?? '', color: stringOf(value.value.get('color')) ?? undefined, bold: numberOf(value.value.get('bold'), 0), italic: value.value.has('italic') ? numberOf(value.value.get('italic')) : undefined, extra: isList(value.value.get('extra')) ? (value.value.get('extra') as Extract<Tag, { type: 9 }>).value.map((part) => (part.type === 8 ? part.value : { text: stringOf((part as CompoundTag).value?.get('text')) ?? '' })) : undefined });
    }
    if (value.type === 9) return styleFromJson(value.value.map((part) => readText(part) ?? ''));

    return null;
}

function writeText(style: TextStyle, format: Format): Tag {
    const plain = style.color === null && !style.bold && style.italic === null;
    if (format.nbtText) {
        if (plain) return tag.string(style.text);
        const entries: [string, Tag][] = [['text', tag.string(style.text)]];
        if (style.color) entries.push(['color', tag.string(style.color)]);
        if (style.bold) entries.push(['bold', tag.byte(1)]);
        if (style.italic !== null) entries.push(['italic', tag.byte(style.italic ? 1 : 0)]);

        return tag.compound(entries);
    }

    return tag.string(JSON.stringify({ text: style.text, ...(style.color ? { color: style.color } : {}), ...(style.bold ? { bold: true } : {}), ...(style.italic !== null ? { italic: style.italic } : {}) }));
}

/* Enchantments. */

function readEnchantments(value: Tag | undefined): { id: string; level: number }[] {
    if (isList(value)) {
        return value.value.filter(isCompound).flatMap((entry) => {
            const id = stringOf(entry.value.get('id'));

            return id ? [{ id, level: numberOf(entry.value.get('lvl'), 1) }] : [];
        });
    }
    if (!isCompound(value)) return [];
    const levels = value.value.get('levels');
    const map = isCompound(levels) ? levels : value;

    return [...map.value].filter(([key, level]) => key !== 'show_in_tooltip' && level.type !== 10).map(([id, level]) => ({ id, level: numberOf(level, 1) }));
}

function writeEnchantments(previous: Tag | undefined, list: { id: string; level: number }[], format: Format): Tag | null {
    if (list.length === 0) return null;
    if (!format.components) return tag.list(10, list.map((entry) => tag.compound([['id', tag.string(entry.id)], ['lvl', tag.short(entry.level)]])));
    const levels = tag.compound(list.map((entry) => [entry.id, tag.int(entry.level)]));
    if (format.nbtText) return levels;
    // 1.20.5–1.21.4 keep the levels under "levels", beside show_in_tooltip.
    const wrapper = isCompound(previous) ? clone(previous) : tag.compound();
    wrapper.value.set('levels', levels);

    return wrapper;
}

export function readFields(item: CompoundTag, format: Format): ItemFields {
    const holder = parent(item, format, false);
    const display = !format.components && holder ? holder.value.get('display') : undefined;
    const get = (component: string, legacy: string) => (format.components ? holder?.value.get(COMPONENT(component)) : holder?.value.get(legacy));
    const loreTag = format.components ? holder?.value.get(COMPONENT('lore')) : isCompound(display) ? display.value.get('Lore') : undefined;

    return {
        id: stringOf(item.value.get('id')) ?? 'minecraft:air',
        count: numberOf(item.value.get(format.components ? 'count' : 'Count'), 1),
        name: format.components ? readText(holder?.value.get(COMPONENT('custom_name'))) : isCompound(display) ? readText(display.value.get('Name')) : null,
        lore: isList(loreTag) ? loreTag.value.map((line) => readText(line) ?? { text: '', color: null, bold: false, italic: null }) : [],
        enchantments: readEnchantments(get('enchantments', 'Enchantments')),
        stored: readEnchantments(get('stored_enchantments', 'StoredEnchantments')),
        damage: numberOf(get('damage', 'Damage'), 0),
        unbreakable: format.components ? holder?.value.has(COMPONENT('unbreakable')) === true : numberOf(holder?.value.get('Unbreakable'), 0) === 1,
    };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The item with the fields that changed written in; everything the editor does not show is kept as it was. */
export function applyFields(item: CompoundTag, fields: ItemFields, format: Format): CompoundTag {
    const before = readFields(item, format);
    const next = clone(item);

    if (fields.id !== before.id) next.value.set('id', tag.string(fields.id));
    if (fields.count !== before.count) {
        const key = format.components ? 'count' : 'Count';
        next.value.set(key, sameKindNumber(item.value.get(key), fields.count, format.components ? 3 : 1));
    }

    const set = (component: string, legacy: string, value: Tag | null) => {
        const holder = parent(next, format, value !== null);
        if (!holder) return;
        const key = format.components ? COMPONENT(component) : legacy;
        if (value === null) holder.value.delete(key);
        else holder.value.set(key, value);
    };
    const holderBefore = parent(item, format, false);

    if (!same(fields.name, before.name) || !same(fields.lore, before.lore)) {
        const name = fields.name && fields.name.text !== '' ? writeText(fields.name, format) : null;
        const lore = fields.lore.length > 0 ? tag.list(format.nbtText ? (fields.lore.some((line) => line.color || line.bold || line.italic !== null) ? 10 : 8) : 8, []) : null;
        if (lore) lore.value = fields.lore.map((line) => writeText(line, format));
        // A list must hold one type; plain lines become compounds when any line is styled.
        if (lore && format.nbtText && lore.value.some((line) => line.type === 10)) lore.value = lore.value.map((line) => (line.type === 8 ? tag.compound([['text', line]]) : line));

        if (format.components) {
            set('custom_name', '', name);
            set('lore', '', lore);
        } else {
            const holder = parent(next, format, name !== null || lore !== null);
            if (holder) {
                const previous = holder.value.get('display');
                const display = isCompound(previous) ? previous : tag.compound();
                if (name) display.value.set('Name', name);
                else display.value.delete('Name');
                if (lore) display.value.set('Lore', lore);
                else display.value.delete('Lore');
                if (display.value.size > 0) holder.value.set('display', display);
                else holder.value.delete('display');
            }
        }
    }

    if (!same(fields.enchantments, before.enchantments)) {
        set('enchantments', 'Enchantments', writeEnchantments(holderBefore?.value.get(format.components ? COMPONENT('enchantments') : 'Enchantments'), fields.enchantments, format));
    }
    if (!same(fields.stored, before.stored)) {
        set('stored_enchantments', 'StoredEnchantments', writeEnchantments(holderBefore?.value.get(format.components ? COMPONENT('stored_enchantments') : 'StoredEnchantments'), fields.stored, format));
    }
    if (fields.damage !== before.damage) set('damage', 'Damage', fields.damage > 0 ? tag.int(fields.damage) : null);
    if (fields.unbreakable !== before.unbreakable) set('unbreakable', 'Unbreakable', fields.unbreakable ? (format.components ? tag.compound() : tag.byte(1)) : null);

    tidy(next, format);

    return next;
}
