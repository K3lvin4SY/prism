import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    Badge,
    Button,
    Input,
    ListRow,
    NamedIcon,
    ServerContentBlock,
    Spinner,
    Switch,
    TitledGreyBox,
    cn,
    fromNow,
    httpErrorToHuman,
    toast,
} from '@pterodactyl/sdk';
import { getPlayers, playerAction, playerKeys, setWhitelist, type PlayerEvent, type PlayerSummary } from '../api/players';
import PlayerHead from '../components/players/PlayerHead';
import { useMcInfo } from '../hooks/useMcInfo';

type Filter = 'everyone' | 'online' | 'whitelist' | 'banned';

const PAGE_SIZE = 10;

const EVENT_TEXT: Record<PlayerEvent['event'], { text: string; tone: string }> = {
    joined: { text: 'joined', tone: 'mcs:text-success' },
    left: { text: 'left', tone: 'mcs:text-muted-foreground' },
    lost: { text: 'lost connection', tone: 'mcs:text-muted-foreground' },
    kicked: { text: 'was kicked', tone: 'mcs:text-warning' },
    banned: { text: 'was banned', tone: 'mcs:text-destructive' },
    unbanned: { text: 'was unbanned', tone: 'mcs:text-primary' },
    opped: { text: 'was made an operator', tone: 'mcs:text-warning' },
    deopped: { text: 'is no longer an operator', tone: 'mcs:text-muted-foreground' },
    whitelisted: { text: 'was whitelisted', tone: 'mcs:text-primary' },
    unwhitelisted: { text: 'was removed from the whitelist', tone: 'mcs:text-muted-foreground' },
};

export default function PlayersScreen() {
    const { identifier } = useMcInfo();
    const queryClient = useQueryClient();
    const [filter, setFilter] = useState<Filter>('everyone');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [newName, setNewName] = useState('');

    const players = useQuery({ queryKey: playerKeys.list(identifier), queryFn: () => getPlayers(identifier), refetchInterval: 15_000 });
    const refresh = () => queryClient.invalidateQueries({ queryKey: playerKeys.list(identifier) });

    const whitelist = useMutation({
        mutationFn: (enabled: boolean) => setWhitelist(identifier, enabled),
        onSuccess: refresh,
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });
    const addToWhitelist = useMutation({
        mutationFn: (name: string) => playerAction(identifier, 'whitelist-add', { name }),
        onSuccess: () => {
            toast.success(`${newName} is whitelisted.`);
            setNewName('');
            window.setTimeout(refresh, 1500);
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });

    const data = players.data;
    const counts = useMemo(
        () => ({
            everyone: data?.players.length ?? 0,
            online: data?.players.filter((player) => player.online).length ?? 0,
            whitelist: data?.players.filter((player) => player.whitelisted).length ?? 0,
            banned: data?.players.filter((player) => player.banned).length ?? 0,
        }),
        [data]
    );

    if (players.isLoading) {
        return (
            <ServerContentBlock title={'Players'}>
                <Spinner centered />
            </ServerContentBlock>
        );
    }

    if (players.isError || !data) {
        return (
            <ServerContentBlock title={'Players'}>
                <Alert type={'danger'}>{httpErrorToHuman(players.error)}</Alert>
            </ServerContentBlock>
        );
    }

    const term = search.trim().toLowerCase();
    const list = data.players.filter(
        (player) =>
            (filter === 'everyone' || (filter === 'online' && player.online) || (filter === 'whitelist' && player.whitelisted) || (filter === 'banned' && player.banned)) &&
            (term === '' || (player.name ?? '').toLowerCase().includes(term) || (player.uuid ?? '').includes(term))
    );
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const shown = list.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE);
    const isBedrock = data.edition === 'bedrock';

    return (
        <ServerContentBlock title={'Players'}>
            <div className={'mcs:grid mcs:gap-4 mcs:lg:grid-cols-[1fr_300px]'}>
                <div className={'mcs:flex mcs:flex-col mcs:gap-3 mcs:min-w-0'}>
                    <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-2'}>
                        <div className={'prism-switch mcs:flex mcs:rounded-md mcs:bg-card mcs:border mcs:border-border mcs:p-0.5'}>
                            {(['everyone', 'online', 'whitelist', 'banned'] as const)
                                .filter((value) => !(isBedrock && value === 'banned'))
                                .map((value) => (
                                    <button
                                        key={value}
                                        type={'button'}
                                        onClick={() => {
                                            setFilter(value);
                                            setPage(1);
                                        }}
                                        className={cn(
                                            'prism-switch-item mcs:rounded mcs:px-3 mcs:py-1.5 mcs:text-sm mcs:cursor-pointer mcs:capitalize',
                                            filter === value ? 'mcs:bg-primary mcs:text-primary-foreground' : 'mcs:text-muted-foreground mcs:hover:text-foreground'
                                        )}
                                    >
                                        {value === 'whitelist' && isBedrock ? 'Allowlist' : value} {counts[value]}
                                    </button>
                                ))}
                        </div>
                        <div className={'mcs:relative mcs:ml-auto mcs:w-full mcs:sm:w-64'}>
                            <NamedIcon name={'search'} size={16} className={'mcs:absolute mcs:left-3 mcs:top-1/2 mcs:-translate-y-1/2 mcs:text-muted-foreground mcs:pointer-events-none'} />
                            <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={'Find a player'} className={'mcs:w-full mcs:pl-9'} />
                        </div>
                    </div>

                    {shown.length === 0 ? (
                        <div className={'mcs:rounded-md mcs:border mcs:border-border mcs:bg-card mcs:p-8 mcs:text-center mcs:text-sm mcs:text-muted-foreground'}>
                            {data.players.length === 0 ? 'Nobody has joined this server yet.' : 'No players match.'}
                        </div>
                    ) : (
                        <div className={'mcs:flex mcs:flex-col mcs:gap-2'}>
                            {shown.map((player) => (
                                <PlayerRow key={player.uuid ?? player.name} identifier={identifier} player={player} linkable={!!player.uuid} />
                            ))}
                        </div>
                    )}

                    {pages > 1 && (
                        <div className={'mcs:flex mcs:items-center mcs:justify-center mcs:gap-1'}>
                            {Array.from({ length: pages }, (_, index) => index + 1).map((value) => (
                                <button
                                    key={value}
                                    type={'button'}
                                    onClick={() => setPage(value)}
                                    className={cn(
                                        'mcs:size-8 mcs:rounded-full mcs:text-sm mcs:cursor-pointer',
                                        value === Math.min(page, pages) ? 'mcs:bg-primary mcs:text-primary-foreground' : 'mcs:hover:bg-muted'
                                    )}
                                >
                                    {value}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                    <TitledGreyBox title={'Online now'}>
                        {data.running ? (
                            <>
                                <p className={'mcs:text-3xl mcs:font-bold mcs:text-success'}>
                                    {data.online.count} <span className={'mcs:text-sm mcs:font-normal mcs:text-muted-foreground'}>of {data.online.max} slots</span>
                                </p>
                                <div className={'mcs:mt-2 mcs:h-1.5 mcs:rounded-full mcs:bg-muted'}>
                                    <div className={'mcs:h-full mcs:rounded-full mcs:bg-success'} style={{ width: `${Math.min(100, (data.online.count / Math.max(1, data.online.max)) * 100)}%` }} />
                                </div>
                                <p className={'mcs:mt-2 mcs:text-xs mcs:text-muted-foreground'}>{data.online.source === 'ping' ? 'Asked the server directly.' : 'Read from the server log.'}</p>
                            </>
                        ) : (
                            <p className={'mcs:text-sm mcs:text-muted-foreground'}>The server is offline. Op, whitelist and ban changes are written to its files and apply on the next start.</p>
                        )}
                    </TitledGreyBox>

                    <TitledGreyBox title={isBedrock ? 'Allowlist' : 'Whitelist'}>
                        <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
                            <Switch
                                checked={data.whitelist}
                                disabled={!data.canManage || whitelist.isPending}
                                onChange={(checked) => whitelist.mutate(checked)}
                                label={data.whitelist ? 'On' : 'Off'}
                                description={`Only ${isBedrock ? 'allowlisted' : 'whitelisted'} players can join. ${counts.whitelist} listed.`}
                            />
                            {data.canManage && (
                                <form
                                    className={'mcs:flex mcs:gap-2'}
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        if (newName.trim()) addToWhitelist.mutate(newName.trim());
                                    }}
                                >
                                    <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={'Player name'} className={'mcs:flex-1 mcs:min-w-0'} />
                                    <Button type={'submit'} isLoading={addToWhitelist.isPending} disabled={!newName.trim()}>
                                        Add
                                    </Button>
                                </form>
                            )}
                        </div>
                    </TitledGreyBox>

                    <TitledGreyBox title={'Recent activity'}>
                        {data.activity.length === 0 ? (
                            <p className={'mcs:text-sm mcs:text-muted-foreground'}>Nothing in the current log yet.</p>
                        ) : (
                            <ul className={'mcs:flex mcs:flex-col mcs:gap-1.5 mcs:max-h-80 mcs:overflow-y-auto'}>
                                {data.activity.map((event, index) => (
                                    <li key={index} className={'mcs:flex mcs:items-center mcs:gap-2 mcs:text-sm'}>
                                        <PlayerHead server={identifier} skinKey={event.id ?? event.name} className={'mcs:size-5 mcs:shrink-0'} />
                                        <span className={'mcs:min-w-0 mcs:flex-1 mcs:truncate'} title={event.detail ?? undefined}>
                                            <strong>{event.name}</strong> <span className={EVENT_TEXT[event.event].tone}>{EVENT_TEXT[event.event].text}</span>
                                        </span>
                                        {event.time && <span className={'mcs:text-xs mcs:text-muted-foreground mcs:font-mono'}>{event.time}</span>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </TitledGreyBox>
                </div>
            </div>
        </ServerContentBlock>
    );
}

function PlayerRow({ identifier, player, linkable }: { identifier: string; player: PlayerSummary; linkable: boolean }) {
    const content = (
        <>
            <ListRow.Icon>
                <PlayerHead server={identifier} skinKey={player.uuid ?? player.name} className={'mcs:size-9'} />
            </ListRow.Icon>
            <div className={'mcs:min-w-0 mcs:flex-1'}>
                <ListRow.Title>{player.name ?? 'Unknown player'}</ListRow.Title>
                <ListRow.Description>
                    <span className={'mcs:font-mono mcs:text-xs'}>{player.uuid ?? 'No id seen yet'}</span>
                </ListRow.Description>
            </div>
            <div className={'mcs:flex mcs:flex-wrap mcs:justify-end mcs:gap-1.5'}>
                {player.online && (
                    <Badge size={'sm'} tone={'success'}>
                        Online
                    </Badge>
                )}
                {player.op !== null && (
                    <Badge size={'sm'} tone={'warning'}>
                        OP
                    </Badge>
                )}
                {player.whitelisted && (
                    <Badge size={'sm'} tone={'info'}>
                        Whitelisted
                    </Badge>
                )}
                {player.banned && (
                    <Badge size={'sm'} tone={'danger'} title={player.banned.reason ?? undefined}>
                        Banned
                    </Badge>
                )}
                {!player.online && player.lastSeen && <span className={'mcs:text-xs mcs:text-muted-foreground'}>{fromNow(player.lastSeen)}</span>}
            </div>
        </>
    );

    return linkable ? (
        <ListRow destination={{ extension: 'prism-mc', screen: 'player', params: { id: identifier, player: player.uuid! } }} interactive>
            {content}
        </ListRow>
    ) : (
        <ListRow>{content}</ListRow>
    );
}
