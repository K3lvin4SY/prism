import { useState } from 'react';
import { Tooltip, cn } from '@pterodactyl/sdk';
import { itemIconUrls } from '../../lib/items';
import { enchantmentLabel, prettyId, type Item } from '../../lib/player';

export function ItemIcon({ item, version }: { item: Item; version: string | null }) {
    const urls = itemIconUrls(item.id, version);
    const [attempt, setAttempt] = useState(0);

    if (attempt >= urls.length) {
        return (
            <span className={'mcs-font mcs:flex mcs:size-full mcs:items-center mcs:justify-center mcs:text-[10px] mcs:leading-none mcs:text-white mcs:text-center mcs:break-all mcs:p-0.5'}>
                {prettyId(item.id).slice(0, 6)}
            </span>
        );
    }

    return <img src={urls[attempt]} alt={''} loading={'lazy'} onError={() => setAttempt(attempt + 1)} className={'mcs-pixelated mcs:size-full mcs:object-contain'} />;
}

export function ItemTooltip({ item }: { item: Item }) {
    const enchanted = item.enchantments.length > 0 || item.stored.length > 0;

    return (
        <div className={'mcs-tooltip mcs-font mcs-text-shadow mcs:rounded mcs:px-2 mcs:py-1.5 mcs:text-[13px] mcs:leading-5 mcs:max-w-72'}>
            <div className={cn(item.name ? 'mcs:italic' : '', enchanted ? 'mcs:text-[#55FFFF]' : 'mcs:text-white')}>{item.name ?? prettyId(item.id)}</div>
            {[...item.enchantments, ...item.stored].map((enchantment) => (
                <div key={`${enchantment.id}-${enchantment.level}`} className={enchantment.id.includes('curse') ? 'mcs:text-[#FF5555]' : 'mcs:text-[#AAAAAA]'}>
                    {enchantmentLabel(enchantment)}
                </div>
            ))}
            {item.lore.map((line, index) => (
                <div key={index} className={'mcs:italic mcs:text-[#AA00AA]'}>
                    {line}
                </div>
            ))}
            {item.unbreakable && <div className={'mcs:text-[#5555FF]'}>Unbreakable</div>}
            {item.maxDamage !== null && !item.unbreakable && (
                <div className={'mcs:text-white'}>
                    Durability: {item.maxDamage - item.damage} / {item.maxDamage}
                </div>
            )}
            <div className={'mcs:text-[#555555]'}>{item.id}</div>
        </div>
    );
}

/** One inventory slot: the item, its count, its durability bar and a game-style tooltip. */
export default function ItemSlot({ item, version, selected, size = 'md' }: { item?: Item | null; version: string | null; selected?: boolean; size?: 'md' | 'lg' }) {
    const box = size === 'lg' ? 'mcs:size-12' : 'mcs:size-10';
    const durability = item && item.maxDamage && item.damage > 0 ? 1 - item.damage / item.maxDamage : null;

    const slot = (
        <div className={cn('mcs-slot mcs:relative mcs:shrink-0 mcs:p-[3px]', box, selected && 'mcs:outline-2 mcs:outline-white mcs:z-10')}>
            {item && (
                <>
                    <ItemIcon item={item} version={version} />
                    {(item.enchantments.length > 0 || item.stored.length > 0) && (
                        <span className={'mcs:pointer-events-none mcs:absolute mcs:inset-[3px] mcs:bg-[#c56bff]/25 mcs:mix-blend-screen'} />
                    )}
                    {item.count > 1 && (
                        <span className={'mcs-font mcs-text-shadow mcs:absolute mcs:bottom-0 mcs:right-0.5 mcs:text-[13px] mcs:leading-none mcs:text-white'}>{item.count}</span>
                    )}
                    {durability !== null && (
                        <span className={'mcs:absolute mcs:bottom-[3px] mcs:left-[5px] mcs:right-[5px] mcs:h-[3px] mcs:bg-black'}>
                            <span
                                className={'mcs:block mcs:h-[2px]'}
                                style={{ width: `${Math.max(0, durability) * 100}%`, backgroundColor: `hsl(${Math.round(durability * 120)} 100% 50%)` }}
                            />
                        </span>
                    )}
                </>
            )}
        </div>
    );

    return item ? (
        <Tooltip content={<ItemTooltip item={item} />} placement={'top'} delay={50} className={'mcs:bg-transparent! mcs:p-0! mcs:shadow-none! mcs:border-0!'}>
            {slot}
        </Tooltip>
    ) : (
        slot
    );
}
