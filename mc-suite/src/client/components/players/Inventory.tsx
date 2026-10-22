import type { Item, PlayerState } from '../../lib/player';
import ItemSlot from './ItemSlot';

function slotMap(items: Item[]): Map<number, Item> {
    return new Map(items.map((item) => [item.slot, item]));
}

function Row({ items, from, version, selected }: { items: Map<number, Item>; from: number; version: string | null; selected?: number }) {
    return (
        <div className={'mcs:flex'}>
            {Array.from({ length: 9 }, (_, index) => (
                <ItemSlot key={from + index} item={items.get(from + index)} version={version} selected={selected === from + index} />
            ))}
        </div>
    );
}

/** The survival inventory screen: armour and offhand, the main grid and the hotbar. */
export function InventoryView({ player, version }: { player: PlayerState; version: string | null }) {
    const items = slotMap(player.inventory);

    return (
        <div className={'mcs-inventory mcs:inline-flex mcs:gap-3 mcs:p-3 mcs:max-w-full mcs:overflow-x-auto'}>
            <div className={'mcs:flex mcs:flex-col'}>
                {(['head', 'chest', 'legs', 'feet'] as const).map((part) => (
                    <ItemSlot key={part} item={player.equipment[part]} version={version} />
                ))}
                <div className={'mcs:mt-auto'}>
                    <ItemSlot item={player.equipment.offhand} version={version} />
                </div>
            </div>
            <div className={'mcs:flex mcs:flex-col mcs:justify-between mcs:gap-2'}>
                <div>
                    <Row items={items} from={9} version={version} />
                    <Row items={items} from={18} version={version} />
                    <Row items={items} from={27} version={version} />
                </div>
                <Row items={items} from={0} version={version} selected={player.selectedSlot} />
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

