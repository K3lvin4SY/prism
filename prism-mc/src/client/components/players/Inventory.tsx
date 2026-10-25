import type { Item, PlayerState } from '../../lib/player';
import ItemSlot, { type EmptySlot } from './ItemSlot';

function slotMap(items: Item[]): Map<number, Item> {
    return new Map(items.map((item) => [item.slot, item]));
}

function Row({ items, from, version }: { items: Map<number, Item>; from: number; version: string | null }) {
    return (
        <div className={'mcs:flex'}>
            {Array.from({ length: 9 }, (_, index) => (
                <ItemSlot key={from + index} item={items.get(from + index)} version={version} size={'lg'} />
            ))}
        </div>
    );
}

const ARMOUR: [keyof PlayerState['equipment'], EmptySlot][] = [
    ['head', 'helmet'],
    ['chest', 'chestplate'],
    ['legs', 'leggings'],
    ['feet', 'boots'],
];

/** The survival inventory screen: armour beside the main grid. The hotbar and offhand are on the HUD below it. */
export function InventoryView({ player, version }: { player: PlayerState; version: string | null }) {
    const items = slotMap(player.inventory);

    return (
        <div className={'mcs-inventory mcs:inline-flex mcs:gap-3 mcs:p-3 mcs:max-w-full mcs:overflow-x-auto'}>
            <div className={'mcs:flex mcs:flex-col'}>
                {ARMOUR.map(([part, outline]) => (
                    <ItemSlot key={part} item={player.equipment[part]} version={version} empty={outline} size={'lg'} />
                ))}
            </div>
            <div className={'mcs:flex mcs:flex-col mcs:justify-center'}>
                <Row items={items} from={9} version={version} />
                <Row items={items} from={18} version={version} />
                <Row items={items} from={27} version={version} />
            </div>
        </div>
    );
}

export function EnderChestView({ player, version }: { player: PlayerState; version: string | null }) {
    const items = slotMap(player.enderChest);

    return (
        <div className={'mcs-inventory mcs:inline-flex mcs:flex-col mcs:gap-1 mcs:p-3 mcs:max-w-full mcs:overflow-x-auto'}>
            <span className={'mcs-font mcs:text-sm mcs:text-[#404040]'}>Ender Chest</span>
            <div>
                <Row items={items} from={0} version={version} />
                <Row items={items} from={9} version={version} />
                <Row items={items} from={18} version={version} />
            </div>
        </div>
    );
}

