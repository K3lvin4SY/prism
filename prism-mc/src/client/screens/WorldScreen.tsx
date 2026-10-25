import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Alert, Badge, PanelLink, ServerContentBlock, Spinner, cn, fromNow, httpErrorToHuman } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { getPlayer, getPlayers, playerKeys, type PlayerSummary } from '../api/players';
import PlayerHead from '../components/players/PlayerHead';
import WorldMap, { toDimension, type Dimension, type Focus, type Marker } from '../components/WorldMap';
import { useMcInfo } from '../hooks/useMcInfo';
import { base64ToBytes, readNbtFile } from '../lib/nbt';
import { readPlayer } from '../lib/player';

/** Player files read for the map; the most recently seen first. */
const MAX_PLAYERS = 60;

const DIMENSION_NAMES: Record<Dimension, string> = { overworld: 'Overworld', the_nether: 'Nether', the_end: 'End' };

/** Reads where a player was at their last save from their player file. */
async function locate(dat: string): Promise<{ position: [number, number, number]; dimension: Dimension } | null> {
    const player = readPlayer(await readNbtFile(base64ToBytes(dat)));

    return player.position ? { position: player.position, dimension: toDimension(player.dimension) } : null;
}

/** The world map with every player on it, and the list of players to jump to. */
export default function WorldScreen() {
    const { identifier, info } = useMcInfo();
    const [focus, setFocus] = useState<Focus | null>(null);
    const list = useQuery({ queryKey: playerKeys.list(identifier), queryFn: () => getPlayers(identifier), refetchInterval: 30_000, retry: false });

    const players = useMemo(
        () =>
            (list.data?.players ?? [])
                .filter((player): player is PlayerSummary & { uuid: string } => !!player.uuid && player.hasData)
                .sort((a, b) => Number(b.online) - Number(a.online) || (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''))
                .slice(0, MAX_PLAYERS),
        [list.data]
    );

    const files = useQueries({
        queries: players.map((player) => ({
            queryKey: [...playerKeys.detail(identifier, player.uuid), 'location'],
            queryFn: async () => {
                const detail = await getPlayer(identifier, player.uuid);

                return detail.dat ? locate(detail.dat) : null;
            },
            staleTime: 60_000,
            refetchInterval: 60_000,
        })),
    });

    const markers: Marker[] = players.flatMap((player, index) => {
        const where = files[index]?.data;

        return where ? [{ key: player.uuid, name: player.name ?? player.uuid, online: player.online, position: where.position, dimension: where.dimension }] : [];
    });
    const reading = files.some((file) => file.isLoading);

    // Start on the first player with a known position.
    useEffect(() => {
        if (focus || markers.length === 0) return;
        setFocus({ dimension: markers[0].dimension, x: markers[0].position[0], z: markers[0].position[2], at: Date.now() });
    }, [markers, focus]);

    if (info?.edition === 'bedrock') {
        return (
            <ServerContentBlock title={'World'}>
                <Alert type={'info'}>The map is drawn from Java region files, so Bedrock worlds have none.</Alert>
            </ServerContentBlock>
        );
    }

    const counts = markers.reduce<Record<string, number>>((all, marker) => ({ ...all, [marker.dimension]: (all[marker.dimension] ?? 0) + 1 }), {});

    return (
        <ServerContentBlock title={'World'}>
            <div className={'mcs:grid mcs:gap-4 mcs:xl:grid-cols-[minmax(0,1fr)_300px]'}>
                <div className={'mcs:flex mcs:min-w-0 mcs:flex-col mcs:gap-3 mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:p-4'}>
                    <WorldMap server={identifier} markers={markers} focus={focus} />
                    <p className={'mcs:text-xs mcs:text-muted-foreground'}>
                        Players are shown where they were at their last save; online players are saved every few minutes. Online players have a green border.
                    </p>
                </div>

                <div className={'mcs:flex mcs:flex-col mcs:gap-3 mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:p-4'}>
                    <div className={'mcs:flex mcs:items-center mcs:justify-between mcs:gap-2'}>
                        <h3 className={'mcs:text-sm mcs:font-semibold'}>Players</h3>
                        {reading && <Spinner size={'small'} />}
                    </div>
                    {list.isError ? (
                        <p className={'mcs:text-sm mcs:text-muted-foreground'}>{(list.error as { response?: { status?: number } }).response?.status === 403 ? 'You need permission to see players to have them on the map.' : httpErrorToHuman(list.error)}</p>
                    ) : list.isLoading ? (
                        <Spinner centered />
                    ) : players.length === 0 ? (
                        <p className={'mcs:text-sm mcs:text-muted-foreground'}>No player has saved data on this server yet.</p>
                    ) : (
                        <>
                            <div className={'mcs:flex mcs:flex-wrap mcs:gap-1.5'}>
                                {(Object.keys(DIMENSION_NAMES) as Dimension[]).map((dimension) => (
                                    <Badge key={dimension} size={'sm'} tone={'neutral'}>
                                        {DIMENSION_NAMES[dimension]} {counts[dimension] ?? 0}
                                    </Badge>
                                ))}
                            </div>
                            <ul className={'mcs:flex mcs:max-h-[520px] mcs:flex-col mcs:gap-1 mcs:overflow-y-auto'}>
                                {players.map((player, index) => {
                                    const where = files[index]?.data;

                                    return (
                                        <li key={player.uuid} className={'mcs:flex mcs:items-center mcs:gap-2'}>
                                            <button
                                                type={'button'}
                                                disabled={!where}
                                                onClick={() => where && setFocus({ dimension: where.dimension, x: where.position[0], z: where.position[2], at: Date.now() })}
                                                className={cn('mcs:flex mcs:min-w-0 mcs:flex-1 mcs:items-center mcs:gap-2 mcs:rounded-md mcs:px-2 mcs:py-1.5 mcs:text-left mcs:hover:bg-muted mcs:disabled:cursor-default mcs:disabled:hover:bg-transparent', where && 'mcs:cursor-pointer')}
                                                title={where ? 'Show on the map' : undefined}
                                            >
                                                <PlayerHead server={identifier} skinKey={player.uuid} className={cn('mcs:size-7 mcs:shrink-0', player.online && 'mcs:outline-2 mcs:outline-[#55ff55]')} />
                                                <span className={'mcs:min-w-0 mcs:flex-1'}>
                                                    <span className={'mcs:block mcs:truncate mcs:text-sm mcs:font-medium'}>{player.name ?? player.uuid}</span>
                                                    <span className={'mcs:block mcs:truncate mcs:text-xs mcs:text-muted-foreground'}>
                                                        {where
                                                            ? `${DIMENSION_NAMES[where.dimension]} · ${Math.round(where.position[0])}, ${Math.round(where.position[1])}, ${Math.round(where.position[2])}`
                                                            : files[index]?.isLoading
                                                              ? 'Reading…'
                                                              : 'Position unknown'}
                                                    </span>
                                                </span>
                                                <span className={'mcs:shrink-0 mcs:text-xs mcs:text-muted-foreground'}>{player.online ? 'Online' : player.lastSeen ? fromNow(player.lastSeen) : ''}</span>
                                            </button>
                                            <PanelLink destination={{ extension: 'prism-mc', screen: 'player', params: { id: identifier, player: player.uuid } }} className={'mcs:shrink-0 mcs:text-muted-foreground mcs:hover:text-foreground'} title={'Open the player'}>
                                                <NamedIcon name={'chevron-right'} size={16} />
                                            </PanelLink>
                                        </li>
                                    );
                                })}
                            </ul>
                            {(list.data?.players.filter((player) => player.hasData).length ?? 0) > MAX_PLAYERS && <p className={'mcs:text-xs mcs:text-muted-foreground'}>The {MAX_PLAYERS} most recently seen players are on the map.</p>}
                        </>
                    )}
                </div>
            </div>
        </ServerContentBlock>
    );
}
