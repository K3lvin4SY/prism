import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, PanelLink, ServerContentBlock, Spinner, fromNow, httpErrorToHuman } from '@pterodactyl/sdk';
import { bytes, keys } from '../api/client';
import { getMap, getMapFile, type MapOverview, type PlayerSync } from '../api/map';
import ServerMap from '../components/ServerMap';
import { useCoreKeeperInfo } from '../hooks/useCoreKeeperInfo';
import { NamedIcon } from '../icons';
import { gunzip, parseMapParts, type MapPart } from '../lib/mapparts';

const when = (seconds: number) => fromNow(new Date(seconds * 1000).toISOString());

/** The map file, fetched and read again whenever the server saves a new one. */
function useMapParts(identifier: string, modified: string | null | undefined, enabled: boolean) {
    const [state, setState] = useState<{ parts: MapPart[] | null; error: string | null }>({ parts: null, error: null });

    useEffect(() => {
        if (!enabled) return;
        let stale = false;
        getMapFile(identifier)
            .then(gunzip)
            .then(parseMapParts)
            .then((parts) => !stale && setState({ parts, error: null }))
            .catch((error: unknown) => !stale && setState({ parts: null, error: error instanceof Error && !('response' in error) ? error.message : httpErrorToHuman(error) }));

        return () => {
            stale = true;
        };
    }, [identifier, modified, enabled]);

    return state;
}

export default function MapScreen() {
    const { identifier } = useCoreKeeperInfo();
    const overview = useQuery({ queryKey: keys.map(identifier), queryFn: () => getMap(identifier), refetchInterval: 30_000 });
    const data = overview.data;
    const drawable = !!data?.map && !data.map.tooLarge;
    const { parts, error } = useMapParts(identifier, data?.map?.modified, drawable);

    if (overview.isLoading) {
        return (
            <ServerContentBlock title={'Map'}>
                <Spinner centered />
            </ServerContentBlock>
        );
    }

    if (overview.isError || !data) {
        return (
            <ServerContentBlock title={'Map'}>
                <Alert type={'danger'}>{httpErrorToHuman(overview.error)}</Alert>
            </ServerContentBlock>
        );
    }

    return (
        <ServerContentBlock title={'Map'}>
            <div className={'cks:grid cks:gap-4 cks:lg:grid-cols-[1fr_20rem]'}>
                <div className={'cks:flex cks:min-w-0 cks:flex-col cks:gap-4'}>
                    <Header data={data} explored={parts?.length ?? null} />
                    {!data.map ? (
                        <Empty />
                    ) : data.map.tooLarge ? (
                        <Alert type={'warning'}>The shared map is {bytes(data.map.size)}, too large to draw here.</Alert>
                    ) : error ? (
                        <Alert type={'warning'}>{error}</Alert>
                    ) : parts ? (
                        <ServerMap parts={parts} />
                    ) : (
                        <div className={'cks:flex cks:h-96 cks:items-center cks:justify-center'}>
                            <Spinner />
                        </div>
                    )}
                </div>
                <LatestSyncs identifier={identifier} data={data} />
            </div>
        </ServerContentBlock>
    );
}

function Header({ data, explored }: { data: MapOverview; explored: number | null }) {
    const last = data.latest[0];
    const modified = data.map?.modified ? new Date(data.map.modified).getTime() / 1000 : null;
    // The server saves the map moments after a sync, so the newest sync close to the file's time made it.
    const by = last && modified !== null && Math.abs(modified - last.at) < 300 ? last : null;

    return (
        <div className={'pt-surface cks:flex cks:flex-wrap cks:items-center cks:gap-4 cks:rounded-md cks:border cks:border-border cks:bg-card cks:p-4'}>
            <span className={'cks:flex cks:size-12 cks:items-center cks:justify-center cks:rounded-lg cks:bg-primary/15 cks:text-primary'}>
                <NamedIcon name={'map'} size={22} />
            </span>
            <div className={'cks:min-w-0 cks:flex-1'}>
                <p className={'cks:text-lg cks:font-semibold'}>Shared map from the Cartography Table</p>
                <p className={'cks:text-xs cks:text-muted-foreground'}>
                    {data.world ?? 'World'} · slot {data.slot}
                    {modified !== null && ` · updated ${when(modified)}`}
                    {by && ` by ${by.name}${by.exact ? '' : ' (likely)'}`}
                    {explored !== null && ` · ${explored} ${explored === 1 ? 'part' : 'parts'} explored`}
                </p>
            </div>
        </div>
    );
}

function Empty() {
    return (
        <div className={'pt-surface cks:flex cks:flex-col cks:items-center cks:gap-3 cks:rounded-lg cks:border cks:border-dashed cks:border-border cks:bg-card cks:p-10 cks:text-center'}>
            <NamedIcon name={'map'} size={36} className={'cks:text-muted-foreground'} />
            <p className={'cks:max-w-lg cks:text-sm cks:text-muted-foreground'}>
                Nobody has added their map at a Cartography Table yet. Place one in the world, use it and add your map: the server saves the shared map right away, and it shows here.
            </p>
        </div>
    );
}

function LatestSyncs({ identifier, data }: { identifier: string; data: MapOverview }) {
    return (
        <section className={'pt-surface cks:flex cks:flex-col cks:gap-3 cks:self-start cks:rounded-lg cks:border cks:border-border cks:bg-card cks:p-4'}>
            <div className={'cks:flex cks:items-center cks:gap-2'}>
                <NamedIcon name={'refresh-cw'} size={18} className={'cks:text-primary'} />
                <h2 className={'cks:flex-1 cks:font-semibold'}>Latest sync</h2>
            </div>
            {data.latest.length === 0 ? (
                <p className={'cks:text-sm cks:text-muted-foreground'}>No syncs yet.</p>
            ) : (
                <ul className={'cks:flex cks:flex-col cks:gap-0.5'}>
                    {data.latest.map((sync) => (
                        <SyncRow key={sync.id} identifier={identifier} sync={sync} />
                    ))}
                </ul>
            )}
            <p className={'cks:text-xs cks:text-muted-foreground'}>
                {data.serverMod
                    ? 'The Prism server mod sees who uses a Cartography Table. Syncs from before it was on are marked likely.'
                    : 'The map file does not say who added to it, so a sync is credited to the players here when it changed. Turn on the Prism server mod in Properties to know for sure.'}
            </p>
        </section>
    );
}

function SyncRow({ identifier, sync }: { identifier: string; sync: PlayerSync }) {
    return (
        <li>
            <PanelLink
                destination={{ extension: 'prism-corekeeper', screen: 'player', params: { id: identifier, player: sync.id } }}
                className={'cks:flex cks:items-center cks:gap-2 cks:rounded-md cks:px-2 cks:py-1.5 cks:hover:bg-muted/40'}
            >
                <span className={`cks:size-2 cks:rounded-full ${sync.online ? 'cks:bg-success' : 'cks:bg-muted-foreground/40'}`} />
                <span className={'cks:min-w-0 cks:flex-1 cks:truncate cks:text-sm cks:font-medium'}>{sync.name}</span>
                {!sync.exact && (
                    <Badge size={'sm'} tone={'neutral'} title={'Credited because they were on the server when the map changed'}>
                        likely
                    </Badge>
                )}
                <span className={'cks:text-xs cks:text-muted-foreground'}>{when(sync.at)}</span>
            </PanelLink>
        </li>
    );
}
