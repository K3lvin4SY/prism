import { useState } from 'react';
import { Tooltip, cn } from '@pterodactyl/sdk';
import type { CharacterItem } from '../../api/players';
import { itemIcon, itemName, rarityColour } from '../../lib/items';

/** One inventory slot, drawn like Terraria's: a dark blue box with the item and its stack. */
export default function ItemSlot({ item, accent, className }: { item?: CharacterItem; accent?: 'armour' | 'vanity' | 'dye'; className?: string }) {
    const [broken, setBroken] = useState(false);

    const slot = (
        <div
            className={cn(
                'trs:relative trs:flex trs:size-11 trs:items-center trs:justify-center trs:rounded-md trs:border-2',
                accent === 'armour' ? 'trs:border-[#4b5fa8] trs:bg-[#3a4a8a]/80' : accent === 'vanity' ? 'trs:border-[#5a8a4b] trs:bg-[#3f6b37]/80' : accent === 'dye' ? 'trs:border-[#8a4b7a] trs:bg-[#6b375f]/80' : 'trs:border-[#3f4f9a] trs:bg-[#28336b]/80',
                item?.favorited && 'trs:ring-2 trs:ring-yellow-400/80',
                className
            )}
        >
            {item &&
                (broken || !itemIcon(item.id) ? (
                    <span className={'trs:px-0.5 trs:text-center trs:text-[9px] trs:leading-tight trs:text-white/90'}>{itemName(item.id)}</span>
                ) : (
                    <img src={itemIcon(item.id)} alt={itemName(item.id)} className={'trs-pixelated trs:max-h-8 trs:max-w-8 trs:object-contain'} loading={'lazy'} onError={() => setBroken(true)} />
                ))}
            {item && item.stack > 1 && <span className={'trs:absolute trs:bottom-0 trs:right-1 trs:text-[11px] trs:font-semibold trs:text-white trs:[text-shadow:1px_1px_0_#000]'}>{item.stack}</span>}
        </div>
    );

    if (!item) return slot;

    return (
        <Tooltip
            content={
                <span>
                    <span style={{ color: rarityColour(item.id) }} className={'trs:font-semibold'}>
                        {itemName(item.id, item.prefix)}
                    </span>
                    {item.stack > 1 && <span className={'trs:text-muted-foreground'}> × {item.stack}</span>}
                    <span className={'trs:block trs:text-xs trs:text-muted-foreground'}>Item {item.id}</span>
                </span>
            }
        >
            {slot}
        </Tooltip>
    );
}
