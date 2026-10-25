import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    Badge,
    Button,
    CopyOnClick,
    PanelLink,
    ServerContentBlock,
    Spinner,
    TitledGreyBox,
    cn,
    formatDate,
    httpErrorToHuman,
    toast,
    type ScreenComponentProps,
} from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { getBedrockPlayer, getPlayer, getPlayers, playerAction, playerKeys, useSkin, writePlayerData, type PlayerSummary, type Skin } from '../api/players';
import ControlPanel from '../components/players/ControlPanel';
import Hud from '../components/players/Hud';
import InventoryEditor from '../components/players/InventoryEditor';
import { EnderChestView, InventoryView } from '../components/players/Inventory';
import PlayerHead from '../components/players/PlayerHead';
import SkinViewer from '../components/players/SkinViewer';
import { useMcInfo } from '../hooks/useMcInfo';
import { armouredSkin } from '../lib/armour';
import { clearInventory, detectFormat } from '../lib/inventoryEdit';
import { base64ToBytes, readNbt, readNbtFile } from '../lib/nbt';
import { bytesToBase64, readNbtFileTyped, writeNbtFileTyped } from '../lib/nbtio';
import { formatTicks, prettyId, readBedrockPlayer, readPlayer, type PlayerState } from '../lib/player';
import { featureEnabled } from '../config';


function usePlayerState(dat: string | null | undefined, bedrock: boolean) {
    const [state, setState] = useState<{ player: PlayerState | null; error: string | null }>({ player: null, error: null });

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

/** One tile in the facts grid: a small label over its value. */
function Fact({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
    return (
        <div className={'mcs:flex mcs:min-w-0 mcs:flex-col mcs:justify-center mcs:gap-1 mcs:bg-card mcs:px-4 mcs:py-3'}>
            <p className={'mcs:flex mcs:items-center mcs:gap-1.5 mcs:text-xs mcs:text-muted-foreground'}>
                <NamedIcon name={icon} size={13} /> {label}
            </p>
            <p className={'mcs:truncate mcs:text-sm mcs:font-semibold'}>{children}</p>
        </div>
    );
}

export default function PlayerScreen({ data: route }: ScreenComponentProps) {
    const { identifier, info } = useMcInfo();
    const queryClient = useQueryClient();
    const uuid = String(route.params.player ?? '').toLowerCase();
    const [tab, setTab] = useState<'inventory' | 'ender'>('inventory');
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);

    const list = useQuery({ queryKey: playerKeys.list(identifier), queryFn: () => getPlayers(identifier), refetchInterval: 15_000 });
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

    /** Empties the inventory in the saved file while the player is away: the same write the editor uses. */
    const clearOffline = async () => {
        const dat = detail.data?.dat;
        const hash = detail.data?.hash;
        if (!dat || !hash) return;
        const file = await readNbtFileTyped(base64ToBytes(dat));
        const bytes = await writeNbtFileTyped({ ...file, root: clearInventory(file.root, detectFormat(file.root)) });
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

    return (
        <ServerContentBlock title={`${name} · Players`}>
            <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                <PanelLink destination={{ extension: 'prism-mc', screen: 'players', params: { id: identifier } }} className={'mcs:inline-flex mcs:items-center mcs:gap-1 mcs:text-sm mcs:text-muted-foreground mcs:hover:text-foreground'}>
                    <NamedIcon name={'arrow-left'} size={14} /> All players
                </PanelLink>

                <div className={'mcs:grid mcs:items-start mcs:gap-4 mcs:xl:grid-cols-[minmax(0,1fr)_360px]'}>
                    <div className={'mcs:flex mcs:min-w-0 mcs:flex-col mcs:gap-4'}>
                        {/* Who the player is and where they stand, from the last save. */}
                        <section className={'pt-surface mcs:grid mcs:overflow-hidden mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:md:grid-cols-[240px_1fr]'}>
                            <div className={'mcs:flex mcs:min-h-[280px] mcs:items-center mcs:justify-center mcs:bg-gradient-to-b mcs:from-[#5b8fd1] mcs:to-[#9ec8f0]'}>
                                {!featureEnabled('skins') ? <PlayerHead server={identifier} skinKey={uuid} className={'mcs:size-32'} /> : model ? <SkinViewer skin={model} width={220} height={300} /> : <Spinner />}
                            </div>
                            <div className={'mcs:flex mcs:min-w-0 mcs:flex-col'}>
                                <header className={'mcs:flex mcs:items-center mcs:gap-4 mcs:border-b mcs:border-border mcs:p-5'}>
                                    <PlayerHead server={identifier} skinKey={uuid} className={'mcs:size-14 mcs:shrink-0 mcs:rounded-md mcs:shadow-md'} />
                                    <div className={'mcs:min-w-0 mcs:flex-1'}>
                                        <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-2'}>
                                            <h2 className={'mcs:truncate mcs:text-2xl mcs:font-bold'}>{name}</h2>
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
                                        <p className={'mcs:mt-1 mcs:flex mcs:items-center mcs:gap-1.5 mcs:text-sm'}>
                                            <span className={cn('mcs:size-2 mcs:rounded-full', summary?.online ? 'mcs:bg-success' : 'mcs:bg-muted-foreground/60')} />
                                            <span className={summary?.online ? 'mcs:text-success' : 'mcs:text-muted-foreground'}>
                                                {summary?.online ? 'Online now' : summary?.lastSeen ? `Last seen ${formatDate(new Date(summary.lastSeen), 'MMM D, YYYY HH:mm')}` : 'Offline'}
                                            </span>
                                        </p>
                                        <CopyOnClick text={uuid}>
                                            <button type={'button'} className={'mcs:mt-1 mcs:inline-flex mcs:max-w-full mcs:cursor-pointer mcs:items-center mcs:gap-1.5 mcs:font-mono mcs:text-xs mcs:text-muted-foreground mcs:hover:text-foreground'} title={'Copy'}>
                                                <NamedIcon name={'copy'} size={12} className={'mcs:shrink-0'} />
                                                <span className={'mcs:truncate'}>{uuid}</span>
                                            </button>
                                        </CopyOnClick>
                                    </div>
                                </header>
                                {player ? (
                                    <div className={cn('mcs:grid mcs:flex-1 mcs:auto-rows-fr mcs:gap-px mcs:bg-border mcs:grid-cols-2', bedrock ? 'mcs:lg:grid-cols-2' : 'mcs:lg:grid-cols-4')}>
                                        <Fact icon={'swords'} label={'Mode'}>
                                            {prettyId(player.gameMode)}
                                        </Fact>
                                        <Fact icon={'globe'} label={'Dimension'}>
                                            {prettyId(player.dimension)}
                                        </Fact>
                                        <Fact icon={'map-pin'} label={'Position'}>
                                            {player.position ? player.position.map((value) => Math.floor(value)).join(', ') : 'Unknown'}
                                        </Fact>
                                        <Fact icon={'sparkles'} label={'Experience'}>
                                            Level {player.xpLevel} · {player.xpTotal.toLocaleString()} total
                                        </Fact>
                                        {!bedrock && (
                                            <>
                                                <Fact icon={'clock'} label={'Play time'}>
                                                    {formatTicks(custom('play_time') || custom('play_one_minute'))}
                                                </Fact>
                                                <Fact icon={'log-in'} label={'Sessions'}>
                                                    {custom('leave_game') + (summary?.online ? 1 : 0)}
                                                </Fact>
                                                <Fact icon={'skull'} label={'Deaths'}>
                                                    {custom('deaths')} · last {formatTicks(custom('time_since_death'))} ago
                                                </Fact>
                                                <Fact icon={'cake'} label={'First joined'}>
                                                    {player.firstPlayed ? formatDate(new Date(player.firstPlayed), 'MMM D, YYYY') : 'Not recorded'}
                                                </Fact>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className={'mcs:p-5'}>
                                        <Alert type={error ? 'danger' : 'info'}>
                                            {error ? `The player file could not be read: ${error}` : 'No saved data yet. It appears after the player has played and the server has saved.'}
                                        </Alert>
                                    </div>
                                )}
                            </div>
                        </section>

                        {player && (
                            <div className={'pt-surface mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:p-4 mcs:flex mcs:flex-col mcs:gap-3'}>
                                <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:justify-between mcs:gap-2'}>
                                    <div className={'prism-switch mcs:flex mcs:rounded-md mcs:bg-muted mcs:p-0.5'}>
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
                                                    'prism-switch-item mcs:inline-flex mcs:items-center mcs:gap-1.5 mcs:rounded mcs:px-3 mcs:py-1.5 mcs:text-sm mcs:cursor-pointer',
                                                    tab === value ? 'mcs:bg-primary mcs:text-primary-foreground' : 'mcs:text-muted-foreground mcs:hover:text-foreground'
                                                )}
                                            >
                                                <NamedIcon name={icon} size={14} /> {label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className={'mcs:flex mcs:gap-2'}>
                                        {list.data?.canManage && list.data.running && (
                                            <Button size={'small'} isSecondary disabled={saving} onClick={saveNow}>
                                                <NamedIcon name={'refresh-cw'} size={14} className={saving ? 'mcs:animate-spin' : undefined} /> Update
                                            </Button>
                                        )}
                                        {list.data?.canManage && !bedrock && detail.data?.dat && detail.data.hash && (
                                            <Button size={'small'} disabled={summary?.online} title={summary?.online ? 'Available while the player is offline, so the game cannot overwrite the changes' : undefined} onClick={() => setEditing(true)}>
                                                <NamedIcon name={'pencil'} size={14} /> Edit
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <div className={'mcs:flex mcs:justify-center'}>
                                    {tab === 'inventory' && <InventoryView player={player} version={version} />}
                                    {tab === 'ender' && <EnderChestView player={player} version={version} />}
                                </div>
                                {/* The hotbar, offhand and status bars under the inventory, as in game. */}
                                {tab === 'inventory' && (
                                    <div className={'mcs:flex mcs:justify-center mcs:overflow-x-auto'}>
                                        <Hud player={player} version={version} />
                                    </div>
                                )}
                                <p className={'mcs:text-xs mcs:text-muted-foreground'}>This is the last save. Online players are saved every few minutes, or right away with Update.</p>
                            </div>
                        )}
                        {!bedrock && <Advancements items={detail.data?.advancements ?? []} />}
                    </div>

                    {list.data?.canManage && summary && (
                        <ControlPanel
                            identifier={identifier}
                            player={summary}
                            state={player}
                            running={list.data.running}
                            others={list.data.players.filter((entry) => entry.online && entry.name && entry.uuid !== uuid).map((entry) => entry.name!)}
                            onDone={refresh}
                            onClearOffline={!bedrock && detail.data?.dat && detail.data.hash ? clearOffline : undefined}
                        />
                    )}
                </div>
            </div>
            {editing && detail.data?.dat && detail.data.hash && (
                <InventoryEditor server={identifier} uuid={uuid} name={name} dat={detail.data.dat} hash={detail.data.hash} version={version} initialTab={tab} onClose={() => setEditing(false)} onSaved={refresh} />
            )}
        </ServerContentBlock>
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
