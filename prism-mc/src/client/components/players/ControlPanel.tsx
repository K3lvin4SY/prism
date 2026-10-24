import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Input, NamedIcon, Spinner, Switch, TitledGreyBox, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { playerAction, type PlayerAction, type PlayerSummary } from '../../api/players';
import type { PlayerState } from '../../lib/player';

const GAME_MODES = [
    { value: 'survival', label: 'Survival', icon: 'sword' },
    { value: 'creative', label: 'Creative', icon: 'box' },
    { value: 'adventure', label: 'Adventure', icon: 'map' },
    { value: 'spectator', label: 'Spectator', icon: 'circle-dot' },
] as const;

type Access = 'op' | 'whitelisted' | 'banned';

interface Props {
    identifier: string;
    player: PlayerSummary;
    state: PlayerState | null;
    running: boolean;
    /** Reloads the player data after the server has saved. */
    onDone: () => void;
    /** Clears the saved inventory in the player file, for when the player is offline (Java only). */
    onClearOffline?: () => Promise<void>;
}

/**
 * Game mode, experience, health and access for one player. Every action runs on its own:
 * its button shows a spinner until the server has it, while everything else stays usable.
 * Switches and game mode change at once and only move back if the action fails.
 */
export default function ControlPanel({ identifier, player, state, running, onDone, onClearOffline }: Props) {
    const [pending, setPending] = useState<string[]>([]);
    const [gameMode, setGameMode] = useState<string | null>(null);
    const [access, setAccess] = useState<Partial<Record<Access, boolean>>>({});
    const [levels, setLevels] = useState(String(state?.xpLevel ?? 0));
    const [reason, setReason] = useState('');
    const [message, setMessage] = useState('');
    const [confirmClear, setConfirmClear] = useState(false);
    const refreshTimer = useRef<number | null>(null);
    const online = player.online;

    useEffect(() => setLevels(String(state?.xpLevel ?? 0)), [state?.xpLevel]);

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

    const run = async (key: string, action: PlayerAction, input: { value?: string | number; reason?: string } = {}, success?: string, undo?: () => void) => {
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

    const offline = !online ? 'The player has to be online.' : undefined;

    return (
        <TitledGreyBox title={'Control'}>
            <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                {!online && <p className={'mcs:text-xs mcs:text-muted-foreground'}>{player.name} is offline. Game mode, XP and the other in-game actions work while they are online.</p>}

                <div>
                    <p className={'mcs:text-xs mcs:uppercase mcs:tracking-wide mcs:text-muted-foreground mcs:mb-1.5'}>Game mode</p>
                    <div className={'mcs:grid mcs:grid-cols-2 mcs:gap-1.5'}>
                        {GAME_MODES.map((mode) => (
                            <Button
                                key={mode.value}
                                size={'small'}
                                isSecondary={currentMode !== mode.value}
                                disabled={!online}
                                title={offline}
                                onClick={() => currentMode !== mode.value && setMode(mode.value)}
                            >
                                {busy('gamemode') && currentMode === mode.value ? <Spinner size={'small'} /> : <NamedIcon name={mode.icon} size={14} />} {mode.label}
                            </Button>
                        ))}
                    </div>
                </div>

                <div>
                    <p className={'mcs:text-xs mcs:uppercase mcs:tracking-wide mcs:text-muted-foreground mcs:mb-1.5'}>Experience levels</p>
                    <div className={'mcs:flex mcs:gap-1.5'}>
                        <Input value={levels} inputMode={'numeric'} onChange={(event) => setLevels(event.target.value.replace(/[^\d]/g, ''))} className={'mcs:flex-1 mcs:min-w-0'} disabled={!online} />
                        <Button size={'small'} isSecondary disabled={!online} isLoading={busy('xp-down')} onClick={() => run('xp-down', 'xp-add', { value: -1 })} aria-label={'One level less'}>
                            −
                        </Button>
                        <Button size={'small'} disabled={!online || levels === ''} isLoading={busy('xp-set')} onClick={() => run('xp-set', 'xp-set', { value: Number(levels) })}>
                            Set
                        </Button>
                        <Button size={'small'} isSecondary disabled={!online} isLoading={busy('xp-up')} onClick={() => run('xp-up', 'xp-add', { value: 1 })} aria-label={'One level more'}>
                            +
                        </Button>
                    </div>
                </div>

                <div className={'mcs:grid mcs:grid-cols-2 mcs:gap-1.5'}>
                    {(
                        [
                            ['heal', 'Heal', 'heart'],
                            ['feed', 'Feed', 'drumstick'],
                            ['starve', 'Starve', 'utensils'],
                            ['kill', 'Kill', 'skull'],
                        ] as const
                    ).map(([action, label, icon]) => (
                        <Button key={action} size={'small'} isSecondary disabled={!online} isLoading={busy(action)} title={offline} onClick={() => run(action, action)}>
                            <NamedIcon name={icon} size={14} /> {label}
                        </Button>
                    ))}
                </div>

                <div>
                    <p className={'mcs:text-xs mcs:uppercase mcs:tracking-wide mcs:text-muted-foreground mcs:mb-1.5'}>Access</p>
                    <div className={'mcs:flex mcs:flex-col mcs:divide-y mcs:divide-border mcs:rounded-md mcs:border mcs:border-border mcs:px-3'}>
                        {(
                            [
                                ['op', 'Operator'],
                                ['whitelisted', 'Whitelisted'],
                                ['banned', 'Banned'],
                            ] as const
                        ).map(([key, label]) => (
                            <div key={key} className={'mcs:flex mcs:items-center mcs:justify-between mcs:py-2'}>
                                <Switch label={label} checked={accessValue(key)} onChange={(checked) => toggleAccess(key, checked)} />
                                {busy(key) && <Spinner size={'small'} />}
                            </div>
                        ))}
                    </div>
                    <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={'Reason, used for kicks and bans'} maxLength={200} className={'mcs:mt-2 mcs:w-full'} />
                </div>

                <div className={'mcs:grid mcs:grid-cols-2 mcs:gap-1.5'}>
                    <Button size={'small'} isSecondary disabled={!online} isLoading={busy('kick')} onClick={() => run('kick', 'kick', { reason }, `${player.name} was kicked.`)}>
                        <NamedIcon name={'log-out'} size={14} /> Kick
                    </Button>
                    <Button.Danger size={'small'} isSecondary disabled={!online && !onClearOffline} title={!online && !onClearOffline ? offline : undefined} isLoading={busy('clear')} onClick={() => setConfirmClear(true)}>
                        <NamedIcon name={'eraser'} size={14} /> Clear inventory
                    </Button.Danger>
                </div>

                <div>
                    <p className={'mcs:text-xs mcs:uppercase mcs:tracking-wide mcs:text-muted-foreground mcs:mb-1.5'}>Message</p>
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
                        <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={'Private message to the player'} maxLength={256} disabled={!online} className={'mcs:flex-1 mcs:min-w-0'} />
                        <Button type={'submit'} size={'small'} disabled={!online || !message.trim()} isLoading={busy('message')}>
                            <NamedIcon name={'send'} size={14} /> Send
                        </Button>
                    </form>
                </div>

                {!running && <p className={'mcs:text-xs mcs:text-muted-foreground'}>The server is offline: operator, whitelist and ban changes are written to its files.</p>}
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
        </TitledGreyBox>
    );
}
