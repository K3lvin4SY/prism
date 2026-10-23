import type { CSSProperties } from 'react';
import { Tooltip } from '@pterodactyl/sdk';
import { armourPoints, type Item, type PlayerState } from '../../lib/player';
import { ItemIcon, ItemTooltip } from './ItemSlot';

/**
 * The in-game HUD, drawn with the game's own sprites at their real pixel positions and
 * scaled up: armour, hearts, food, the experience bar and the hotbar with its offhand slot.
 * The sprites load from a public asset mirror at runtime; they are not shipped with the extension.
 */

const SPRITES = 'https://assets.mcasset.cloud/1.21.11/assets/minecraft/textures/gui/sprites/hud';
const sprite = (name: string) => `${SPRITES}/${name}.png`;

const SCALE = 2;
const HOTBAR_WIDTH = 182;
const OFFHAND_WIDTH = 29;

function Sprite({ name, x, y, width, height, style }: { name: string; x: number; y: number; width: number; height: number; style?: CSSProperties }) {
    return <img src={sprite(name)} alt={''} draggable={false} className={'mcs-pixelated'} style={{ position: 'absolute', left: x, top: y, width, height, ...style }} />;
}

/** A row of ten icons filled two points each, like hearts, food and armour. */
function PointRow({ value, y, x, empty, full, half, rightToLeft = false }: { value: number; y: number; x: number; empty: string; full: string; half: string; rightToLeft?: boolean }) {
    return (
        <>
            {Array.from({ length: 10 }, (_, index) => {
                const left = rightToLeft ? x + HOTBAR_WIDTH - 9 - index * 8 : x + index * 8;
                const points = value - index * 2;

                return (
                    <span key={index}>
                        <Sprite name={empty} x={left} y={y} width={9} height={9} />
                        {points >= 2 && <Sprite name={full} x={left} y={y} width={9} height={9} />}
                        {points === 1 && <Sprite name={half} x={left} y={y} width={9} height={9} />}
                    </span>
                );
            })}
        </>
    );
}

function HudItem({ item, x, y, version }: { item: Item | undefined; x: number; y: number; version: string | null }) {
    if (!item) return null;

    const durability = item.maxDamage && item.damage > 0 ? 1 - item.damage / item.maxDamage : null;

    return (
        <Tooltip content={<ItemTooltip item={item} />} placement={'top'} delay={50} className={'mcs:bg-transparent! mcs:p-0! mcs:shadow-none! mcs:border-0!'}>
            <div style={{ position: 'absolute', left: x, top: y, width: 16, height: 16 }}>
                <ItemIcon item={item} version={version} />
                {durability !== null && (
                    <span style={{ position: 'absolute', left: 2, top: 13, width: 13, height: 2, background: '#000' }}>
                        <span style={{ display: 'block', height: 1, width: `${Math.max(0, durability) * 13}px`, background: `hsl(${Math.round(durability * 120)} 100% 50%)` }} />
                    </span>
                )}
                {item.count > 1 && (
                    <span className={'mcs-font'} style={{ position: 'absolute', right: -1, bottom: -2, fontSize: 8, lineHeight: 1, color: '#fff', textShadow: '1px 1px 0 #3f3f3f' }}>
                        {item.count}
                    </span>
                )}
            </div>
        </Tooltip>
    );
}

export default function Hud({ player, version }: { player: PlayerState; version: string | null }) {
    const armour = armourPoints(player.equipment);
    const heartRows = Math.max(1, Math.ceil(player.maxHealth / 20));
    const offhand = player.equipment.offhand;
    const hotbarX = offhand ? OFFHAND_WIDTH : 0;

    // Rows from the bottom up, in game pixels: hotbar, experience bar, hearts and food, armour.
    const height = 39 + (heartRows - 1) * 10 + (armour > 0 ? 10 : 0) + 1;
    const hotbarY = height - 22;
    const barY = height - 29;
    const heartsY = height - 39;
    const items = new Map(player.inventory.map((item) => [item.slot, item]));
    const level = String(player.xpLevel);

    return (
        <div
            role={'img'}
            aria-label={`Health ${player.health / 2} of ${player.maxHealth / 2}, food ${player.food} of 20, armour ${armour}, level ${player.xpLevel}`}
            style={{ zoom: SCALE, position: 'relative', width: hotbarX + HOTBAR_WIDTH, height, flexShrink: 0 }}
        >
            {armour > 0 && <PointRow value={armour} x={hotbarX} y={heartsY - (heartRows - 1) * 10 - 10} empty={'armor_empty'} full={'armor_full'} half={'armor_half'} />}

            {Array.from({ length: heartRows }, (_, row) => (
                <PointRow
                    key={row}
                    value={Math.max(0, Math.min(20, player.health - row * 20))}
                    x={hotbarX}
                    y={heartsY - row * 10}
                    empty={'heart/container'}
                    full={'heart/full'}
                    half={'heart/half'}
                />
            ))}
            <PointRow value={player.food} x={hotbarX} y={heartsY} empty={'food_empty'} full={'food_full'} half={'food_half'} rightToLeft />

            <Sprite name={'experience_bar_background'} x={hotbarX} y={barY} width={HOTBAR_WIDTH} height={5} />
            <div style={{ position: 'absolute', left: hotbarX, top: barY, width: Math.round(HOTBAR_WIDTH * Math.min(1, player.xpProgress)), height: 5, overflow: 'hidden' }}>
                <img src={sprite('experience_bar_progress')} alt={''} draggable={false} className={'mcs-pixelated'} style={{ width: HOTBAR_WIDTH, height: 5, maxWidth: 'none' }} />
            </div>
            {player.xpLevel > 0 && (
                <span
                    className={'mcs-font'}
                    style={{
                        position: 'absolute',
                        left: hotbarX + HOTBAR_WIDTH / 2,
                        top: barY - 8,
                        transform: 'translateX(-50%)',
                        fontSize: 8,
                        lineHeight: 1,
                        color: '#80ff20',
                        textShadow: '1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000',
                    }}
                >
                    {level}
                </span>
            )}

            {offhand && (
                <>
                    <Sprite name={'hotbar_offhand_left'} x={0} y={hotbarY - 1} width={29} height={24} />
                    <HudItem item={offhand} x={3} y={hotbarY + 3} version={version} />
                </>
            )}
            <Sprite name={'hotbar'} x={hotbarX} y={hotbarY} width={HOTBAR_WIDTH} height={22} />
            <Sprite name={'hotbar_selection'} x={hotbarX - 1 + player.selectedSlot * 20} y={hotbarY - 1} width={24} height={23} />
            {Array.from({ length: 9 }, (_, slot) => (
                <HudItem key={slot} item={items.get(slot)} x={hotbarX + 3 + slot * 20} y={hotbarY + 3} version={version} />
            ))}
        </div>
    );
}
