import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Dialog, DropdownMenu, DropdownMenuItem, Input, Select, Spinner, cn, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { NamedIcon } from '../../icons';
import { playerAction, type PlayerAction, type PlayerSummary, type TeleportTarget } from '../../api/players';
import type { PlayerState } from '../../lib/player';
import { ItemIcon } from './ItemSlot';

/** Each button shows a picture from the game: an item, or the heart from the HUD. */
type Picture = { item: string } | { sprite: string };

const HEART = 'https://assets.mcasset.cloud/1.21.11/assets/minecraft/textures/gui/sprites/hud/heart/full.png';

const GAME_MODES: { value: string; label: string; picture: Picture }[] = [
    {
        value: 'survival',
        label: 'Survival',
        picture: { item: 'minecraft:diamond_sword' },
    },
    {
        value: 'creative',
        label: 'Creative',
        picture: { item: 'minecraft:crafting_table' },
    },
    {
        value: 'adventure',
        label: 'Adventure',
        picture: { item: 'minecraft:map' },
    },
    {
        value: 'spectator',
        label: 'Spectator',
        picture: { item: 'minecraft:spyglass' },
    },
];

const DIMENSIONS = [
    { value: 'overworld', label: 'Overworld' },
    { value: 'the_nether', label: 'Nether' },
    { value: 'the_end', label: 'End' },
] as const;

type Dimension = (typeof DIMENSIONS)[number]['value'];

type Access = 'op' | 'whitelisted' | 'banned';

const ACCESS: { key: 'op' | 'whitelisted'; label: string; description: string; icon: string }[] = [
    { key: 'op', label: 'Operator', description: 'Can use every command.', icon: 'key' },
    { key: 'whitelisted', label: 'Whitelisted', description: 'Can join while the whitelist is on.', icon: 'list-checks' },
];

type DialogName = 'teleport' | 'message' | 'kick' | 'ban' | 'experience' | 'kill' | 'clear';

export function GamePicture({ picture, className }: { picture: Picture; className?: string }) {
    return (
        <span className={cn('mcs:inline-flex mcs:shrink-0 mcs:items-center mcs:justify-center', className ?? 'mcs:size-4')} aria-hidden>
            {'sprite' in picture ? (
                <img src={picture.sprite} alt={''} draggable={false} className={'mcs-pixelated mcs:size-full mcs:object-contain'} />
            ) : (
                <ItemIcon
                    item={{
                        id: picture.item,
                        count: 1,
                        slot: -1,
                        name: null,
                        lore: [],
                        enchantments: [],
                        stored: [],
                        damage: 0,
                        maxDamage: null,
                        unbreakable: false,
                    }}
                    version={null}
                />
            )}
        </span>
    );
}

export interface ControlProps {
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
 * The actions on one player, shared by the game mode bar, the action buttons and the menu.
 * Every action runs on its own: its button shows a spinner until the server has it, while
 * everything else stays usable. Game mode and access change at once and only move back if
 * the action fails.
 */
export function useControls({ identifier, player, state, onDone }: ControlProps) {
    const [pending, setPending] = useState<string[]>([]);
    const [gameMode, setGameMode] = useState<string | null>(null);
    const [access, setAccess] = useState<Partial<Record<Access, boolean>>>({});
    const [dialog, setDialog] = useState<DialogName | null>(null);
    const refreshTimer = useRef<number | null>(null);

    // Fresh data from the server replaces the optimistic values.
    useEffect(() => setGameMode(null), [state?.gameMode]);
    useEffect(() => setAccess({}), [player.op, player.whitelisted, player.banned]);

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

    const track = async (key: string, work: () => Promise<void>) => {
        setPending((current) => [...current, key]);
        try {
            await work();
        } finally {
            setPending((current) => {
                const index = current.indexOf(key);

                return index === -1 ? current : [...current.slice(0, index), ...current.slice(index + 1)];
            });
        }
    };

    const run = (key: string, action: PlayerAction, input: { value?: string | number | TeleportTarget; reason?: string } = {}, success?: string, undo?: () => void) =>
        track(key, async () => {
            try {
                const applied = await playerAction(identifier, action, {
                    name: player.name,
                    uuid: player.uuid,
                    ...input,
                });
                if (success) toast.success(applied === 'file' ? `${success} It applies when the server starts.` : success);
                scheduleRefresh(applied === 'command' && player.online);
            } catch (error) {
                undo?.();
                toast.error(httpErrorToHuman(error));
            }
        });

    const accessValue = (key: Access): boolean => access[key] ?? (key === 'op' ? player.op !== null : key === 'whitelisted' ? player.whitelisted : player.banned !== null);

    const setAccessTo = (key: Access, checked: boolean, reason = '') => {
        const previous = accessValue(key);
        setAccess((current) => ({ ...current, [key]: checked }));
        const undo = () => setAccess((current) => ({ ...current, [key]: previous }));
        const name = player.name ?? 'The player';

        if (key === 'op') return run(key, checked ? 'op' : 'deop', {}, checked ? `${name} is now an operator.` : `${name} is no longer an operator.`, undo);
        if (key === 'whitelisted') return run(key, checked ? 'whitelist-add' : 'whitelist-remove', {}, checked ? `${name} is whitelisted.` : `${name} was removed from the whitelist.`, undo);

        return run(key, checked ? 'ban' : 'pardon', { reason }, checked ? `${name} is banned.` : `${name} is unbanned.`, undo);
    };

    const currentMode = gameMode ?? state?.gameMode;
    const setMode = (mode: string) => {
        if (mode === currentMode) return;
        const previous = currentMode ?? null;
        setGameMode(mode);
        run('gamemode', 'gamemode', { value: mode }, undefined, () => setGameMode(previous));
    };

    return {
        run,
        track,
        busy: (key: string) => pending.includes(key),
        accessValue,
        setAccessTo,
        currentMode,
        setMode,
        dialog,
        setDialog,
    };
}

export type Controls = ReturnType<typeof useControls>;

const offlineHint = (player: PlayerSummary) => (player.online ? undefined : `${player.name ?? 'The player'} has to be online.`);

/** The four game modes as one segmented switch. */
export function GameModeBar({ controls, player, disabled }: { controls: Controls; player: PlayerSummary; disabled?: boolean }) {
    return (
        <div className={'prism-switch mcs:grid mcs:grid-cols-2 mcs:gap-1 mcs:rounded-lg mcs:border mcs:border-border mcs:bg-muted/30 mcs:p-1 mcs:@md:grid-cols-4'} role={'radiogroup'} aria-label={'Game mode'}>
            {GAME_MODES.map((mode) => {
                const active = controls.currentMode === mode.value;

                return (
                    <button
                        key={mode.value}
                        type={'button'}
                        role={'radio'}
                        aria-checked={active}
                        disabled={disabled || !player.online}
                        title={offlineHint(player)}
                        onClick={() => controls.setMode(mode.value)}
                        className={cn(
                            'prism-switch-item mcs:flex mcs:h-9 mcs:cursor-pointer mcs:items-center mcs:justify-center mcs:gap-2 mcs:rounded-md mcs:px-2 mcs:text-sm mcs:font-medium mcs:transition-colors mcs:disabled:cursor-not-allowed',
                            active ? 'mcs:bg-primary mcs:text-primary-foreground mcs:shadow-sm' : 'mcs:text-muted-foreground mcs:enabled:hover:bg-muted mcs:enabled:hover:text-foreground mcs:disabled:opacity-50'
                        )}
                    >
                        {controls.busy('gamemode') && active ? <Spinner size={'small'} /> : <GamePicture picture={mode.picture} className={'mcs:size-5'} />}
                        {mode.label}
                    </button>
                );
            })}
        </div>
    );
}

function ActionButton({ icon, picture, label, tone, busy, disabled, title, onClick }: { icon?: string; picture?: Picture; label: string; tone?: 'warning' | 'danger'; busy?: boolean; disabled?: boolean; title?: string; onClick: () => void }) {
    return (
        <button
            type={'button'}
            disabled={disabled || busy}
            title={title}
            onClick={onClick}
            className={cn(
                'mcs:flex mcs:h-10 mcs:min-w-0 mcs:cursor-pointer mcs:items-center mcs:justify-center mcs:gap-2 mcs:rounded-lg mcs:border mcs:px-2 mcs:text-sm mcs:font-semibold mcs:transition-colors mcs:disabled:cursor-not-allowed mcs:disabled:opacity-45',
                tone === 'danger'
                    ? 'mcs:border-destructive/40 mcs:bg-destructive/10 mcs:text-destructive mcs:enabled:hover:bg-destructive/20'
                    : tone === 'warning'
                      ? 'mcs:border-warning/40 mcs:bg-warning/10 mcs:text-warning mcs:enabled:hover:bg-warning/20'
                      : 'mcs:border-border mcs:bg-muted/30 mcs:text-foreground mcs:enabled:hover:bg-muted'
            )}
        >
            {busy ? <Spinner size={'small'} /> : picture ? <GamePicture picture={picture} /> : icon && <NamedIcon name={icon} size={16} className={'mcs:shrink-0'} />}
            <span className={'mcs:truncate'}>{label}</span>
        </button>
    );
}

/** Heal, feed, teleport, message, kick and ban: the actions used most, each one click or one dialog away. */
export function ActionBar({ controls, ...props }: ControlProps & { controls: Controls }) {
    const { player } = props;
    const { busy, run, setDialog } = controls;
    const offline = offlineHint(player);
    const banned = controls.accessValue('banned');

    return (
        <>
            <div className={'mcs:grid mcs:grid-cols-2 mcs:gap-2 mcs:@sm:grid-cols-3 mcs:@xl:grid-cols-6'}>
                <ActionButton picture={{ sprite: HEART }} label={'Heal'} busy={busy('heal')} disabled={!player.online} title={offline} onClick={() => run('heal', 'heal', {}, `${player.name} was healed.`)} />
                <ActionButton picture={{ item: 'minecraft:cooked_beef' }} label={'Feed'} busy={busy('feed')} disabled={!player.online} title={offline} onClick={() => run('feed', 'feed', {}, `${player.name} was fed.`)} />
                <ActionButton icon={'locate-fixed'} label={'Teleport'} busy={busy('teleport')} disabled={!player.online} title={offline} onClick={() => setDialog('teleport')} />
                <ActionButton icon={'message-circle'} label={'Message'} busy={busy('message')} disabled={!player.online} title={offline} onClick={() => setDialog('message')} />
                <ActionButton picture={{ item: 'minecraft:leather_boots' }} label={'Kick'} tone={'warning'} busy={busy('kick')} disabled={!player.online} title={offline} onClick={() => setDialog('kick')} />
                {banned ? (
                    <ActionButton icon={'ban'} label={'Unban'} tone={'danger'} busy={busy('banned')} onClick={() => controls.setAccessTo('banned', false)} />
                ) : (
                    <ActionButton icon={'ban'} label={'Ban'} tone={'danger'} busy={busy('banned')} onClick={() => setDialog('ban')} />
                )}
            </div>
            <ControlDialogs controls={controls} {...props} />
        </>
    );
}

/** Everything else, behind the ⋯ button: access, experience, the harsher effects and clearing. */
export function MoreMenu({ controls, player, uuid, canClear }: { controls: Controls; player: PlayerSummary; uuid: string; canClear: boolean }) {
    const online = player.online;
    const dim = (off: boolean) => (off ? 'mcs:pointer-events-none mcs:opacity-45' : undefined);
    const hint = (text: string) => <span className={'mcs:text-xs mcs:text-muted-foreground'}>{text}</span>;
    const label = (icon: string, text: ReactNode) => (
        <span className={'mcs:flex mcs:items-center mcs:gap-2'}>
            <NamedIcon name={icon} size={15} className={'mcs:shrink-0'} /> {text}
        </span>
    );

    return (
        <DropdownMenu
            triggerContent={
                <>
                    <NamedIcon name={'ellipsis'} size={18} />
                    <span className={'mcs:sr-only'}>More actions</span>
                </>
            }
            triggerClassName={'mcs:flex mcs:size-9 mcs:cursor-pointer mcs:items-center mcs:justify-center mcs:rounded-lg mcs:border mcs:border-border mcs:text-muted-foreground mcs:hover:bg-muted mcs:hover:text-foreground'}
        >
            {ACCESS.map(({ key, label: text, description, icon }) => {
                const on = controls.accessValue(key);

                return (
                    <DropdownMenuItem key={key} checked={on} disabled={controls.busy(key)} onClick={() => controls.setAccessTo(key, !on)} description={hint(description)}>
                        <span className={'mcs:flex mcs:w-full mcs:items-center mcs:gap-2'}>
                            <NamedIcon name={icon} size={15} className={'mcs:shrink-0'} />
                            <span className={'mcs:flex-1'}>{text}</span>
                            <span className={cn('mcs:rounded-full mcs:px-1.5 mcs:py-px mcs:text-[10px] mcs:font-semibold mcs:uppercase', on ? 'mcs:bg-success/15 mcs:text-success' : 'mcs:bg-muted mcs:text-muted-foreground')}>{on ? 'On' : 'Off'}</span>
                        </span>
                    </DropdownMenuItem>
                );
            })}
            <DropdownMenuItem disabled={!online} className={dim(!online)} onClick={() => controls.setDialog('experience')}>
                {label('sparkles', 'Set experience…')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!online} className={dim(!online)} danger onClick={() => controls.setDialog('kill')}>
                {label('skull', 'Kill…')}
            </DropdownMenuItem>
            <DropdownMenuItem danger disabled={!online && !canClear} className={dim(!online && !canClear)} onClick={() => controls.setDialog('clear')}>
                {label('trash-2', 'Clear inventory…')}
            </DropdownMenuItem>
            <DropdownMenuItem
                onClick={() =>
                    navigator.clipboard
                        .writeText(uuid)
                        .then(() => toast.success('Copied the UUID.'))
                        .catch(() => toast.error('The UUID could not be copied.'))
                }
            >
                {label('copy', 'Copy UUID')}
            </DropdownMenuItem>
        </DropdownMenu>
    );
}

/** The dialogs the buttons and the menu open. */
function ControlDialogs({ controls, player, state, others, onClearOffline }: ControlProps & { controls: Controls }) {
    const { dialog, setDialog, run, track, busy } = controls;
    const [reason, setReason] = useState('');
    const [message, setMessage] = useState('');
    const [levels, setLevels] = useState(String(state?.xpLevel ?? 0));
    const [teleportTo, setTeleportTo] = useState<'player' | 'place'>(others.length > 0 ? 'player' : 'place');
    const [target, setTarget] = useState('');
    const [place, setPlace] = useState<{
        x: string;
        y: string;
        z: string;
        dimension: Dimension;
    }>({ x: '', y: '', z: '', dimension: 'overworld' });
    const close = () => setDialog(null);
    const name = player.name ?? 'the player';

    useEffect(() => setLevels(String(state?.xpLevel ?? 0)), [state?.xpLevel, dialog]);
    useEffect(() => setReason(''), [dialog]);

    // The player picked to teleport to has to still be online.
    useEffect(() => {
        if (target && !others.includes(target)) setTarget('');
    }, [others, target]);

    // The last saved place, to start from or go back to.
    const fillHere = () => {
        if (!state?.position) return;
        const [x, y, z] = state.position.map((value) => String(Math.floor(value)));
        const dimension = state.dimension.replace(/^minecraft:/, '');
        setPlace({
            x,
            y,
            z,
            dimension: DIMENSIONS.some((entry) => entry.value === dimension) ? (dimension as Dimension) : 'overworld',
        });
    };

    const number = (value: string) => value.trim() !== '' && Number.isFinite(Number(value));
    const canTeleport = teleportTo === 'player' ? target !== '' : number(place.x) && number(place.y) && number(place.z);

    const teleport = () => {
        if (!canTeleport) return;
        const destination: TeleportTarget =
            teleportTo === 'player'
                ? { player: target }
                : {
                      x: Number(place.x),
                      y: Number(place.y),
                      z: Number(place.z),
                      dimension: place.dimension,
                  };
        const where = teleportTo === 'player' ? target : `${place.x}, ${place.y}, ${place.z} in the ${DIMENSIONS.find((entry) => entry.value === place.dimension)?.label}`;
        close();
        run('teleport', 'teleport', { value: destination }, `${player.name} was teleported to ${where}.`);
    };

    const switchClass = (active: boolean) =>
        cn(
            'prism-switch-item mcs:inline-flex mcs:flex-1 mcs:cursor-pointer mcs:items-center mcs:justify-center mcs:gap-1.5 mcs:rounded mcs:px-2 mcs:py-1.5 mcs:text-sm',
            active ? 'mcs:bg-card mcs:font-semibold mcs:text-foreground mcs:shadow-sm' : 'mcs:text-muted-foreground mcs:hover:text-foreground'
        );

    return (
        <>
            <Dialog open={dialog === 'teleport'} onClose={close} title={`Teleport ${player.name}`}>
                <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
                    <div className={'prism-switch mcs:flex mcs:rounded-md mcs:bg-muted/60 mcs:p-0.5'} role={'group'} aria-label={'Teleport to'}>
                        <button type={'button'} aria-pressed={teleportTo === 'player'} onClick={() => setTeleportTo('player')} className={switchClass(teleportTo === 'player')}>
                            <NamedIcon name={'users'} size={14} /> To a player
                        </button>
                        <button type={'button'} aria-pressed={teleportTo === 'place'} onClick={() => setTeleportTo('place')} className={switchClass(teleportTo === 'place')}>
                            <NamedIcon name={'map-pin'} size={14} /> To a place
                        </button>
                    </div>
                    {teleportTo === 'player' ? (
                        others.length === 0 ? (
                            <p className={'mcs:rounded-md mcs:border mcs:border-dashed mcs:border-border mcs:px-3 mcs:py-2.5 mcs:text-sm mcs:text-muted-foreground'}>No one else is online to teleport to.</p>
                        ) : (
                            <Select
                                value={target}
                                placeholder={'Pick a player'}
                                onChange={(value) => setTarget(String(value))}
                                options={others.map((other) => ({
                                    value: other,
                                    label: other,
                                }))}
                            />
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
                                            aria-label={`${axis.toUpperCase()} coordinate`}
                                            onChange={(event) =>
                                                setPlace({
                                                    ...place,
                                                    [axis]: event.target.value.replace(/[^\d.-]/g, ''),
                                                })
                                            }
                                            onKeyDown={(event) => event.key === 'Enter' && teleport()}
                                            className={'mcs:w-full mcs:pl-6 mcs:font-mono'}
                                        />
                                    </label>
                                ))}
                            </div>
                            <div className={'mcs:flex mcs:gap-1.5'}>
                                <div className={'mcs:min-w-0 mcs:flex-1'}>
                                    <Select
                                        value={place.dimension}
                                        onChange={(value) => setPlace({ ...place, dimension: value as Dimension })}
                                        options={DIMENSIONS.map((entry) => ({
                                            value: entry.value,
                                            label: entry.label,
                                        }))}
                                    />
                                </div>
                                <Button.Text size={'small'} disabled={!state?.position} onClick={fillHere} title={'Fill in where the player was at the last save'}>
                                    <NamedIcon name={'map-pin'} size={14} /> Here
                                </Button.Text>
                            </div>
                        </div>
                    )}
                </div>
                <Dialog.Footer>
                    <Button.Text onClick={close}>Cancel</Button.Text>
                    <Button disabled={!canTeleport} onClick={teleport}>
                        Teleport
                    </Button>
                </Dialog.Footer>
            </Dialog>

            <Dialog open={dialog === 'message'} onClose={close} title={`Message ${player.name}`} description={'A private message only they see.'}>
                <form
                    id={'mcs-player-message'}
                    onSubmit={(event) => {
                        event.preventDefault();
                        const text = message.trim();
                        if (!text) return;
                        setMessage('');
                        close();
                        run('message', 'message', { value: text }, 'Message sent.', () => setMessage(text));
                    }}
                >
                    <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={'Message'} maxLength={256} autoFocus className={'mcs:w-full'} />
                </form>
                <Dialog.Footer>
                    <Button.Text onClick={close}>Cancel</Button.Text>
                    <Button type={'submit'} form={'mcs-player-message'} disabled={!message.trim()}>
                        <NamedIcon name={'send'} size={14} /> Send
                    </Button>
                </Dialog.Footer>
            </Dialog>

            {(['kick', 'ban'] as const).map((kind) => (
                <Dialog
                    key={kind}
                    open={dialog === kind}
                    onClose={close}
                    title={kind === 'kick' ? `Kick ${player.name}` : `Ban ${player.name}`}
                    description={kind === 'kick' ? 'They can join again right away.' : player.online ? 'They are disconnected and cannot join until unbanned.' : 'They cannot join until unbanned.'}
                >
                    <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={'Reason, shown to the player'} maxLength={200} autoFocus className={'mcs:w-full'} />
                    <Dialog.Footer>
                        <Button.Text onClick={close}>Cancel</Button.Text>
                        <Button.Danger
                            onClick={() => {
                                close();
                                if (kind === 'kick') run('kick', 'kick', { reason }, `${player.name} was kicked.`);
                                else controls.setAccessTo('banned', true, reason);
                            }}
                        >
                            {kind === 'kick' ? 'Kick' : 'Ban'}
                        </Button.Danger>
                    </Dialog.Footer>
                </Dialog>
            ))}

            <Dialog open={dialog === 'experience'} onClose={close} title={'Set experience'} description={`The level ${name} is at.`}>
                {state && (
                    <div className={'mcs:mb-3 mcs:h-1.5 mcs:overflow-hidden mcs:rounded-full mcs:bg-muted'} title={`${Math.round(state.xpProgress * 100)}% to the next level`}>
                        <div className={'mcs:h-full mcs:rounded-full mcs:bg-[#80ff20]'} style={{ width: `${Math.min(100, state.xpProgress * 100)}%` }} />
                    </div>
                )}
                <div className={'mcs:flex mcs:gap-1.5'}>
                    <Button isSecondary isLoading={busy('xp-down')} onClick={() => run('xp-down', 'xp-add', { value: -1 })} aria-label={'One level less'}>
                        <NamedIcon name={'minus'} size={14} />
                    </Button>
                    <Input value={levels} inputMode={'numeric'} aria-label={'Levels'} onChange={(event) => setLevels(event.target.value.replace(/[^\d]/g, ''))} className={'mcs:min-w-0 mcs:flex-1 mcs:text-center mcs:font-mono'} />
                    <Button isSecondary isLoading={busy('xp-up')} onClick={() => run('xp-up', 'xp-add', { value: 1 })} aria-label={'One level more'}>
                        <NamedIcon name={'plus'} size={14} />
                    </Button>
                </div>
                <Dialog.Footer>
                    <Button.Text onClick={close}>Close</Button.Text>
                    <Button
                        disabled={levels === ''}
                        isLoading={busy('xp-set')}
                        onClick={() => {
                            close();
                            run('xp-set', 'xp-set', { value: Number(levels) }, `${player.name} is now level ${levels}.`);
                        }}
                    >
                        Set level
                    </Button>
                </Dialog.Footer>
            </Dialog>

            <Dialog.Confirm open={dialog === 'kill'} onClose={close} title={`Kill ${player.name}?`} confirm={'Kill'} onConfirmed={() => (close(), run('kill', 'kill', {}, `${player.name} was killed.`))}>
                They drop what they carry unless the server keeps inventories.
            </Dialog.Confirm>

            <Dialog.Confirm
                open={dialog === 'clear'}
                onClose={close}
                title={'Clear inventory'}
                confirm={'Clear inventory'}
                onConfirmed={() => {
                    close();
                    if (player.online || !onClearOffline) return run('clear', 'clear', {}, `${player.name}'s inventory was cleared.`);

                    return track('clear', async () => {
                        try {
                            await onClearOffline();
                            toast.success(`${player.name}'s inventory was cleared in their player file.`);
                        } catch (error) {
                            toast.error(httpErrorToHuman(error));
                        }
                    });
                }}
            >
                {player.online
                    ? `Clear the whole inventory of ${name}, armour and offhand included? This cannot be undone.`
                    : onClearOffline
                      ? `${player.name} is offline, so every item they carry and wear is removed from their player file. The ender chest stays, and the previous file is kept as a backup.`
                      : `${player.name} is offline. The inventory is cleared when they are online.`}
            </Dialog.Confirm>
        </>
    );
}
