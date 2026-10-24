import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Alert, Button, Input, NamedIcon, Spinner, Switch, cn, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { writePlayerData } from '../../api/players';
import { ARMOUR_PARTS, applyFields, detectFormat, makeItem, readFields, readSlots, writeSlots, type ArmourPart, type Format, type ItemFields, type SlotKey, type Slots, type TextStyle } from '../../lib/inventoryEdit';
import { base64ToBytes } from '../../lib/nbt';
import { bytesToBase64, readNbtFileTyped, toPlain, writeNbtFileTyped, type CompoundTag, type NbtFile } from '../../lib/nbtio';
import { readItem, type Item } from '../../lib/player';
import { ENCHANTMENTS, enchantmentName, enchantmentsFor, itemInfo, searchItems, type ItemInfo } from '../../lib/registry';
import { parseCompound, stringify } from '../../lib/snbt';
import ItemSlot, { ItemIcon, type EmptySlot } from './ItemSlot';

const SLOT_TYPE = 'application/x-prism-slot';
const ITEM_TYPE = 'application/x-prism-item';

const OUTLINE: Partial<Record<ArmourPart, EmptySlot>> = { head: 'helmet', chest: 'chestplate', legs: 'leggings', feet: 'boots' };
const COLOURS = ['black', 'dark_blue', 'dark_green', 'dark_aqua', 'dark_red', 'dark_purple', 'gold', 'gray', 'dark_gray', 'blue', 'green', 'aqua', 'red', 'light_purple', 'yellow', 'white'];
const HEX: Record<string, string> = { black: '#000000', dark_blue: '#0000AA', dark_green: '#00AA00', dark_aqua: '#00AAAA', dark_red: '#AA0000', dark_purple: '#AA00AA', gold: '#FFAA00', gray: '#AAAAAA', dark_gray: '#555555', blue: '#5555FF', green: '#55FF55', aqua: '#55FFFF', red: '#FF5555', light_purple: '#FF55FF', yellow: '#FFFF55', white: '#FFFFFF' };

const show = (item: CompoundTag): Item | null => readItem(toPlain(item));
const iconItem = (id: string): Item => ({ id, count: 1, slot: -1, name: null, lore: [], enchantments: [], stored: [], damage: 0, maxDamage: null, unbreakable: false });
const sameItem = (a: CompoundTag | undefined, b: CompoundTag | undefined) => (a && b ? stringify(a) === stringify(b) : a === b);

/** The keys of one section's slots in reading order, for keyboard moves. */
const INVENTORY_ORDER: SlotKey[] = [...ARMOUR_PARTS.map((part) => `armour:${part}`), ...Array.from({ length: 27 }, (_, i) => `inv:${i + 9}`), ...Array.from({ length: 9 }, (_, i) => `inv:${i}`)];
const ENDER_ORDER: SlotKey[] = Array.from({ length: 27 }, (_, i) => `ender:${i}`);

/**
 * The inventory and ender chest of an offline Java player, editable: drag items in from every item
 * in the game, move, split and remove them, and change names, lore, enchantments and the raw NBT.
 * Saving rewrites the player's file; the previous one is kept beside it.
 */
export default function InventoryEditor({ server, uuid, name, dat, hash, version, initialTab, onClose, onSaved }: { server: string; uuid: string; name: string; dat: string; hash: string; version: string | null; initialTab: 'inventory' | 'ender'; onClose: () => void; onSaved: () => void }) {
    const [file, setFile] = useState<NbtFile | null>(null);
    const [failure, setFailure] = useState<string | null>(null);
    const [original, setOriginal] = useState<Slots>(new Map());
    const [slots, setSlots] = useState<Slots>(new Map());
    const [tab, setTab] = useState(initialTab);
    const [selected, setSelected] = useState<SlotKey | null>(null);
    const [saving, setSaving] = useState(false);
    const [conflict, setConflict] = useState<string | null>(null);
    const [leaving, setLeaving] = useState(false);
    const format = useMemo<Format | null>(() => (file ? detectFormat(file.root) : null), [file]);

    useEffect(() => {
        readNbtFileTyped(base64ToBytes(dat))
            .then((read) => {
                const found = readSlots(read.root, detectFormat(read.root));
                setFile(read);
                setOriginal(found);
                setSlots(new Map(found));
            })
            .catch((error: Error) => setFailure(error.message));
    }, [dat]);

    const changed = useMemo(() => [...new Set([...original.keys(), ...slots.keys()])].filter((key) => !sameItem(original.get(key), slots.get(key))), [original, slots]);

    const put = (updates: [SlotKey, CompoundTag | null][]) =>
        setSlots((current) => {
            const next = new Map(current);
            for (const [key, item] of updates) {
                if (item) next.set(key, item);
                else next.delete(key);
            }

            return next;
        });

    const save = async () => {
        if (!file || !format) return;
        setSaving(true);
        setConflict(null);
        try {
            const bytes = await writeNbtFileTyped({ ...file, root: writeSlots(file.root, format, slots) });
            await writePlayerData(server, uuid, bytesToBase64(bytes), hash);
            toast.success(`${name}'s items are saved. The previous file is kept as ${uuid}.dat.prism-backup.`);
            onSaved();
            onClose();
        } catch (error) {
            const status = (error as { response?: { status?: number } }).response?.status;
            if (status === 409) setConflict(httpErrorToHuman(error));
            else toast.error(httpErrorToHuman(error));
        } finally {
            setSaving(false);
        }
    };

    const close = () => (changed.length > 0 && !leaving ? setLeaving(true) : onClose());

    useEffect(() => {
        const escape = (event: globalThis.KeyboardEvent) => event.key === 'Escape' && !(event.target as HTMLElement)?.closest('input, textarea, select') && close();
        window.addEventListener('keydown', escape);

        return () => window.removeEventListener('keydown', escape);
    });

    // Moving, swapping and dropping: from another slot, or a new item from the list.
    const drop = (event: DragEvent, target: SlotKey) => {
        event.preventDefault();
        if (!format) return;
        const from = event.dataTransfer.getData(SLOT_TYPE);
        const id = event.dataTransfer.getData(ITEM_TYPE);
        if (from && from !== target) {
            put([
                [target, slots.get(from) ?? null],
                [from, slots.get(target) ?? null],
            ]);
        } else if (id) {
            const stack = event.shiftKey ? (itemInfo(id)?.stackSize ?? 1) : 1;
            put([[target, makeItem(id, stack, format)]]);
        }
        setSelected(target);
    };

    const order = tab === 'ender' ? ENDER_ORDER : INVENTORY_ORDER;

    /** Shift-click: half the stack goes to the first empty slot of the same section. */
    const split = (key: SlotKey) => {
        const item = slots.get(key);
        if (!item || !format) return;
        const fields = readFields(item, format);
        if (fields.count < 2) return;
        const empty = order.find((slot) => !slots.has(slot) && !slot.startsWith('armour:'));
        if (!empty) return toast.error('There is no empty slot for the other half.');
        const half = Math.floor(fields.count / 2);
        put([
            [key, applyFields(item, { ...fields, count: fields.count - half }, format)],
            [empty, applyFields(item, { ...fields, count: half }, format)],
        ]);
    };

    const keys = (event: KeyboardEvent, key: SlotKey) => {
        const index = order.indexOf(key);
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: tab === 'ender' ? -9 : -9, ArrowDown: 9 }[event.key];
        if (step !== undefined) {
            event.preventDefault();
            const next = order[Math.min(order.length - 1, Math.max(0, index + step))];
            setSelected(next);
            document.getElementById(`mcs-edit-${next}`)?.focus();
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            put([[key, null]]);
        }
    };

    const slot = (key: SlotKey, outline?: EmptySlot) => {
        const item = slots.get(key);
        const shown = item ? show(item) : null;

        return (
            <div
                key={key}
                id={`mcs-edit-${key}`}
                role={'button'}
                tabIndex={0}
                aria-label={shown ? `${shown.name ?? shown.id} in slot ${key}` : `Empty slot ${key}`}
                aria-pressed={selected === key}
                draggable={!!item}
                onDragStart={(event) => {
                    event.dataTransfer.setData(SLOT_TYPE, key);
                    event.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => drop(event, key)}
                onClick={(event) => (event.shiftKey ? split(key) : setSelected(key))}
                onKeyDown={(event) => keys(event, key)}
                className={cn('mcs:relative mcs:cursor-pointer mcs:outline-none mcs:focus-visible:ring-2 mcs:focus-visible:ring-primary', changed.includes(key) && 'mcs:after:absolute mcs:after:top-0.5 mcs:after:right-0.5 mcs:after:size-1.5 mcs:after:rounded-full mcs:after:bg-warning')}
            >
                <ItemSlot item={shown} version={version} selected={selected === key} size={'lg'} empty={outline} />
            </div>
        );
    };

    const row = (from: number, prefix: 'inv' | 'ender') => <div className={'mcs:flex'}>{Array.from({ length: 9 }, (_, i) => slot(`${prefix}:${from + i}`))}</div>;
    const current = selected ? slots.get(selected) : undefined;

    return (
        <div className={'mcs:fixed mcs:inset-0 mcs:z-50 mcs:flex mcs:items-center mcs:justify-center mcs:bg-black/60 mcs:p-4'} role={'dialog'} aria-modal={'true'} aria-label={`Edit ${name}'s items`}>
            <div className={'mcs:flex mcs:h-[min(94vh,880px)] mcs:w-full mcs:max-w-[1180px] mcs:flex-col mcs:overflow-hidden mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:shadow-2xl'}>
                <header className={'mcs:flex mcs:items-center mcs:gap-3 mcs:border-b mcs:border-border mcs:px-5 mcs:py-3'}>
                    <NamedIcon name={'pencil'} size={18} className={'mcs:text-primary'} />
                    <div className={'mcs:min-w-0 mcs:flex-1'}>
                        <h2 className={'mcs:font-semibold'}>Edit {name}&apos;s items</h2>
                        <p className={'mcs:text-xs mcs:text-muted-foreground'}>Drag items in from the list, between slots, or onto the bin. Shift-click splits a stack. Changes are written to the player file when you save.</p>
                    </div>
                    <button type={'button'} onClick={close} aria-label={'Close'} className={'mcs:flex mcs:size-8 mcs:cursor-pointer mcs:items-center mcs:justify-center mcs:rounded-md mcs:text-muted-foreground mcs:hover:bg-muted mcs:hover:text-foreground'}>
                        <NamedIcon name={'x'} size={18} />
                    </button>
                </header>

                {failure ? (
                    <div className={'mcs:p-5'}>
                        <Alert type={'danger'}>The player file could not be read: {failure}</Alert>
                    </div>
                ) : !file || !format ? (
                    <div className={'mcs:p-10'}>
                        <Spinner centered />
                    </div>
                ) : (
                    <div className={'mcs:grid mcs:min-h-0 mcs:flex-1 mcs:grid-cols-1 mcs:overflow-y-auto mcs:lg:grid-cols-[auto_minmax(0,1fr)] mcs:lg:overflow-hidden'}>
                        <div className={'mcs:flex mcs:flex-col mcs:gap-4 mcs:border-border mcs:p-5 mcs:lg:overflow-x-hidden mcs:lg:overflow-y-auto mcs:lg:border-r'}>
                            <div className={'prism-switch mcs:flex mcs:self-start mcs:rounded-md mcs:bg-muted mcs:p-0.5'}>
                                {(
                                    [
                                        ['inventory', 'Inventory', 'package'],
                                        ['ender', 'Ender Chest', 'box'],
                                    ] as const
                                ).map(([value, label, icon]) => (
                                    <button
                                        key={value}
                                        type={'button'}
                                        onClick={() => {
                                            setTab(value);
                                            setSelected(null);
                                        }}
                                        className={cn('prism-switch-item mcs:inline-flex mcs:cursor-pointer mcs:items-center mcs:gap-1.5 mcs:rounded mcs:px-3 mcs:py-1.5 mcs:text-sm', tab === value ? 'mcs:bg-primary mcs:text-primary-foreground' : 'mcs:text-muted-foreground mcs:hover:text-foreground')}
                                    >
                                        <NamedIcon name={icon} size={14} /> {label}
                                    </button>
                                ))}
                            </div>

                            <div className={'mcs-inventory mcs:inline-flex mcs:flex-col mcs:gap-3 mcs:self-start mcs:p-3'}>
                                {tab === 'inventory' ? (
                                    <>
                                        <div className={'mcs:flex mcs:items-end mcs:gap-3'}>
                                            <div className={'mcs:flex mcs:flex-col'}>{(['head', 'chest', 'legs', 'feet'] as const).map((part) => slot(`armour:${part}`, OUTLINE[part]))}</div>
                                            <div className={'mcs:flex mcs:flex-col mcs:items-center mcs:gap-1'}>
                                                <span className={'mcs-font mcs:text-xs mcs:text-[#404040]'}>Offhand</span>
                                                {slot('armour:offhand')}
                                            </div>
                                        </div>
                                        <div>
                                            {row(9, 'inv')}
                                            {row(18, 'inv')}
                                            {row(27, 'inv')}
                                        </div>
                                        <div>
                                            <span className={'mcs-font mcs:text-xs mcs:text-[#404040]'}>Hotbar</span>
                                            {row(0, 'inv')}
                                        </div>
                                    </>
                                ) : (
                                    <div>
                                        {row(0, 'ender')}
                                        {row(9, 'ender')}
                                        {row(18, 'ender')}
                                    </div>
                                )}
                            </div>

                            <Bin
                                onDrop={(key) => {
                                    put([[key, null]]);
                                    if (selected === key) setSelected(null);
                                }}
                            />

                            {current && selected ? (
                                <Details key={selected} item={current} format={format} onChange={(item) => put([[selected, item]])} onRemove={() => put([[selected, null]])} />
                            ) : (
                                <p className={'mcs:max-w-md mcs:text-sm mcs:text-muted-foreground'}>{selected ? 'An empty slot. Click an item in the list to put it here.' : 'Select a slot to change its item, name, lore and enchantments.'}</p>
                            )}
                        </div>

                        <Palette
                            version={version}
                            selectedItem={current ? readFields(current, format).id : null}
                            onPick={(id, stack) => {
                                if (!selected || selected.startsWith(tab === 'ender' ? 'inv' : 'ender')) return toast.error('Select a slot first, or drag the item onto one.');
                                put([[selected, current ? applyFields(current, { ...readFields(current, format), id }, format) : makeItem(id, stack ? (itemInfo(id)?.stackSize ?? 1) : 1, format)]]);
                            }}
                        />
                    </div>
                )}

                <footer className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-3 mcs:border-t mcs:border-border mcs:px-5 mcs:py-3'}>
                    {conflict ? (
                        <span className={'mcs:flex mcs:flex-1 mcs:items-center mcs:gap-2 mcs:text-sm mcs:text-destructive'}>
                            <NamedIcon name={'triangle-alert'} size={15} /> {conflict}
                            <Button.Text
                                size={'small'}
                                onClick={() => {
                                    onSaved();
                                    onClose();
                                }}
                            >
                                Reload the latest save
                            </Button.Text>
                        </span>
                    ) : leaving ? (
                        <span className={'mcs:flex-1 mcs:text-sm'}>Close and lose {changed.length === 1 ? 'one change' : `${changed.length} changes`}?</span>
                    ) : (
                        <span className={'mcs:flex-1 mcs:text-xs mcs:text-muted-foreground'}>
                            {changed.length === 0 ? 'No changes yet.' : `${changed.length} ${changed.length === 1 ? 'slot' : 'slots'} changed.`} The previous file is kept as {uuid}.dat.prism-backup.
                        </span>
                    )}
                    {leaving ? (
                        <>
                            <Button.Text onClick={() => setLeaving(false)}>Keep editing</Button.Text>
                            <Button.Danger onClick={onClose}>Close without saving</Button.Danger>
                        </>
                    ) : (
                        <>
                            <Button.Text disabled={saving || changed.length === 0} onClick={() => setSlots(new Map(original))}>
                                Discard
                            </Button.Text>
                            <Button isLoading={saving} disabled={changed.length === 0} onClick={save}>
                                Save to player file
                            </Button>
                        </>
                    )}
                </footer>
            </div>
        </div>
    );
}

function Bin({ onDrop }: { onDrop: (key: SlotKey) => void }) {
    const [over, setOver] = useState(false);

    return (
        <div
            onDragOver={(event) => {
                if (event.dataTransfer.types.includes(SLOT_TYPE)) {
                    event.preventDefault();
                    setOver(true);
                }
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
                event.preventDefault();
                setOver(false);
                const key = event.dataTransfer.getData(SLOT_TYPE);
                if (key) onDrop(key);
            }}
            className={cn('mcs:flex mcs:max-w-md mcs:items-center mcs:justify-center mcs:gap-2 mcs:rounded-md mcs:border mcs:border-dashed mcs:py-2 mcs:text-sm', over ? 'mcs:border-destructive mcs:bg-destructive/10 mcs:text-destructive' : 'mcs:border-border mcs:text-muted-foreground')}
        >
            <NamedIcon name={'trash-2'} size={15} /> Drop here to remove
        </div>
    );
}

/** Every item in the game: search, then drag onto a slot or click to put it in the selected one. */
function Palette({ version, selectedItem, onPick }: { version: string | null; selectedItem: string | null; onPick: (id: string, stack: boolean) => void }) {
    const [term, setTerm] = useState('');
    const results = useMemo(() => searchItems(term, 240), [term]);

    return (
        <div className={'mcs:flex mcs:min-h-0 mcs:flex-col mcs:gap-3 mcs:p-5'}>
            <div className={'mcs:relative'}>
                <NamedIcon name={'search'} size={14} className={'mcs:pointer-events-none mcs:absolute mcs:top-1/2 mcs:left-3 mcs:-translate-y-1/2 mcs:text-muted-foreground'} />
                <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder={'Search every item, such as diamond sword'} aria-label={'Search items'} className={'mcs:w-full mcs:pl-8'} />
            </div>
            <p className={'mcs:text-xs mcs:text-muted-foreground'}>
                {results.length === 240 ? 'The first 240 matches.' : `${results.length} items.`} Drag onto a slot, or click to put it in the selected one; hold Shift for a full stack.
            </p>
            <div className={'mcs:grid mcs:min-h-0 mcs:flex-1 mcs:grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] mcs:content-start mcs:gap-1 mcs:overflow-y-auto mcs:pr-1 mcs:lg:max-h-[62vh]'}>
                {results.map((item) => (
                    <PaletteItem key={item.id} item={item} version={version} active={item.id === selectedItem} onPick={onPick} />
                ))}
            </div>
        </div>
    );
}

function PaletteItem({ item, version, active, onPick }: { item: ItemInfo; version: string | null; active: boolean; onPick: (id: string, stack: boolean) => void }) {
    return (
        <button
            type={'button'}
            draggable
            onDragStart={(event) => {
                event.dataTransfer.setData(ITEM_TYPE, item.id);
                event.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={(event) => onPick(item.id, event.shiftKey)}
            title={`${item.name} (${item.id})`}
            aria-label={item.name}
            className={cn('mcs:flex mcs:aspect-square mcs:cursor-grab mcs:items-center mcs:justify-center mcs:rounded-md mcs:border mcs:p-1.5 mcs:hover:border-primary mcs:hover:bg-muted', active ? 'mcs:border-primary mcs:bg-primary/10' : 'mcs:border-transparent mcs:bg-muted/40')}
        >
            <ItemIcon item={iconItem(item.id)} version={version} />
        </button>
    );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
    return (
        <label className={'mcs:flex mcs:flex-col mcs:gap-1'}>
            <span className={'mcs:text-xs mcs:font-medium mcs:text-muted-foreground'}>{label}</span>
            {children}
            {hint && <span className={'mcs:text-xs mcs:text-muted-foreground'}>{hint}</span>}
        </label>
    );
}

function StyleControls({ style, onChange }: { style: TextStyle; onChange: (style: TextStyle) => void }) {
    return (
        <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-1'}>
            <select
                value={style.color ?? ''}
                onChange={(event) => onChange({ ...style, color: event.target.value || null })}
                aria-label={'Colour'}
                className={'mcs:rounded-md mcs:border mcs:border-input-border mcs:bg-input mcs:px-2 mcs:py-1 mcs:text-xs'}
            >
                <option value={''}>Default colour</option>
                {COLOURS.map((colour) => (
                    <option key={colour} value={colour}>
                        {colour.replace(/_/g, ' ')}
                    </option>
                ))}
            </select>
            {style.color && <span className={'mcs:size-4 mcs:rounded-sm mcs:border mcs:border-border'} style={{ background: HEX[style.color] ?? style.color }} />}
            <button type={'button'} aria-pressed={style.bold} onClick={() => onChange({ ...style, bold: !style.bold })} className={cn('mcs:rounded mcs:px-2 mcs:py-0.5 mcs:text-xs mcs:font-bold', style.bold ? 'mcs:bg-primary mcs:text-primary-foreground' : 'mcs:bg-muted')}>
                B
            </button>
            <button type={'button'} aria-pressed={style.italic === true} title={'Italic; names are italic by default in the game until this is set'} onClick={() => onChange({ ...style, italic: style.italic === true ? false : style.italic === false ? null : true })} className={cn('mcs:rounded mcs:px-2 mcs:py-0.5 mcs:text-xs mcs:italic', style.italic === true ? 'mcs:bg-primary mcs:text-primary-foreground' : style.italic === false ? 'mcs:bg-muted mcs:line-through' : 'mcs:bg-muted')}>
                I
            </button>
        </div>
    );
}

const blank = (): TextStyle => ({ text: '', color: null, bold: false, italic: false });

/** The selected slot's item as fields, plus its raw NBT for everything else. */
function Details({ item, format, onChange, onRemove }: { item: CompoundTag; format: Format; onChange: (item: CompoundTag) => void; onRemove: () => void }) {
    const fields = readFields(item, format);
    const info = itemInfo(fields.id);
    const book = fields.id === 'minecraft:enchanted_book';
    const list = book ? fields.stored : fields.enchantments;
    const [everything, setEverything] = useState(false);
    const [raw, setRaw] = useState(false);
    const [text, setText] = useState(() => stringify(item));
    const [problem, setProblem] = useState<string | null>(null);
    const lastWritten = useRef(stringify(item));

    // The raw text follows changes made in the fields, unless it is being edited.
    useEffect(() => {
        const now = stringify(item);
        if (now !== lastWritten.current) {
            lastWritten.current = now;
            setText(now);
            setProblem(null);
        }
    }, [item]);

    const set = (patch: Partial<ItemFields>) => onChange(applyFields(item, { ...fields, ...patch }, format));
    const setList = (next: { id: string; level: number }[]) => set(book ? { stored: next } : { enchantments: next });
    const choices = (everything ? ENCHANTMENTS : enchantmentsFor(fields.id)).filter((entry) => !list.some((current) => current.id === entry.id));

    return (
        <div className={'mcs:flex mcs:max-w-xl mcs:flex-col mcs:gap-3 mcs:rounded-lg mcs:border mcs:border-border mcs:p-4'}>
            <div className={'mcs:flex mcs:items-center mcs:gap-2'}>
                <div className={'mcs:size-8'}>
                    <ItemIcon item={iconItem(fields.id)} version={null} />
                </div>
                <div className={'mcs:min-w-0 mcs:flex-1'}>
                    <p className={'mcs:truncate mcs:text-sm mcs:font-semibold'}>{info?.name ?? fields.id}</p>
                    <p className={'mcs:truncate mcs:font-mono mcs:text-xs mcs:text-muted-foreground'}>{fields.id}</p>
                </div>
                <Button.Danger isSecondary size={'small'} onClick={onRemove}>
                    Remove
                </Button.Danger>
            </div>

            <div className={'mcs:grid mcs:grid-cols-2 mcs:gap-3'}>
                <Field label={'Count'} hint={info ? `Stacks to ${info.stackSize} in the game.` : undefined}>
                    <Input type={'number'} min={1} max={99} value={fields.count} onChange={(event) => set({ count: Math.min(99, Math.max(1, Number(event.target.value) || 1)) })} />
                </Field>
                {info && info.maxDurability > 0 && (
                    <Field label={`Durability (${info.maxDurability - fields.damage} of ${info.maxDurability})`}>
                        <input type={'range'} min={0} max={info.maxDurability} value={info.maxDurability - fields.damage} onChange={(event) => set({ damage: info.maxDurability - Number(event.target.value) })} style={{ accentColor: 'var(--primary)' }} aria-label={'Durability'} />
                    </Field>
                )}
            </div>

            <Field label={'Name'}>
                <div className={'mcs:flex mcs:flex-col mcs:gap-1'}>
                    <Input value={fields.name?.text ?? ''} placeholder={info?.name ?? 'The item’s own name'} onChange={(event) => set({ name: { ...(fields.name ?? blank()), text: event.target.value } })} />
                    {fields.name && <StyleControls style={fields.name} onChange={(name) => set({ name })} />}
                </div>
            </Field>

            <div className={'mcs:flex mcs:flex-col mcs:gap-1'}>
                <span className={'mcs:text-xs mcs:font-medium mcs:text-muted-foreground'}>Lore</span>
                {fields.lore.map((line, index) => (
                    <div key={index} className={'mcs:flex mcs:flex-col mcs:gap-1 mcs:rounded-md mcs:bg-muted/40 mcs:p-2'}>
                        <div className={'mcs:flex mcs:gap-1'}>
                            <Input value={line.text} aria-label={`Lore line ${index + 1}`} onChange={(event) => set({ lore: fields.lore.map((entry, at) => (at === index ? { ...entry, text: event.target.value } : entry)) })} className={'mcs:flex-1'} />
                            <button type={'button'} disabled={index === 0} onClick={() => set({ lore: fields.lore.map((entry, at) => (at === index - 1 ? fields.lore[index] : at === index ? fields.lore[index - 1] : entry)) })} aria-label={'Move up'} className={'mcs:rounded mcs:px-1.5 mcs:text-muted-foreground mcs:hover:text-foreground mcs:disabled:opacity-30'}>
                                <NamedIcon name={'arrow-up'} size={14} />
                            </button>
                            <button type={'button'} onClick={() => set({ lore: fields.lore.filter((_, at) => at !== index) })} aria-label={'Remove line'} className={'mcs:rounded mcs:px-1.5 mcs:text-muted-foreground mcs:hover:text-destructive'}>
                                <NamedIcon name={'x'} size={14} />
                            </button>
                        </div>
                        <StyleControls style={line} onChange={(style) => set({ lore: fields.lore.map((entry, at) => (at === index ? style : entry)) })} />
                    </div>
                ))}
                <Button.Text size={'small'} onClick={() => set({ lore: [...fields.lore, blank()] })}>
                    <NamedIcon name={'plus'} size={14} /> Add a line
                </Button.Text>
            </div>

            <div className={'mcs:flex mcs:flex-col mcs:gap-1'}>
                <div className={'mcs:flex mcs:items-center mcs:gap-2'}>
                    <span className={'mcs:flex-1 mcs:text-xs mcs:font-medium mcs:text-muted-foreground'}>{book ? 'Stored enchantments' : 'Enchantments'}</span>
                    {!book && (
                        <label className={'mcs:flex mcs:items-center mcs:gap-1.5 mcs:text-xs mcs:text-muted-foreground'}>
                            <Switch checked={everything} onChange={setEverything} aria-label={'Offer every enchantment'} /> Any enchantment
                        </label>
                    )}
                </div>
                {list.map((entry) => (
                    <div key={entry.id} className={'mcs:flex mcs:items-center mcs:gap-2'}>
                        <span className={'mcs:flex-1 mcs:text-sm'}>{enchantmentName(entry.id)}</span>
                        <Input type={'number'} min={1} max={255} value={entry.level} aria-label={`${enchantmentName(entry.id)} level`} onChange={(event) => setList(list.map((current) => (current.id === entry.id ? { ...current, level: Math.min(255, Math.max(1, Number(event.target.value) || 1)) } : current)))} className={'mcs:w-20'} />
                        <button type={'button'} onClick={() => setList(list.filter((current) => current.id !== entry.id))} aria-label={`Remove ${enchantmentName(entry.id)}`} className={'mcs:text-muted-foreground mcs:hover:text-destructive'}>
                            <NamedIcon name={'x'} size={14} />
                        </button>
                    </div>
                ))}
                {choices.length > 0 && (
                    <select
                        value={''}
                        onChange={(event) => {
                            const picked = ENCHANTMENTS.find((entry) => entry.id === event.target.value);
                            if (picked) setList([...list, { id: picked.id, level: picked.maxLevel }]);
                        }}
                        aria-label={'Add an enchantment'}
                        className={'mcs:rounded-md mcs:border mcs:border-input-border mcs:bg-input mcs:px-2 mcs:py-1.5 mcs:text-sm'}
                    >
                        <option value={''}>Add an enchantment…</option>
                        {choices.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                                {entry.name} (up to {entry.maxLevel})
                            </option>
                        ))}
                    </select>
                )}
            </div>

            <label className={'mcs:flex mcs:items-center mcs:gap-2 mcs:text-sm'}>
                <Switch checked={fields.unbreakable} onChange={(unbreakable) => set({ unbreakable })} aria-label={'Unbreakable'} /> Unbreakable
            </label>

            <div className={'mcs:flex mcs:flex-col mcs:gap-1 mcs:border-t mcs:border-border mcs:pt-3'}>
                <button type={'button'} onClick={() => setRaw(!raw)} className={'mcs:flex mcs:items-center mcs:gap-1 mcs:self-start mcs:text-xs mcs:font-medium mcs:text-muted-foreground mcs:hover:text-foreground'}>
                    <NamedIcon name={raw ? 'chevron-down' : 'chevron-right'} size={14} /> Advanced: raw NBT
                </button>
                {raw && (
                    <>
                        <p className={'mcs:text-xs mcs:text-muted-foreground'}>Everything about the item, as the game stores it. Numbers keep their type: 1b, 2s, 3, 4L, 1.0f, 1.0d.</p>
                        <textarea
                            value={text}
                            spellCheck={false}
                            rows={12}
                            onChange={(event) => setText(event.target.value)}
                            className={'mcs:w-full mcs:rounded-md mcs:border mcs:border-input-border mcs:bg-sunken mcs:p-2 mcs:font-mono mcs:text-xs'}
                            aria-label={'Raw NBT of the item'}
                        />
                        {problem && <p className={'mcs:text-xs mcs:text-destructive'}>{problem}</p>}
                        <div className={'mcs:flex mcs:gap-2'}>
                            <Button
                                size={'small'}
                                isSecondary
                                onClick={() => {
                                    try {
                                        const parsed = parseCompound(text);
                                        if (!parsed.value.has('id')) throw new Error('The item needs an id.');
                                        lastWritten.current = stringify(parsed);
                                        onChange(parsed);
                                        setProblem(null);
                                    } catch (error) {
                                        setProblem(error instanceof Error ? error.message : String(error));
                                    }
                                }}
                            >
                                Apply
                            </Button>
                            <Button.Text
                                size={'small'}
                                onClick={() => {
                                    setText(stringify(item));
                                    setProblem(null);
                                }}
                            >
                                Reset
                            </Button.Text>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
