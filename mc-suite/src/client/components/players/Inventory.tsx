import { NamedIcon } from '@pterodactyl/sdk';
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

/** Hearts, hunger and the experience bar above the hotbar, as in game. */
export function StatusBars({ player, version }: { player: PlayerState; version: string | null }) {
    const hearts = Math.ceil(player.maxHealth / 2);
    const items = slotMap(player.inventory);

    return (
        <div className={'mcs:inline-flex mcs:flex-col mcs:gap-1 mcs:max-w-full mcs:overflow-x-auto'}>
            <div className={'mcs:flex mcs:justify-between mcs:gap-4'}>
                <div className={'mcs:flex mcs:flex-wrap mcs:max-w-[220px]'} title={`${(player.health / 2).toFixed(1)} of ${hearts} hearts`}>
                    {Array.from({ length: hearts }, (_, index) => {
                        const left = player.health - index * 2;

                        return (
                            <span key={index} className={'mcs:relative mcs:size-5'}>
                                <NamedIcon name={'heart'} size={20} className={'mcs:absolute mcs:text-[#3a0000]'} fill={'#3a0000'} />
                                {left > 0 && (
                                    <span className={'mcs:absolute mcs:inset-0 mcs:overflow-hidden'} style={{ width: left >= 2 ? '100%' : '50%' }}>
                                        <NamedIcon name={'heart'} size={20} className={'mcs:text-[#ff1d1d]'} fill={'#ff1d1d'} />
                                    </span>
                                )}
                            </span>
                        );
                    })}
                </div>
                <div className={'mcs:flex mcs:flex-row-reverse'} title={`Food ${player.food} of 20`}>
                    {Array.from({ length: 10 }, (_, index) => {
                        const left = player.food - index * 2;

                        return (
                            <span key={index} className={'mcs:relative mcs:size-5'}>
                                <NamedIcon name={'drumstick'} size={20} className={'mcs:absolute mcs:text-[#3b2410]'} />
                                {left > 0 && (
                                    <span className={'mcs:absolute mcs:inset-0 mcs:overflow-hidden mcs:flex mcs:justify-end'} style={{ width: '100%', clipPath: left >= 2 ? undefined : 'inset(0 0 0 50%)' }}>
                                        <NamedIcon name={'drumstick'} size={20} className={'mcs:text-[#c8813d]'} />
                                    </span>
                                )}
                            </span>
                        );
                    })}
                </div>
            </div>
            <div className={'mcs:relative mcs:mt-4 mcs:h-2.5 mcs:rounded-sm mcs:bg-[#1d1d1d] mcs:border mcs:border-black'} title={`Level ${player.xpLevel}, ${Math.round(player.xpProgress * 100)}% to the next`}>
                <div className={'mcs:h-full mcs:bg-[#80ff20]'} style={{ width: `${Math.min(100, player.xpProgress * 100)}%` }} />
                {player.xpLevel > 0 && (
                    <span className={'mcs-font mcs:absolute mcs:left-1/2 mcs:-top-[18px] mcs:-translate-x-1/2 mcs:text-[15px] mcs:leading-none mcs:text-[#80ff20]'} style={{ textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' }}>
                        {player.xpLevel}
                    </span>
                )}
            </div>
            <div className={'mcs:w-fit mcs:rounded mcs:border-2 mcs:border-[#1d1d1d] mcs:bg-[#1d1d1d]/60'}>
                <Row items={items} from={0} version={version} selected={player.selectedSlot} />
            </div>
        </div>
    );
}
