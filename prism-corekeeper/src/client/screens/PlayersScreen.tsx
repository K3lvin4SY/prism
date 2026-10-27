import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Input, ServerContentBlock, Spinner, fromNow, httpErrorToHuman, toast, useServerPermission } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { getPlayers, setAdmins, type PlayersOverview } from '../api/players';
import { useCoreKeeperInfo } from '../hooks/useCoreKeeperInfo';
import { NamedIcon } from '../icons';

function Card({ title, icon, children, action }: { title: string; icon: string; children: ReactNode; action?: ReactNode }) {
    return (
        <section className={'pt-surface cks:flex cks:flex-col cks:gap-3 cks:rounded-lg cks:border cks:border-border cks:bg-card cks:p-4'}>
            <div className={'cks:flex cks:items-center cks:gap-2'}>
                <NamedIcon name={icon} size={18} className={'cks:text-primary'} />
                <h2 className={'cks:flex-1 cks:font-semibold'}>{title}</h2>
                {action}
            </div>
            {children}
        </section>
    );
}

function Copy({ value, label }: { value: string; label: string }) {
    return (
        <button
            type={'button'}
            onClick={() =>
                void navigator.clipboard
                    .writeText(value)
                    .then(() => toast.success(`${label} copied.`))
                    .catch(() => toast.error('Could not copy.'))
            }
            className={'cks:inline-flex cks:items-center cks:gap-2 cks:rounded-md cks:border cks:border-border cks:bg-muted/40 cks:px-3 cks:py-1.5 cks:font-mono cks:text-sm cks:cursor-pointer cks:hover:bg-muted'}
            title={`Copy ${label.toLowerCase()}`}
        >
            {value}
            <NamedIcon name={'copy'} size={14} className={'cks:text-muted-foreground'} />
        </button>
    );
}

export default function PlayersScreen() {
    const { identifier } = useCoreKeeperInfo();
    const players = useQuery({ queryKey: keys.players(identifier), queryFn: () => getPlayers(identifier), refetchInterval: 10_000 });

    if (players.isLoading) {
        return (
            <ServerContentBlock title={'Players'}>
                <Spinner centered />
            </ServerContentBlock>
        );
    }

    if (players.isError || !players.data) {
        return (
            <ServerContentBlock title={'Players'}>
                <Alert type={'danger'}>{httpErrorToHuman(players.error)}</Alert>
            </ServerContentBlock>
        );
    }

    const data = players.data;

    return (
        <ServerContentBlock title={'Players'}>
            <div className={'cks:grid cks:gap-4 cks:lg:grid-cols-[1fr_22rem]'}>
                <div className={'cks:flex cks:min-w-0 cks:flex-col cks:gap-4'}>
                    <Card title={data.running ? `Online now (${data.online.length})` : 'Online now'} icon={'users'}>
                        {!data.running ? (
                            <p className={'cks:text-sm cks:text-muted-foreground'}>The server is offline.</p>
                        ) : data.online.length === 0 ? (
                            <p className={'cks:text-sm cks:text-muted-foreground'}>Nobody is playing right now.</p>
                        ) : (
                            <ul className={'cks:flex cks:flex-col cks:gap-1'}>
                                {data.online.map((player) => (
                                    <li key={player.id} className={'cks:flex cks:items-center cks:gap-3 cks:rounded-md cks:px-2 cks:py-1.5 cks:hover:bg-muted/40'}>
                                        <span className={'cks:size-2 cks:rounded-full cks:bg-success'} />
                                        <span className={'cks:flex-1 cks:font-medium'}>{player.name}</span>
                                        <span className={'cks:text-xs cks:text-muted-foreground'}>player {player.id}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    <Card title={'Who has played'} icon={'history'}>
                        {data.history.length === 0 ? (
                            <p className={'cks:text-sm cks:text-muted-foreground'}>Nobody has joined since Prism Core Keeper started keeping track.</p>
                        ) : (
                            <ul className={'cks:flex cks:flex-col cks:divide-y cks:divide-border'}>
                                {data.history.map((player) => (
                                    <li key={player.id} className={'cks:flex cks:flex-wrap cks:items-center cks:gap-3 cks:py-2'}>
                                        <span className={'cks:flex-1 cks:font-medium'}>{player.name}</span>
                                        {player.online && (
                                            <Badge size={'sm'} tone={'success'}>
                                                Online
                                            </Badge>
                                        )}
                                        <span className={'cks:text-xs cks:text-muted-foreground'} title={`First seen ${new Date(player.firstSeen * 1000).toLocaleString()}`}>
                                            {player.online ? 'playing now' : `last seen ${fromNow(new Date(player.lastSeen * 1000).toISOString())}`}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className={'cks:text-xs cks:text-muted-foreground'}>Characters are saved on the players' own computers, so the server only knows names and when they were here.</p>
                    </Card>
                </div>

                <div className={'cks:flex cks:flex-col cks:gap-4'}>
                    <JoinCard data={data} />
                    <AdminsCard identifier={identifier} data={data} />
                </div>
            </div>
        </ServerContentBlock>
    );
}

function JoinCard({ data }: { data: PlayersOverview }) {
    return (
        <Card title={'How to join'} icon={'log-in'}>
            {data.join.gameId ? (
                <div className={'cks:flex cks:flex-col cks:gap-1.5'}>
                    <span className={'cks:text-sm cks:text-muted-foreground'}>Steam players: Join game, then this Game ID</span>
                    <Copy value={data.join.gameId} label={'Game ID'} />
                </div>
            ) : (
                <p className={'cks:text-sm cks:text-muted-foreground'}>The Game ID shows here once the server has started.</p>
            )}
            {data.join.direct && (
                <div className={'cks:flex cks:flex-col cks:gap-1.5'}>
                    <span className={'cks:text-sm cks:text-muted-foreground'}>Other players: Join via IP, and paste this into the IP field</span>
                    <Copy value={data.join.direct.paste} label={'Address and password'} />
                </div>
            )}
            {data.join.gameId && <p className={'cks:text-xs cks:text-muted-foreground'}>Without a fixed Game ID (Properties), a new one is made each start.</p>}
        </Card>
    );
}

function AdminsCard({ identifier, data }: { identifier: string; data: PlayersOverview }) {
    const canManage = useServerPermission('ext.prism-corekeeper.players-manage');
    const queryClient = useQueryClient();
    const [adding, setAdding] = useState('');
    const [busy, setBusy] = useState(false);

    const save = async (admins: string[]) => {
        setBusy(true);
        try {
            await setAdmins(identifier, admins);
            await queryClient.invalidateQueries({ queryKey: keys.players(identifier) });
            setAdding('');
            toast.success('Admins saved. They apply after the next restart.');
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card title={'Admins'} icon={'shield'}>
            <p className={'cks:text-xs cks:text-muted-foreground'}>Admins can use the server's admin commands in the game chat. Add them by their player ID, such as a SteamID64.</p>
            {!data.adminsFile ? (
                <p className={'cks:text-sm cks:text-muted-foreground'}>Start the server once so it writes its admin list.</p>
            ) : (
                <>
                    {data.admins.length === 0 && <p className={'cks:text-sm cks:text-muted-foreground'}>No admins yet.</p>}
                    <ul className={'cks:flex cks:flex-col cks:gap-1'}>
                        {data.admins.map((admin) => (
                            <li key={admin} className={'cks:flex cks:items-center cks:gap-2 cks:rounded-md cks:px-2 cks:py-1 cks:hover:bg-muted/40'}>
                                <span className={'cks:flex-1 cks:font-mono cks:text-sm'}>{admin}</span>
                                {canManage && (
                                    <Button.Text size={'small'} disabled={busy} onClick={() => void save(data.admins.filter((entry) => entry !== admin))} aria-label={`Remove ${admin}`}>
                                        <NamedIcon name={'x'} size={14} />
                                    </Button.Text>
                                )}
                            </li>
                        ))}
                    </ul>
                    {canManage && (
                        <form
                            className={'cks:flex cks:gap-2'}
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (adding.trim()) void save([...data.admins, adding.trim()]);
                            }}
                        >
                            <Input value={adding} onChange={(event) => setAdding(event.target.value)} placeholder={'76561198…'} className={'cks:flex-1 cks:font-mono'} />
                            <Button type={'submit'} size={'small'} isLoading={busy} disabled={!/^[A-Za-z0-9:_.-]+$/.test(adding.trim())}>
                                Add
                            </Button>
                        </form>
                    )}
                </>
            )}
        </Card>
    );
}
