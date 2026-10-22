import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    Badge,
    Button,
    Dialog,
    Input,
    NamedIcon,
    PanelLink,
    ServerContentBlock,
    Spinner,
    Switch,
    TitledGreyBox,
    cn,
    formatDate,
    httpErrorToHuman,
    toast,
    type ScreenComponentProps,
} from '@pterodactyl/sdk';
import { getPlayer, getPlayers, playerAction, playerKeys, useSkin, type PlayerAction, type PlayerSummary, type Skin } from '../api/players';
import { EnderChestView, InventoryView, StatusBars } from '../components/players/Inventory';
import PlayerHead from '../components/players/PlayerHead';
import SkinViewer from '../components/players/SkinViewer';
import { useMcInfo } from '../hooks/useMcInfo';
import { armouredSkin } from '../lib/armour';
import { base64ToBytes, readNbtFile } from '../lib/nbt';
import { formatTicks, prettyId, readPlayer, type PlayerState } from '../lib/player';

const GAME_MODES = [
    { value: 'survival', label: 'Survival', icon: 'sword' },
    { value: 'creative', label: 'Creative', icon: 'box' },
    { value: 'adventure', label: 'Adventure', icon: 'map' },
    { value: 'spectator', label: 'Spectator', icon: 'circle-dot' },
] as const;

function usePlayerState(dat: string | null | undefined) {
    const [state, setState] = useState<{ player: PlayerState | null; error: string | null }>({ player: null, error: null });

    useEffect(() => {
        let cancelled = false;
        if (!dat) {
            setState({ player: null, error: null });

            return;
        }

        readNbtFile(base64ToBytes(dat))
            .then((root) => !cancelled && setState({ player: readPlayer(root), error: null }))
            .catch((error: Error) => !cancelled && setState({ player: null, error: error.message }));

        return () => {
            cancelled = true;
        };
    }, [dat]);

    return state;
}

function Fact({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
    return (
        <div className={'mcs:flex mcs:items-center mcs:gap-3'}>
            <span className={'mcs:flex mcs:size-9 mcs:shrink-0 mcs:items-center mcs:justify-center mcs:rounded-md mcs:bg-muted mcs:text-muted-foreground'}>
                <NamedIcon name={icon} size={18} />
            </span>
            <div className={'mcs:min-w-0'}>
                <p className={'mcs:text-xs mcs:text-muted-foreground'}>{label}</p>
                <p className={'mcs:text-sm mcs:font-medium mcs:truncate'}>{children}</p>
            </div>
        </div>
    );
}

export default function PlayerScreen({ data: route }: ScreenComponentProps) {
    const { identifier, info } = useMcInfo();
    const queryClient = useQueryClient();
    const uuid = String(route.params.player ?? '').toLowerCase();
    const [tab, setTab] = useState<'inventory' | 'ender'>('inventory');
    const [saving, setSaving] = useState(false);

    const list = useQuery({ queryKey: playerKeys.list(identifier), queryFn: () => getPlayers(identifier), refetchInterval: 15_000 });
    const detail = useQuery({ queryKey: playerKeys.detail(identifier, uuid), queryFn: () => getPlayer(identifier, uuid), refetchInterval: 30_000 });
    const skin = useSkin(identifier, uuid);
    const { player, error } = usePlayerState(detail.data?.dat);
    const [model, setModel] = useState<Skin | null>(null);

    // The model wears the armour from the last save.
    useEffect(() => {
        let cancelled = false;
        if (!skin.data) return;
        if (!player) {
            setModel(skin.data);

            return;
        }

        armouredSkin(skin.data.url, player.equipment)
            .then((url) => !cancelled && setModel({ ...skin.data!, url }))
            .catch(() => !cancelled && setModel(skin.data!));

        return () => {
            cancelled = true;
        };
    }, [skin.data, player]);

    const summary: PlayerSummary | undefined = list.data?.players.find((entry) => entry.uuid === uuid);
    const name = summary?.name ?? uuid;
    const stats = detail.data?.stats?.['minecraft:custom'] ?? {};
    const custom = (key: string) => stats[`minecraft:${key}`] ?? 0;

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: playerKeys.detail(identifier, uuid) });
        queryClient.invalidateQueries({ queryKey: playerKeys.list(identifier) });
    };

    const saveNow = async () => {
        setSaving(true);
        try {
            await playerAction(identifier, 'save');
            await new Promise((resolve) => window.setTimeout(resolve, 2000));
            refresh();
        } catch (exception) {
            toast.error(httpErrorToHuman(exception));
        } finally {
            setSaving(false);
        }
    };

    if (detail.isLoading || list.isLoading) {
        return (
            <ServerContentBlock title={'Players'}>
                <Spinner centered />
            </ServerContentBlock>
        );
    }

    if (detail.isError) {
        return (
            <ServerContentBlock title={'Players'}>
                <Alert type={'danger'}>{httpErrorToHuman(detail.error)}</Alert>
            </ServerContentBlock>
        );
    }

    const version = detail.data?.version ?? info?.version ?? null;

    return (
        <ServerContentBlock title={`${name} · Players`}>
            <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                <PanelLink destination={{ extension: 'mc-suite', screen: 'players', params: { id: identifier } }} className={'mcs:inline-flex mcs:items-center mcs:gap-1 mcs:text-sm mcs:text-muted-foreground mcs:hover:text-foreground'}>
                    <NamedIcon name={'arrow-left'} size={14} /> All players
                </PanelLink>

                <div className={'mcs:grid mcs:gap-4 mcs:xl:grid-cols-[1fr_320px]'}>
                    <div className={'mcs:flex mcs:flex-col mcs:gap-4 mcs:min-w-0'}>
                        <div className={'mcs:grid mcs:gap-4 mcs:md:grid-cols-[260px_1fr] mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:overflow-hidden'}>
                            <div className={'mcs:flex mcs:items-center mcs:justify-center mcs:bg-gradient-to-b mcs:from-[#5b8fd1] mcs:to-[#9ec8f0] mcs:min-h-[300px]'}>
                                {model ? <SkinViewer skin={model} width={240} height={320} /> : <Spinner />}
                            </div>
                            <div className={'mcs:flex mcs:flex-col mcs:gap-4 mcs:p-4'}>
                                <div className={'mcs:flex mcs:items-center mcs:gap-3'}>
                                    <PlayerHead server={identifier} skinKey={uuid} className={'mcs:size-11'} />
                                    <div className={'mcs:min-w-0'}>
                                        <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-2'}>
                                            <h2 className={'mcs:text-xl mcs:font-bold'}>{name}</h2>
                                            {summary?.online && (
                                                <Badge size={'sm'} tone={'success'}>
                                                    Online
                                                </Badge>
                                            )}
                                            {summary?.op != null && (
                                                <Badge size={'sm'} tone={'warning'}>
                                                    OP
                                                </Badge>
                                            )}
                                            {summary?.whitelisted && (
                                                <Badge size={'sm'} tone={'info'}>
                                                    Whitelisted
                                                </Badge>
                                            )}
                                            {summary?.banned && (
                                                <Badge size={'sm'} tone={'danger'}>
                                                    Banned
                                                </Badge>
                                            )}
                                        </div>
                                        <p className={'mcs:font-mono mcs:text-xs mcs:text-muted-foreground'}>{uuid}</p>
                                    </div>
                                </div>
                                {player ? (
                                    <div className={'mcs:grid mcs:gap-4 mcs:sm:grid-cols-2'}>
                                        <Fact icon={'swords'} label={'Mode'}>
                                            {prettyId(player.gameMode)}
                                        </Fact>
                                        <Fact icon={'globe'} label={'Dimension'}>
                                            {prettyId(player.dimension)}
                                        </Fact>
                                        <Fact icon={'map-pin'} label={'Position'}>
                                            {player.position ? player.position.map((value) => Math.floor(value)).join(', ') : 'Unknown'}
                                        </Fact>
                                        <Fact icon={'sparkles'} label={'Total XP'}>
                                            {player.xpTotal.toLocaleString()}
                                        </Fact>
                                        <Fact icon={'clock'} label={'Play time'}>
                                            {formatTicks(custom('play_time') || custom('play_one_minute'))}
                                        </Fact>
                                        <Fact icon={'log-in'} label={'Sessions'}>
                                            {custom('leave_game') + (summary?.online ? 1 : 0)}
                                        </Fact>
                                        <Fact icon={'skull'} label={'Since last death'}>
                                            {formatTicks(custom('time_since_death'))} · {custom('deaths')} deaths
                                        </Fact>
                                        <Fact icon={'cake'} label={'First joined'}>
                                            {player.firstPlayed ? formatDate(new Date(player.firstPlayed), 'MMM D, YYYY') : 'Not recorded'}
                                        </Fact>
                                    </div>
                                ) : (
                                    <Alert type={error ? 'danger' : 'info'}>
                                        {error ? `The player file could not be read: ${error}` : 'No saved data yet. It appears after the player has played and the server has saved.'}
                                    </Alert>
                                )}
                            </div>
                        </div>

                        {player && (
                            <div className={'mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:p-4 mcs:flex mcs:justify-center mcs:overflow-x-auto'}>
                                <StatusBars player={player} version={version} />
                            </div>
                        )}

                        {player && (
                            <div className={'mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:p-4 mcs:flex mcs:flex-col mcs:gap-3'}>
                                <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:justify-between mcs:gap-2'}>
                                    <div className={'mcs:flex mcs:rounded-md mcs:bg-muted mcs:p-0.5'}>
                                        {(
                                            [
                                                ['inventory', 'Inventory', 'package'],
                                                ['ender', 'Ender Chest', 'box'],
                                            ] as const
                                        ).map(([value, label, icon]) => (
                                            <button
                                                key={value}
                                                type={'button'}
                                                onClick={() => setTab(value)}
                                                className={cn(
                                                    'mcs:inline-flex mcs:items-center mcs:gap-1.5 mcs:rounded mcs:px-3 mcs:py-1.5 mcs:text-sm mcs:cursor-pointer',
                                                    tab === value ? 'mcs:bg-primary mcs:text-primary-foreground' : 'mcs:text-muted-foreground mcs:hover:text-foreground'
                                                )}
                                            >
                                                <NamedIcon name={icon} size={14} /> {label}
                                            </button>
                                        ))}
                                    </div>
                                    {list.data?.canManage && list.data.running && (
                                        <Button size={'small'} isSecondary isLoading={saving} onClick={saveNow}>
                                            <NamedIcon name={'save'} size={14} /> Save now
                                        </Button>
                                    )}
                                </div>
                                <div className={'mcs:flex mcs:justify-center'}>
                                    {tab === 'inventory' ? <InventoryView player={player} version={version} /> : <EnderChestView player={player} version={version} />}
                                </div>
                                <p className={'mcs:text-xs mcs:text-muted-foreground'}>This is the last save. Online players are saved every few minutes, or right away with Save now.</p>
                            </div>
                        )}
                    </div>

                    <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                        {list.data?.canManage && summary && (
                            <ControlPanel identifier={identifier} player={summary} state={player} running={list.data.running} onDone={refresh} />
                        )}
                        <Advancements items={detail.data?.advancements ?? []} />
                    </div>
                </div>
            </div>
        </ServerContentBlock>
    );
}

function ControlPanel({
    identifier,
    player,
    state,
    running,
    onDone,
}: {
    identifier: string;
    player: PlayerSummary;
    state: PlayerState | null;
    running: boolean;
    onDone: () => void;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    const [levels, setLevels] = useState(String(state?.xpLevel ?? 0));
    const [reason, setReason] = useState('');
    const [message, setMessage] = useState('');
    const [confirmClear, setConfirmClear] = useState(false);
    const online = player.online;

    useEffect(() => setLevels(String(state?.xpLevel ?? 0)), [state?.xpLevel]);

    const run = async (action: PlayerAction, input: { value?: string | number; reason?: string } = {}, success?: string) => {
        setBusy(action);
        try {
            const applied = await playerAction(identifier, action, { name: player.name, uuid: player.uuid, ...input });
            if (success) toast.success(applied === 'file' ? `${success} It applies when the server starts.` : success);
            if (applied === 'command' && online) {
                // Save so the change shows up in the player file right away.
                await playerAction(identifier, 'save');
                await new Promise((resolve) => window.setTimeout(resolve, 1500));
            }
            onDone();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(null);
        }
    };

    const needsOnline = !online ? 'The player has to be online.' : undefined;

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
                                isSecondary={state?.gameMode !== mode.value}
                                disabled={!online || busy !== null}
                                title={needsOnline}
                                onClick={() => run('gamemode', { value: mode.value })}
                            >
                                <NamedIcon name={mode.icon} size={14} /> {mode.label}
                            </Button>
                        ))}
                    </div>
                </div>

                <div>
                    <p className={'mcs:text-xs mcs:uppercase mcs:tracking-wide mcs:text-muted-foreground mcs:mb-1.5'}>Experience levels</p>
                    <div className={'mcs:flex mcs:gap-1.5'}>
                        <Input value={levels} inputMode={'numeric'} onChange={(event) => setLevels(event.target.value.replace(/[^\d]/g, ''))} className={'mcs:flex-1 mcs:min-w-0'} disabled={!online} />
                        <Button size={'small'} isSecondary disabled={!online || busy !== null} onClick={() => run('xp-add', { value: -1 })} aria-label={'One level less'}>
                            −
                        </Button>
                        <Button size={'small'} disabled={!online || busy !== null || levels === ''} onClick={() => run('xp-set', { value: Number(levels) })}>
                            Set
                        </Button>
                        <Button size={'small'} isSecondary disabled={!online || busy !== null} onClick={() => run('xp-add', { value: 1 })} aria-label={'One level more'}>
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
                        <Button key={action} size={'small'} isSecondary disabled={!online || busy !== null} isLoading={busy === action} title={needsOnline} onClick={() => run(action)}>
                            <NamedIcon name={icon} size={14} /> {label}
                        </Button>
                    ))}
                </div>

                <div>
                    <p className={'mcs:text-xs mcs:uppercase mcs:tracking-wide mcs:text-muted-foreground mcs:mb-1.5'}>Access</p>
                    <div className={'mcs:flex mcs:flex-col mcs:divide-y mcs:divide-border mcs:rounded-md mcs:border mcs:border-border mcs:px-3'}>
                        <div className={'mcs:py-2'}>
                            <Switch
                                label={'Operator'}
                                checked={player.op !== null}
                                disabled={busy !== null}
                                onChange={(checked) => run(checked ? 'op' : 'deop', {}, checked ? `${player.name} is now an operator.` : `${player.name} is no longer an operator.`)}
                            />
                        </div>
                        <div className={'mcs:py-2'}>
                            <Switch
                                label={'Whitelisted'}
                                checked={player.whitelisted}
                                disabled={busy !== null}
                                onChange={(checked) => run(checked ? 'whitelist-add' : 'whitelist-remove', {}, checked ? `${player.name} is whitelisted.` : `${player.name} was removed from the whitelist.`)}
                            />
                        </div>
                        <div className={'mcs:py-2'}>
                            <Switch
                                label={'Banned'}
                                checked={player.banned !== null}
                                disabled={busy !== null}
                                onChange={(checked) => run(checked ? 'ban' : 'pardon', { reason }, checked ? `${player.name} is banned.` : `${player.name} is unbanned.`)}
                            />
                        </div>
                    </div>
                    <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={'Reason, used for kicks and bans'} maxLength={200} className={'mcs:mt-2 mcs:w-full'} />
                </div>

                <div className={'mcs:grid mcs:grid-cols-2 mcs:gap-1.5'}>
                    <Button size={'small'} isSecondary disabled={!online || busy !== null} isLoading={busy === 'kick'} onClick={() => run('kick', { reason }, `${player.name} was kicked.`)}>
                        <NamedIcon name={'log-out'} size={14} /> Kick
                    </Button>
                    <Button.Danger size={'small'} isSecondary disabled={!online || busy !== null} onClick={() => setConfirmClear(true)}>
                        <NamedIcon name={'eraser'} size={14} /> Clear inventory
                    </Button.Danger>
                </div>

                <div>
                    <p className={'mcs:text-xs mcs:uppercase mcs:tracking-wide mcs:text-muted-foreground mcs:mb-1.5'}>Message</p>
                    <form
                        className={'mcs:flex mcs:gap-1.5'}
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (message.trim()) run('message', { value: message.trim() }, 'Message sent.').then(() => setMessage(''));
                        }}
                    >
                        <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={'Private message to the player'} maxLength={256} disabled={!online} className={'mcs:flex-1 mcs:min-w-0'} />
                        <Button type={'submit'} size={'small'} disabled={!online || busy !== null || !message.trim()}>
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
                pending={busy === 'clear'}
                onConfirmed={() => {
                    setConfirmClear(false);
                    run('clear', {}, `${player.name}'s inventory was cleared.`);
                }}
            >
                Clear the whole inventory of {player.name}? This cannot be undone.
            </Dialog.Confirm>
        </TitledGreyBox>
    );
}

function Advancements({ items }: { items: { id: string; date: string | null }[] }) {
    const groups = useMemo(() => items.filter((item) => !item.id.endsWith('/root')), [items]);

    return (
        <TitledGreyBox
            title={
                <span className={'mcs:flex mcs:items-center mcs:justify-between mcs:w-full'}>
                    Advancements
                    <Badge size={'sm'} tone={'warning'}>
                        {groups.length} done
                    </Badge>
                </span>
            }
        >
            {groups.length === 0 ? (
                <p className={'mcs:text-sm mcs:text-muted-foreground'}>None yet.</p>
            ) : (
                <ul className={'mcs:flex mcs:flex-col mcs:gap-2 mcs:max-h-96 mcs:overflow-y-auto'}>
                    {groups.map((item) => {
                        const [, path = item.id] = item.id.split(':');
                        const [category, ...rest] = path.split('/');

                        return (
                            <li key={item.id} className={'mcs:flex mcs:items-center mcs:gap-3'}>
                                <span className={'mcs:flex mcs:size-8 mcs:shrink-0 mcs:items-center mcs:justify-center mcs:rounded mcs:bg-muted mcs:text-warning'}>
                                    <NamedIcon name={'trophy'} size={16} />
                                </span>
                                <div className={'mcs:min-w-0 mcs:flex-1'}>
                                    <p className={'mcs:text-sm mcs:truncate'}>{prettyId(rest.join('_') || category)}</p>
                                    <p className={'mcs:text-xs mcs:text-muted-foreground'}>{prettyId(category)}</p>
                                </div>
                                {item.date && <span className={'mcs:text-xs mcs:text-muted-foreground'}>{formatDate(item.date, 'MMM D')}</span>}
                            </li>
                        );
                    })}
                </ul>
            )}
        </TitledGreyBox>
    );
}
