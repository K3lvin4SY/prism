import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, PanelLink, ServerContentBlock, Spinner, fromNow, httpErrorToHuman } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { getPlayers, type PlayersOverview } from '../api/players';
import { duration } from '../lib/format';
import { useSatisfactoryInfo } from '../hooks/useSatisfactoryInfo';
import { NamedIcon } from '../icons';

export function Card({ title, icon, children, action }: { title: string; icon: string; children: ReactNode; action?: ReactNode }) {
    return (
        <section className={'pt-surface sfy:flex sfy:flex-col sfy:gap-3 sfy:rounded-lg sfy:border sfy:border-border sfy:bg-card sfy:p-4'}>
            <div className={'sfy:flex sfy:items-center sfy:gap-2'}>
                <NamedIcon name={icon} size={18} className={'sfy:text-primary'} />
                <h2 className={'sfy:flex-1 sfy:font-semibold'}>{title}</h2>
                {action}
            </div>
            {children}
        </section>
    );
}

export default function PlayersScreen() {
    const { identifier } = useSatisfactoryInfo();
    const players = useQuery({ queryKey: keys.players(identifier), queryFn: () => getPlayers(identifier), refetchInterval: 15_000 });

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
            <div className={'sfy:grid sfy:gap-4 sfy:lg:grid-cols-[1fr_22rem]'}>
                <div className={'sfy:flex sfy:min-w-0 sfy:flex-col sfy:gap-4'}>
                    <Card title={data.count !== null ? `Online now (${data.count}${data.limit ? ` of ${data.limit}` : ''})` : 'Online now'} icon={'users'}>
                        {!data.running ? (
                            <p className={'sfy:text-sm sfy:text-muted-foreground'}>The server is offline.</p>
                        ) : data.count === null ? (
                            <p className={'sfy:text-sm sfy:text-muted-foreground'}>Connect the Panel to the server in Properties to see who is on.</p>
                        ) : data.count === 0 ? (
                            <p className={'sfy:text-sm sfy:text-muted-foreground'}>Nobody is playing right now.</p>
                        ) : (
                            <>
                                <ul className={'sfy:flex sfy:flex-col sfy:gap-1'}>
                                    {data.online.map((name) => (
                                        <li key={name} className={'sfy:flex sfy:items-center sfy:gap-3 sfy:rounded-md sfy:px-2 sfy:py-1.5 sfy:hover:bg-muted/40'}>
                                            <span className={'sfy:size-2 sfy:rounded-full sfy:bg-success'} />
                                            <PlayerLink identifier={identifier} name={name} className={'sfy:flex-1 sfy:font-medium'} />
                                        </li>
                                    ))}
                                </ul>
                                {data.online.length < data.count && <p className={'sfy:text-xs sfy:text-muted-foreground'}>{data.count - data.online.length} more not named in the log.</p>}
                                <p className={'sfy:text-xs sfy:text-muted-foreground'}>The server counts who is connected; the names are the latest players to join.</p>
                            </>
                        )}
                    </Card>

                    <Card title={'Who has played'} icon={'history'}>
                        {data.history.length === 0 ? (
                            <p className={'sfy:text-sm sfy:text-muted-foreground'}>Nobody has joined since Prism Satisfactory started keeping track.</p>
                        ) : (
                            <ul className={'sfy:flex sfy:flex-col sfy:divide-y sfy:divide-border'}>
                                {data.history.map((player) => (
                                    <li key={player.name} className={'sfy:flex sfy:flex-wrap sfy:items-center sfy:gap-3 sfy:py-2'}>
                                        <PlayerLink identifier={identifier} name={player.name} className={'sfy:flex-1 sfy:font-medium'} />
                                        {player.online && (
                                            <Badge size={'sm'} tone={'success'}>
                                                Online
                                            </Badge>
                                        )}
                                        <span className={'sfy:text-xs sfy:text-muted-foreground'} title={`First seen ${new Date(player.firstSeen * 1000).toLocaleString()}`}>
                                            {player.online ? 'playing now' : `last seen ${fromNow(new Date(player.lastSeen * 1000).toISOString())}`}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className={'sfy:text-xs sfy:text-muted-foreground'}>Joins are read from the server's log. The dedicated server has no kick or ban; players are managed in the game's server manager.</p>
                    </Card>
                </div>

                <GameCard data={data} />
            </div>
        </ServerContentBlock>
    );
}

function GameCard({ data }: { data: PlayersOverview }) {
    const game = data.game;

    return (
        <Card title={'The game'} icon={'factory'}>
            {!game ? (
                <p className={'sfy:text-sm sfy:text-muted-foreground'}>{data.running ? 'Connect the Panel to the server in Properties to see the game.' : 'The server is offline.'}</p>
            ) : !game.running ? (
                <p className={'sfy:text-sm sfy:text-muted-foreground'}>No game is loaded yet. Start one in Properties, or from the game's server manager.</p>
            ) : (
                <dl className={'sfy:grid sfy:grid-cols-[auto_1fr] sfy:gap-x-4 sfy:gap-y-1.5 sfy:text-sm'}>
                    <dt className={'sfy:text-muted-foreground'}>Session</dt>
                    <dd className={'sfy:truncate sfy:font-medium'}>{game.session}</dd>
                    <dt className={'sfy:text-muted-foreground'}>Tier</dt>
                    <dd>{game.tier}</dd>
                    <dt className={'sfy:text-muted-foreground'}>Played</dt>
                    <dd>{duration(game.duration)}</dd>
                    <dt className={'sfy:text-muted-foreground'}>Tick rate</dt>
                    <dd>{game.tickRate} / s</dd>
                    <dt className={'sfy:text-muted-foreground'}>State</dt>
                    <dd>{game.paused ? 'Paused' : 'Running'}</dd>
                </dl>
            )}
        </Card>
    );
}

/** A player's name, linking to their page. */
export function PlayerLink({ identifier, name, className }: { identifier: string; name: string; className?: string }) {
    return (
        <PanelLink destination={{ extension: 'prism-satisfactory', screen: 'player', params: { id: identifier, player: name } }} className={`${className ?? ''} sfy:truncate sfy:hover:underline`}>
            {name}
        </PanelLink>
    );
}
