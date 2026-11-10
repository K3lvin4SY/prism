import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, ServerContentBlock, Spinner, cn, formatDate, httpErrorToHuman, toast, type ScreenComponentProps } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { getBedrockPlayer, getPlayer, getPlayers, playerAction, playerKeys, useSkin, writePlayerData, type PlayerSummary, type Skin } from '../api/players';
import { AdvancementsSummary, RecentActivity } from '../components/players/Activity';
import { ActionBar, GameModeBar, MoreMenu, useControls, type ControlProps, type Controls } from '../components/players/ControlPanel';
import FitWidth from '../components/players/FitWidth';
import Hud from '../components/players/Hud';
import InventoryEditor from '../components/players/InventoryEditor';
import { EnderChestView, InventoryView } from '../components/players/Inventory';
import PlayerHead from '../components/players/PlayerHead';
import PlayerSwitcher from '../components/players/PlayerSwitcher';
import SkinViewer from '../components/players/SkinViewer';
import { useMcInfo } from '../hooks/useMcInfo';
import { armouredSkin } from '../lib/armour';
import { clearInventory, detectFormat } from '../lib/inventoryEdit';
import { base64ToBytes, readNbt, readNbtFile } from '../lib/nbt';
import { bytesToBase64, readNbtFileTyped, writeNbtFileTyped } from '../lib/nbtio';
import { armourPoints, formatTicks, prettyId, readBedrockPlayer, readPlayer, type PlayerState } from '../lib/player';
import { featureEnabled } from '../config';

function usePlayerState(dat: string | null | undefined, bedrock: boolean) {
    const [state, setState] = useState<{
        player: PlayerState | null;
        error: string | null;
    }>({ player: null, error: null });

    useEffect(() => {
        let cancelled = false;
        if (!dat) {
            setState({ player: null, error: null });

            return;
        }

        // Bedrock records are plain little-endian NBT; Java player files are gzipped big-endian NBT.
        (bedrock ? Promise.resolve(readNbt(base64ToBytes(dat), true)).then(readBedrockPlayer) : readNbtFile(base64ToBytes(dat)).then(readPlayer))
            .then((player) => !cancelled && setState({ player, error: null }))
            .catch((error: Error) => !cancelled && setState({ player: null, error: error.message }));

        return () => {
            cancelled = true;
        };
    }, [dat, bedrock]);

    return state;
}

/** A card with the theme's surface, the building block of the page. */
function Card({ className, children }: { className?: string; children: ReactNode }) {
    return <section className={cn('pt-surface mcs:@container mcs:min-w-0 mcs:rounded-xl mcs:border mcs:border-border mcs:bg-card', className)}>{children}</section>;
}

/** One stat tile: the value large, its label under it. */
function Stat({ value, label, title }: { value: ReactNode; label: string; title?: string }) {
    return (
        <div className={'mcs:min-w-0 mcs:rounded-lg mcs:border mcs:border-border mcs:bg-muted/20 mcs:px-3.5 mcs:py-2.5'} title={title}>
            <p className={'mcs:truncate mcs:text-lg mcs:leading-tight mcs:font-bold'}>{value}</p>
            <p className={'mcs:truncate mcs:text-xs mcs:text-muted-foreground'}>{label}</p>
        </div>
    );
}

/** "41 min", "3 h 5 min", "2 days": how long ago a time was, short. */
function since(time: string): string {
    const minutes = Math.max(1, Math.round((Date.now() - new Date(time).getTime()) / 60_000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
    const days = Math.floor(hours / 24);

    return `${days} day${days === 1 ? '' : 's'}`;
}

export default function PlayerScreen({ data: route }: ScreenComponentProps) {
    const { identifier, info } = useMcInfo();
    const queryClient = useQueryClient();
    const uuid = String(route.params.player ?? '').toLowerCase();
    const [tab, setTab] = useState<'inventory' | 'ender'>('inventory');
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);

    const list = useQuery({
        queryKey: playerKeys.list(identifier),
        queryFn: () => getPlayers(identifier),
        refetchInterval: 15_000,
    });
    const bedrock = info?.edition === 'bedrock';
    const detail = useQuery({
        queryKey: playerKeys.detail(identifier, uuid),
        queryFn: () => (bedrock ? getBedrockPlayer(identifier, uuid) : getPlayer(identifier, uuid)),
        enabled: info !== undefined,
        // Held still while the editor is open, so a refresh cannot reset it mid-edit.
        refetchInterval: editing ? false : 30_000,
    });
    const skin = useSkin(identifier, uuid);
    const { player, error } = usePlayerState(detail.data?.dat, bedrock);
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

    // This player's lines from the server log, newest first.
    const events = useMemo(
        () => (list.data?.activity ?? []).filter((event) => (event.id && event.id.toLowerCase() === uuid) || (summary?.name && event.name === summary.name)).sort((a, b) => String(b.time ?? '').localeCompare(String(a.time ?? ''))),
        [list.data?.activity, uuid, summary?.name]
    );
    const joinedAt = summary?.online ? events.find((event) => event.event === 'joined')?.time : null;

    const refresh = () => {
        queryClient.invalidateQueries({
            queryKey: playerKeys.detail(identifier, uuid),
        });
        queryClient.invalidateQueries({ queryKey: playerKeys.list(identifier) });
    };

    /** Asks the server to save, so the page shows what the player has right now. */
    const saveNow = async () => {
        setSaving(true);
        try {
            if (list.data?.canManage && list.data.running) {
                await playerAction(identifier, 'save');
                await new Promise((resolve) => window.setTimeout(resolve, 2000));
            }
            refresh();
        } catch (exception) {
            toast.error(httpErrorToHuman(exception));
        } finally {
            setSaving(false);
        }
    };

    /** Empties the inventory in the saved file while the player is away: the same write the editor uses. */
    const clearOffline = async () => {
        const dat = detail.data?.dat;
        const hash = detail.data?.hash;
        if (!dat || !hash) return;
        const file = await readNbtFileTyped(base64ToBytes(dat));
        const bytes = await writeNbtFileTyped({
            ...file,
            root: clearInventory(file.root, detectFormat(file.root)),
        });
        await writePlayerData(identifier, uuid, bytesToBase64(bytes), hash, 'clear');
        refresh();
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
    const canManage = !!list.data?.canManage && !!summary;
    const canEdit = !!list.data?.canManage && !bedrock && !!detail.data?.dat && !!detail.data.hash;
    const controlProps: ControlProps | null = canManage
        ? {
              identifier,
              player: summary!,
              state: player,
              running: list.data!.running,
              others: list.data!.players.filter((entry) => entry.online && entry.name && entry.uuid !== uuid).map((entry) => entry.name!),
              onDone: refresh,
              onClearOffline: canEdit ? clearOffline : undefined,
          }
        : null;

    const status = summary?.online ? (joinedAt ? `Online for ${since(joinedAt)}` : 'Online now') : summary?.lastSeen ? `Last seen ${formatDate(new Date(summary.lastSeen), 'MMM D, YYYY HH:mm')}` : 'Offline';
    const firstJoined = player?.firstPlayed ? `first joined ${formatDate(new Date(player.firstPlayed), 'MMM D, YYYY')}` : null;

    return (
        <ServerContentBlock title={`${name} · Players`}>
            <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                {list.data && <PlayerSwitcher server={identifier} players={list.data.players} current={uuid} />}

                <div className={'mcs:@container'}>
                    <div className={'mcs:grid mcs:gap-4 mcs:@2xl:grid-cols-[minmax(200px,250px)_minmax(0,1fr)]'}>
                        {/* The player as they look in game, where they stood at the last save. */}
                        <section
                            className={
                                'mcs:relative mcs:flex mcs:min-h-[300px] mcs:items-center mcs:justify-center mcs:overflow-hidden mcs:rounded-xl mcs:border mcs:border-border mcs:bg-linear-to-b mcs:from-[#5b8fd1] mcs:via-[#8db9e8] mcs:to-[#cfe6f7]'
                            }
                        >
                            <div className={'mcs:absolute mcs:inset-x-0 mcs:bottom-0 mcs:h-12 mcs:bg-linear-to-b mcs:from-[#6aa84f] mcs:to-[#4e7f3a]'} aria-hidden />
                            <div className={'mcs:relative mcs:pb-6'}>
                                {!featureEnabled('skins') ? <PlayerHead server={identifier} skinKey={uuid} className={'mcs:size-32'} /> : model ? <SkinViewer skin={model} width={220} height={290} /> : <Spinner />}
                            </div>
                            <span
                                className={cn(
                                    'mcs:absolute mcs:top-3 mcs:left-3 mcs:inline-flex mcs:items-center mcs:gap-1.5 mcs:rounded-full mcs:bg-black/55 mcs:px-2.5 mcs:py-1 mcs:text-xs mcs:font-medium mcs:backdrop-blur',
                                    summary?.online ? 'mcs:text-[#7ee787]' : 'mcs:text-white/80'
                                )}
                            >
                                <span className={cn('mcs:size-1.5 mcs:rounded-full', summary?.online ? 'mcs:bg-[#7ee787]' : 'mcs:bg-white/60')} />
                                {summary?.online ? 'Online' : 'Offline'}
                            </span>
                            <button
                                type={'button'}
                                onClick={saveNow}
                                disabled={saving}
                                title={list.data?.canManage && list.data.running ? 'Save the server and show the latest' : 'Reload'}
                                aria-label={'Refresh'}
                                className={'mcs:absolute mcs:top-3 mcs:right-3 mcs:flex mcs:size-8 mcs:cursor-pointer mcs:items-center mcs:justify-center mcs:rounded-lg mcs:bg-black/55 mcs:text-white mcs:backdrop-blur mcs:hover:bg-black/70'}
                            >
                                <NamedIcon name={'refresh-cw'} size={15} className={saving ? 'mcs:animate-spin' : undefined} />
                            </button>
                            {player && (
                                <div
                                    className={
                                        'mcs:absolute mcs:inset-x-3 mcs:bottom-3 mcs:flex mcs:items-center mcs:justify-between mcs:gap-2 mcs:rounded-lg mcs:bg-black/60 mcs:px-3 mcs:py-1.5 mcs:font-mono mcs:text-xs mcs:text-white mcs:backdrop-blur'
                                    }
                                >
                                    <span className={'mcs:truncate'}>{prettyId(player.dimension)}</span>
                                    <span className={'mcs:shrink-0'}>{player.position ? player.position.map((value) => Math.floor(value)).join(', ') : '?'}</span>
                                </div>
                            )}
                        </section>

                        <Card className={'mcs:flex mcs:flex-col mcs:gap-4 mcs:p-4 mcs:sm:p-5'}>
                            <WithControls props={controlProps}>
                                {(controls) => (
                                    <>
                                        <header className={'mcs:flex mcs:items-start mcs:gap-3'}>
                                            <PlayerHead server={identifier} skinKey={uuid} className={'mcs:size-12 mcs:shrink-0 mcs:rounded-md mcs:shadow-md'} />
                                            <div className={'mcs:min-w-0 mcs:flex-1'}>
                                                <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-x-2 mcs:gap-y-1'}>
                                                    <h2 className={'mcs:truncate mcs:text-xl mcs:font-bold mcs:sm:text-2xl'}>{name}</h2>
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
                                                <p className={'mcs:mt-0.5 mcs:text-sm mcs:text-muted-foreground'}>
                                                    <span className={summary?.online ? 'mcs:text-success' : undefined}>{status}</span>
                                                    {firstJoined && <> · {firstJoined}</>}
                                                </p>
                                            </div>
                                            {controls && controlProps && <MoreMenu controls={controls} player={controlProps.player} uuid={uuid} canClear={canEdit} />}
                                        </header>

                                        {player ? (
                                            <div className={'mcs:grid mcs:grid-cols-2 mcs:gap-2 mcs:@lg:grid-cols-4'}>
                                                <Stat value={`Level ${player.xpLevel}`} label={'Experience'} title={`${player.xpTotal.toLocaleString()} points in total`} />
                                                {bedrock ? (
                                                    <>
                                                        <Stat value={`${player.health / 2} / ${player.maxHealth / 2}`} label={'Hearts'} />
                                                        <Stat value={`${player.food} / 20`} label={'Food'} />
                                                        <Stat value={armourPoints(player.equipment)} label={'Armour'} />
                                                    </>
                                                ) : (
                                                    <>
                                                        <Stat value={formatTicks(custom('play_time') || custom('play_one_minute'))} label={'Play time'} />
                                                        <Stat value={custom('leave_game') + (summary?.online ? 1 : 0)} label={'Sessions'} />
                                                        <Stat value={custom('deaths')} label={'Deaths'} title={custom('deaths') ? `Last death ${formatTicks(custom('time_since_death'))} ago` : undefined} />
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                            <Alert type={error ? 'danger' : 'info'}>{error ? `The player file could not be read: ${error}` : 'No saved data yet. It appears after the player has played and the server has saved.'}</Alert>
                                        )}

                                        {controls && controlProps ? (
                                            <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
                                                <GameModeBar controls={controls} player={controlProps.player} />
                                                <ActionBar controls={controls} {...controlProps} />
                                            </div>
                                        ) : (
                                            player && (
                                                <p className={'mcs:text-sm mcs:text-muted-foreground'}>
                                                    Game mode: <span className={'mcs:font-medium mcs:text-foreground'}>{prettyId(player.gameMode)}</span>
                                                </p>
                                            )
                                        )}
                                        {controlProps && !summary?.online && (
                                            <p className={'mcs:-mt-1 mcs:flex mcs:items-center mcs:gap-1.5 mcs:text-xs mcs:text-muted-foreground'}>
                                                <NamedIcon name={'info'} size={13} className={'mcs:shrink-0'} />
                                                {list.data?.running
                                                    ? `${name} is offline: in-game actions wait until they join. Bans, operator and whitelist work any time.`
                                                    : 'The server is offline: operator, whitelist and ban changes are written to its files.'}
                                            </p>
                                        )}
                                    </>
                                )}
                            </WithControls>
                        </Card>
                    </div>
                </div>

                {(player || !bedrock) && (
                    <Card className={'mcs:overflow-hidden'}>
                        <div className={cn('mcs:grid', player && 'mcs:@4xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]')}>
                            {player ? (
                                <div className={'mcs:flex mcs:min-w-0 mcs:flex-col mcs:gap-4 mcs:p-4 mcs:sm:p-5'}>
                                    <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:justify-between mcs:gap-2'}>
                                        <div className={'prism-switch mcs:flex mcs:rounded-lg mcs:border mcs:border-border mcs:bg-muted/30 mcs:p-1'}>
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
                                                        'prism-switch-item mcs:inline-flex mcs:cursor-pointer mcs:items-center mcs:gap-1.5 mcs:rounded-md mcs:px-3 mcs:py-1.5 mcs:text-sm',
                                                        tab === value ? 'mcs:bg-primary mcs:font-medium mcs:text-primary-foreground' : 'mcs:text-muted-foreground mcs:hover:text-foreground'
                                                    )}
                                                >
                                                    <NamedIcon name={icon} size={14} /> {label}
                                                </button>
                                            ))}
                                        </div>
                                        {canEdit && (
                                            <Button size={'small'} disabled={summary?.online} title={summary?.online ? 'Available while the player is offline, so the game cannot overwrite the changes' : undefined} onClick={() => setEditing(true)}>
                                                <NamedIcon name={'pencil'} size={14} /> Edit items
                                            </Button>
                                        )}
                                    </div>
                                    <FitWidth>
                                        <div className={'mcs:flex mcs:flex-col mcs:items-center mcs:gap-4'}>
                                            {tab === 'inventory' ? <InventoryView player={player} version={version} /> : <EnderChestView player={player} version={version} />}
                                            {/* The hotbar, offhand and status bars under the inventory, as in game. */}
                                            {tab === 'inventory' && <Hud player={player} version={version} />}
                                        </div>
                                    </FitWidth>
                                    <p className={'mcs:text-xs mcs:text-muted-foreground'}>This is the last save. Online players are saved every few minutes, or right away with the refresh button on the model.</p>
                                </div>
                            ) : null}
                            <aside className={cn('mcs:flex mcs:flex-col mcs:justify-between mcs:gap-6 mcs:bg-muted/10 mcs:p-4 mcs:sm:p-5', player && 'mcs:border-t mcs:border-border mcs:@4xl:border-t-0 mcs:@4xl:border-l')}>
                                <RecentActivity events={events} advancements={detail.data?.advancements ?? []} />
                                {!bedrock && <AdvancementsSummary items={detail.data?.advancements ?? []} />}
                            </aside>
                        </div>
                    </Card>
                )}
            </div>
            {editing && detail.data?.dat && detail.data.hash && (
                <InventoryEditor server={identifier} uuid={uuid} name={name} dat={detail.data.dat} hash={detail.data.hash} version={version} initialTab={tab} onClose={() => setEditing(false)} onSaved={refresh} />
            )}
        </ServerContentBlock>
    );
}

/** Keeps the controls' one shared state (what is pending, which dialog is open) for everything inside it. */
function WithControls({ props, children }: { props: ControlProps | null; children: (controls: Controls | null) => ReactNode }) {
    return props ? <ControlsHost props={props}>{children}</ControlsHost> : <>{children(null)}</>;
}

function ControlsHost({ props, children }: { props: ControlProps; children: (controls: Controls) => ReactNode }) {
    return <>{children(useControls(props))}</>;
}
