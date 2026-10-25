import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Dialog, Input, Select, Spinner, Switch, cn, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { NamedIcon } from '../../icons';
import { playerAction, type PlayerAction, type PlayerSummary, type TeleportTarget } from '../../api/players';
import type { PlayerState } from '../../lib/player';
import { ItemIcon } from './ItemSlot';

/** Each button shows a picture from the game: an item, or the heart from the HUD. */
type Picture = { item: string } | { sprite: string };

const GAME_MODES: { value: string; label: string; picture: Picture }[] = [
    { value: 'survival', label: 'Survival', picture: { item: 'minecraft:diamond_sword' } },
    { value: 'creative', label: 'Creative', picture: { item: 'minecraft:crafting_table' } },
    { value: 'adventure', label: 'Adventure', picture: { item: 'minecraft:map' } },
    { value: 'spectator', label: 'Spectator', picture: { item: 'minecraft:spyglass' } },
];

const ACTIONS: { action: 'heal' | 'feed' | 'starve' | 'kill'; label: string; picture: Picture; danger?: boolean }[] = [
    { action: 'heal', label: 'Heal', picture: { sprite: 'https://assets.mcasset.cloud/1.21.11/assets/minecraft/textures/gui/sprites/hud/heart/full.png' } },
    { action: 'feed', label: 'Feed', picture: { item: 'minecraft:cooked_beef' } },
    { action: 'starve', label: 'Starve', picture: { item: 'minecraft:rotten_flesh' } },
    { action: 'kill', label: 'Kill', picture: { item: 'minecraft:skeleton_skull' }, danger: true },
];

const DIMENSIONS = [
    { value: 'overworld', label: 'Overworld' },
    { value: 'the_nether', label: 'Nether' },
    { value: 'the_end', label: 'End' },
] as const;

type Dimension = (typeof DIMENSIONS)[number]['value'];

const ACCESS: { key: Access; label: string; description: string; icon: string }[] = [
    { key: 'op', label: 'Operator', description: 'Can use every command.', icon: 'key' },
    { key: 'whitelisted', label: 'Whitelisted', description: 'Can join while the whitelist is on.', icon: 'list-checks' },
    { key: 'banned', label: 'Banned', description: 'Cannot join; the reason below is shown.', icon: 'ban' },
];

function GamePicture({ picture, className }: { picture: Picture; className?: string }) {
    return (
        <span className={cn('mcs:inline-flex mcs:shrink-0 mcs:items-center mcs:justify-center', className ?? 'mcs:size-4')} aria-hidden>
            {'sprite' in picture ? (
                <img src={picture.sprite} alt={''} draggable={false} className={'mcs-pixelated mcs:size-full mcs:object-contain'} />
            ) : (
                <ItemIcon item={{ id: picture.item, count: 1, slot: -1, name: null, lore: [], enchantments: [], stored: [], damage: 0, maxDamage: null, unbreakable: false }} version={null} />
            )}
        </span>
    );
}

function Section({ icon, title, aside, children }: { icon: string; title: string; aside?: ReactNode; children: ReactNode }) {
    return (
        <section className={'mcs:flex mcs:flex-col mcs:gap-2.5 mcs:p-4'}>
            <header className={'mcs:flex mcs:items-center mcs:gap-2 mcs:text-xs mcs:font-semibold mcs:tracking-wide mcs:text-muted-foreground mcs:uppercase'}>
                <NamedIcon name={icon} size={14} />
                <span className={'mcs:flex-1'}>{title}</span>
                {aside}
            </header>
            {children}
        </section>
    );
}

/** A square button with a game picture over its label. */
function Tile({ picture, label, active, busy, disabled, danger, title, onClick }: { picture: Picture; label: string; active?: boolean; busy?: boolean; disabled?: boolean; danger?: boolean; title?: string; onClick: () => void }) {
    return (
        <button
            type={'button'}
            aria-pressed={active}
            disabled={disabled || busy}
            title={title}
            onClick={onClick}
            className={cn(
                'mcs:relative mcs:flex mcs:cursor-pointer mcs:flex-col mcs:items-center mcs:gap-1.5 mcs:rounded-lg mcs:border mcs:px-1 mcs:pt-2.5 mcs:pb-2 mcs:text-xs mcs:font-medium mcs:transition-colors mcs:disabled:cursor-not-allowed mcs:disabled:opacity-45',
                active ? 'mcs:border-primary mcs:bg-primary/12 mcs:text-foreground' : 'mcs:border-border mcs:bg-muted/30 mcs:text-muted-foreground mcs:enabled:hover:bg-muted mcs:enabled:hover:text-foreground',
                danger && !active && 'mcs:enabled:hover:border-destructive/60 mcs:enabled:hover:bg-destructive/10 mcs:enabled:hover:text-destructive'
            )}
        >
            {busy ? (
                <span className={'mcs:flex mcs:size-6 mcs:items-center mcs:justify-center'}>
                    <Spinner size={'small'} />
                </span>
            ) : (
                <GamePicture picture={picture} className={'mcs:size-6'} />
            )}
            {label}
        </button>
    );
}

type Access = 'op' | 'whitelisted' | 'banned';

interface Props {
    identifier: string;
    player: PlayerSummary;
    state: PlayerState | null;
    running: boolean;
    /** Names of the other players online, to teleport to. */
    others: string[];
    /** Reloads the player data after the server has saved. */
    onDone: () => void;
    /** Clears the saved inventory in the player file, for when the player is offline (Java only). */
    onClearOffline?: () => Promise<void>;
}

/**
 * Game mode, teleporting, effects, experience, messages and access for one player. Every action
 * runs on its own: its button shows a spinner until the server has it, while everything else
 * stays usable. Switches and game mode change at once and only move back if the action fails.
 */
export default function ControlPanel({ identifier, player, state, running, others, onDone, onClearOffline }: Props) {
    const [pending, setPending] = useState<string[]>([]);
    const [gameMode, setGameMode] = useState<string | null>(null);
    const [access, setAccess] = useState<Partial<Record<Access, boolean>>>({});
    const [levels, setLevels] = useState(String(state?.xpLevel ?? 0));
    const [reason, setReason] = useState('');
    const [message, setMessage] = useState('');
    const [confirmClear, setConfirmClear] = useState(false);
    const [teleportTo, setTeleportTo] = useState<'player' | 'place'>('player');
    const [target, setTarget] = useState('');
    const [place, setPlace] = useState<{ x: string; y: string; z: string; dimension: Dimension }>({ x: '', y: '', z: '', dimension: 'overworld' });
    const refreshTimer = useRef<number | null>(null);
    const online = player.online;

    useEffect(() => setLevels(String(state?.xpLevel ?? 0)), [state?.xpLevel]);

    // Fresh data from the server replaces the optimistic values.
    useEffect(() => setGameMode(null), [state?.gameMode]);
    useEffect(() => setAccess({}), [player.op, player.whitelisted, player.banned]);

    // The player picked to teleport to has to still be online.
    useEffect(() => {
        if (target && !others.includes(target)) setTarget('');
    }, [others, target]);

    useEffect(
        () => () => {
            if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
        },
        []
    );

    /** One save and reload after a burst of actions, not one per click. */
    const scheduleRefresh = (save: boolean) => {
        if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
        refreshTimer.current = window.setTimeout(async () => {
            refreshTimer.current = null;
            if (save) {
                await playerAction(identifier, 'save').catch(() => undefined);
                await new Promise((resolve) => window.setTimeout(resolve, 1200));
            }
            onDone();
        }, 600);
    };

    const run = async (key: string, action: PlayerAction, input: { value?: string | number | TeleportTarget; reason?: string } = {}, success?: string, undo?: () => void) => {
        setPending((current) => [...current, key]);
        try {
            const applied = await playerAction(identifier, action, { name: player.name, uuid: player.uuid, ...input });
            if (success) toast.success(applied === 'file' ? `${success} It applies when the server starts.` : success);
            scheduleRefresh(applied === 'command' && online);
        } catch (error) {
            undo?.();
            toast.error(httpErrorToHuman(error));
        } finally {
            setPending((current) => {
                const index = current.indexOf(key);

                return index === -1 ? current : [...current.slice(0, index), ...current.slice(index + 1)];
            });
        }
    };

    const busy = (key: string) => pending.includes(key);
    const currentMode = gameMode ?? state?.gameMode;
    const accessValue = (key: Access): boolean =>
        access[key] ?? (key === 'op' ? player.op !== null : key === 'whitelisted' ? player.whitelisted : player.banned !== null);

    const toggleAccess = (key: Access, checked: boolean) => {
        const previous = accessValue(key);
        setAccess((current) => ({ ...current, [key]: checked }));
        const undo = () => setAccess((current) => ({ ...current, [key]: previous }));
        const name = player.name ?? 'The player';

        if (key === 'op') run(key, checked ? 'op' : 'deop', {}, checked ? `${name} is now an operator.` : `${name} is no longer an operator.`, undo);
        if (key === 'whitelisted') run(key, checked ? 'whitelist-add' : 'whitelist-remove', {}, checked ? `${name} is whitelisted.` : `${name} was removed from the whitelist.`, undo);
        if (key === 'banned') run(key, checked ? 'ban' : 'pardon', { reason }, checked ? `${name} is banned.` : `${name} is unbanned.`, undo);
    };

    const setMode = (mode: string) => {
        const previous = currentMode ?? null;
        setGameMode(mode);
        run('gamemode', 'gamemode', { value: mode }, undefined, () => setGameMode(previous));
    };

    // The last saved place, to start from or go back to.
    const fillHere = () => {
        if (!state?.position) return;
        const [x, y, z] = state.position.map((value) => String(Math.floor(value)));
        const dimension = state.dimension.replace(/^minecraft:/, '');
        setPlace({ x, y, z, dimension: DIMENSIONS.some((entry) => entry.value === dimension) ? (dimension as Dimension) : 'overworld' });
    };

    const number = (value: string) => value.trim() !== '' && Number.isFinite(Number(value));
    const placeReady = number(place.x) && number(place.y) && number(place.z);
    const canTeleport = online && (teleportTo === 'player' ? target !== '' : placeReady);

    const teleport = () => {
        if (!canTeleport) return;
        const destination: TeleportTarget = teleportTo === 'player' ? { player: target } : { x: Number(place.x), y: Number(place.y), z: Number(place.z), dimension: place.dimension };
        const where = teleportTo === 'player' ? target : `${place.x}, ${place.y}, ${place.z} in the ${DIMENSIONS.find((entry) => entry.value === place.dimension)?.label}`;
        run('teleport', 'teleport', { value: destination }, `${player.name} was teleported to ${where}.`);
    };

    const offline = !online ? 'The player has to be online.' : undefined;
    const switchClass = (active: boolean) =>
        cn('prism-switch-item mcs:inline-flex mcs:flex-1 mcs:cursor-pointer mcs:items-center mcs:justify-center mcs:gap-1.5 mcs:rounded mcs:px-2 mcs:py-1 mcs:text-xs', active ? 'mcs:bg-card mcs:font-semibold mcs:text-foreground mcs:shadow-sm' : 'mcs:text-muted-foreground mcs:hover:text-foreground');

    return (
        <div className={'mcs:overflow-hidden mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card'}>
            <div className={'mcs:flex mcs:items-center mcs:gap-3 mcs:border-b mcs:border-border mcs:bg-muted/30 mcs:px-4 mcs:py-3'}>
                <h3 className={'mcs:flex-1 mcs:font-semibold'}>Control</h3>
                <span className={cn('mcs:inline-flex mcs:items-center mcs:gap-1.5 mcs:rounded-full mcs:px-2 mcs:py-0.5 mcs:text-xs mcs:font-medium', online ? 'mcs:bg-success/15 mcs:text-success' : 'mcs:bg-muted mcs:text-muted-foreground')}>
                    <span className={cn('mcs:size-1.5 mcs:rounded-full', online ? 'mcs:bg-success' : 'mcs:bg-muted-foreground')} />
                    {online ? 'Online' : 'Offline'}
                </span>
            </div>

            {!online && (
                <p className={'mcs:flex mcs:gap-2 mcs:border-b mcs:border-border mcs:px-4 mcs:py-2.5 mcs:text-xs mcs:text-muted-foreground'}>
                    <NamedIcon name={'info'} size={14} className={'mcs:mt-px mcs:shrink-0'} />
                    {player.name} is offline. The in-game actions wait until they are online; access works any time.
                </p>
            )}

            <div className={'mcs:flex mcs:flex-col mcs:divide-y mcs:divide-border'}>
                <Section icon={'gamepad-2'} title={'Game mode'}>
                    <div className={'mcs:grid mcs:grid-cols-4 mcs:gap-1.5'}>
                        {GAME_MODES.map((mode) => (
                            <Tile
                                key={mode.value}
                                picture={mode.picture}
                                label={mode.label}
                                active={currentMode === mode.value}
                                busy={busy('gamemode') && currentMode === mode.value}
                                disabled={!online}
                                title={offline}
                                onClick={() => currentMode !== mode.value && setMode(mode.value)}
                            />
                        ))}
                    </div>
                </Section>

                <Section
                    icon={'locate-fixed'}
                    title={'Teleport'}
                    aside={
                        <div className={'prism-switch mcs:flex mcs:w-40 mcs:rounded-md mcs:bg-muted/60 mcs:p-0.5 mcs:normal-case mcs:tracking-normal'} role={'group'} aria-label={'Teleport to'}>
                            <button type={'button'} aria-pressed={teleportTo === 'player'} onClick={() => setTeleportTo('player')} className={switchClass(teleportTo === 'player')}>
                                <NamedIcon name={'users'} size={12} /> Player
                            </button>
                            <button type={'button'} aria-pressed={teleportTo === 'place'} onClick={() => setTeleportTo('place')} className={switchClass(teleportTo === 'place')}>
                                <NamedIcon name={'map-pin'} size={12} /> Place
                            </button>
                        </div>
                    }
                >
                    {teleportTo === 'player' ? (
                        others.length === 0 ? (
                            <p className={'mcs:rounded-md mcs:border mcs:border-dashed mcs:border-border mcs:px-3 mcs:py-2.5 mcs:text-xs mcs:text-muted-foreground'}>No one else is online to teleport to.</p>
                        ) : (
                            <Select value={target} placeholder={'Pick a player'} disabled={!online} onChange={(value) => setTarget(String(value))} options={others.map((name) => ({ value: name, label: name }))} />
                        )
                    ) : (
                        <div className={'mcs:flex mcs:flex-col mcs:gap-2'}>
                            <div className={'mcs:grid mcs:grid-cols-3 mcs:gap-1.5'}>
                                {(['x', 'y', 'z'] as const).map((axis) => (
                                    <label key={axis} className={'mcs:relative'}>
                                        <span className={'mcs:pointer-events-none mcs:absolute mcs:top-1/2 mcs:left-2.5 mcs:-translate-y-1/2 mcs:font-mono mcs:text-xs mcs:text-muted-foreground mcs:uppercase'}>{axis}</span>
                                        <Input
                                            value={place[axis]}
                                            inputMode={'decimal'}
                                            disabled={!online}
                                            aria-label={`${axis.toUpperCase()} coordinate`}
                                            onChange={(event) => setPlace({ ...place, [axis]: event.target.value.replace(/[^\d.-]/g, '') })}
                                            onKeyDown={(event) => event.key === 'Enter' && teleport()}
                                            className={'mcs:w-full mcs:pl-6 mcs:font-mono'}
                                        />
                                    </label>
                                ))}
                            </div>
                            <div className={'mcs:flex mcs:gap-1.5'}>
                                <div className={'mcs:min-w-0 mcs:flex-1'}>
                                    <Select value={place.dimension} disabled={!online} onChange={(value) => setPlace({ ...place, dimension: value as Dimension })} options={DIMENSIONS.map((entry) => ({ value: entry.value, label: entry.label }))} />
                                </div>
                                <Button.Text size={'small'} disabled={!state?.position} onClick={fillHere} title={'Fill in where the player was at the last save'}>
                                    <NamedIcon name={'map-pin'} size={14} /> Here
                                </Button.Text>
                            </div>
                        </div>
                    )}
                    <Button size={'small'} disabled={!canTeleport} isLoading={busy('teleport')} title={offline} onClick={teleport}>
                        <NamedIcon name={'locate-fixed'} size={14} /> Teleport {player.name}
                    </Button>
                </Section>

                <Section icon={'heart'} title={'Effects'}>
                    <div className={'mcs:grid mcs:grid-cols-4 mcs:gap-1.5'}>
                        {ACTIONS.map(({ action, label, picture, danger }) => (
                            <Tile key={action} picture={picture} label={label} danger={danger} busy={busy(action)} disabled={!online} title={offline} onClick={() => run(action, action)} />
                        ))}
                    </div>
                </Section>

                <Section icon={'sparkles'} title={'Experience'} aside={state && <span className={'mcs:font-mono mcs:normal-case mcs:tracking-normal mcs:text-[#80ff20]'}>Level {state.xpLevel}</span>}>
                    {state && (
                        <div className={'mcs:h-1.5 mcs:overflow-hidden mcs:rounded-full mcs:bg-muted'} title={`${Math.round(state.xpProgress * 100)}% to the next level`}>
                            <div className={'mcs:h-full mcs:rounded-full mcs:bg-[#80ff20]'} style={{ width: `${Math.min(100, state.xpProgress * 100)}%` }} />
                        </div>
                    )}
                    <div className={'mcs:flex mcs:gap-1.5'}>
                        <Button size={'small'} isSecondary disabled={!online} isLoading={busy('xp-down')} onClick={() => run('xp-down', 'xp-add', { value: -1 })} aria-label={'One level less'}>
                            <NamedIcon name={'minus'} size={14} />
                        </Button>
                        <Input value={levels} inputMode={'numeric'} aria-label={'Levels'} onChange={(event) => setLevels(event.target.value.replace(/[^\d]/g, ''))} className={'mcs:min-w-0 mcs:flex-1 mcs:text-center mcs:font-mono'} disabled={!online} />
                        <Button size={'small'} isSecondary disabled={!online} isLoading={busy('xp-up')} onClick={() => run('xp-up', 'xp-add', { value: 1 })} aria-label={'One level more'}>
                            <NamedIcon name={'plus'} size={14} />
                        </Button>
                        <Button size={'small'} disabled={!online || levels === ''} isLoading={busy('xp-set')} onClick={() => run('xp-set', 'xp-set', { value: Number(levels) })}>
                            Set
                        </Button>
                    </div>
                </Section>

                <Section icon={'message-circle'} title={'Message'}>
                    <form
                        className={'mcs:flex mcs:gap-1.5'}
                        onSubmit={(event) => {
                            event.preventDefault();
                            const text = message.trim();
                            if (!text) return;
                            setMessage('');
                            run('message', 'message', { value: text }, 'Message sent.', () => setMessage(text));
                        }}
                    >
                        <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={'Private message to the player'} maxLength={256} disabled={!online} className={'mcs:min-w-0 mcs:flex-1'} />
                        <Button type={'submit'} size={'small'} disabled={!online || !message.trim()} isLoading={busy('message')} aria-label={'Send'}>
                            <NamedIcon name={'send'} size={14} />
                        </Button>
                    </form>
                </Section>

                <Section icon={'shield'} title={'Moderation'}>
                    <div className={'mcs:flex mcs:flex-col mcs:divide-y mcs:divide-border mcs:rounded-md mcs:border mcs:border-border'}>
                        {ACCESS.map(({ key, label, description, icon }) => (
                            <div key={key} className={'mcs:flex mcs:items-center mcs:gap-3 mcs:px-3 mcs:py-2.5'}>
                                <span className={cn('mcs:flex mcs:size-8 mcs:shrink-0 mcs:items-center mcs:justify-center mcs:rounded-md', accessValue(key) ? (key === 'banned' ? 'mcs:bg-destructive/15 mcs:text-destructive' : 'mcs:bg-primary/15 mcs:text-primary') : 'mcs:bg-muted mcs:text-muted-foreground')}>
                                    <NamedIcon name={icon} size={15} />
                                </span>
                                <label htmlFor={`mcs-access-${key}`} className={'mcs:min-w-0 mcs:flex-1 mcs:cursor-pointer'}>
                                    <span className={'mcs:block mcs:text-sm mcs:font-medium'}>{label}</span>
                                    <span className={'mcs:block mcs:text-xs mcs:text-muted-foreground'}>{description}</span>
                                </label>
                                {busy(key) ? <Spinner size={'small'} /> : <Switch id={`mcs-access-${key}`} checked={accessValue(key)} onChange={(checked) => toggleAccess(key, checked)} />}
                            </div>
                        ))}
                    </div>
                    <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={'Reason, used for kicks and bans'} maxLength={200} className={'mcs:w-full'} />
                    <div className={'mcs:grid mcs:grid-cols-[2fr_3fr] mcs:gap-1.5'}>
                        <Button size={'small'} isSecondary disabled={!online} title={offline} isLoading={busy('kick')} onClick={() => run('kick', 'kick', { reason }, `${player.name} was kicked.`)}>
                            <GamePicture picture={{ item: 'minecraft:leather_boots' }} /> Kick
                        </Button>
                        <Button.Danger size={'small'} isSecondary disabled={!online && !onClearOffline} title={!online && !onClearOffline ? offline : undefined} isLoading={busy('clear')} onClick={() => setConfirmClear(true)}>
                            <GamePicture picture={{ item: 'minecraft:barrier' }} /> Clear inventory
                        </Button.Danger>
                    </div>
                    {!running && <p className={'mcs:text-xs mcs:text-muted-foreground'}>The server is offline: operator, whitelist and ban changes are written to its files.</p>}
                </Section>
            </div>

            <Dialog.Confirm
                open={confirmClear}
                onClose={() => setConfirmClear(false)}
                title={'Clear inventory'}
                confirm={'Clear inventory'}
                onConfirmed={async () => {
                    setConfirmClear(false);
                    if (online || !onClearOffline) return run('clear', 'clear', {}, `${player.name}'s inventory was cleared.`);
                    setPending((current) => [...current, 'clear']);
                    try {
                        await onClearOffline();
                        toast.success(`${player.name}'s inventory was cleared in their player file.`);
                    } catch (error) {
                        toast.error(httpErrorToHuman(error));
                    } finally {
                        setPending((current) => current.filter((key) => key !== 'clear'));
                    }
                }}
            >
                {online
                    ? `Clear the whole inventory of ${player.name}, armour and offhand included? This cannot be undone.`
                    : `${player.name} is offline, so every item they carry and wear is removed from their player file. The ender chest stays, and the previous file is kept as a backup.`}
            </Dialog.Confirm>
        </div>
    );
}
