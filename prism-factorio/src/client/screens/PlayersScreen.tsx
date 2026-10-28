import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Input, PanelLink, ServerContentBlock, Spinner, fromNow, httpErrorToHuman, useServerPermission } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { getPlayers, validName } from '../api/players';
import { usePlayerAction } from '../hooks/usePlayerAction';
import { useFactorioInfo } from '../hooks/useFactorioInfo';
import { NamedIcon } from '../icons';

export function Card({ title, icon, children, action }: { title: string; icon: string; children: ReactNode; action?: ReactNode }) {
    return (
        <section className={'pt-surface fct:flex fct:flex-col fct:gap-3 fct:rounded-lg fct:border fct:border-border fct:bg-card fct:p-4'}>
            <div className={'fct:flex fct:items-center fct:gap-2'}>
                <NamedIcon name={icon} size={18} className={'fct:text-primary'} />
                <h2 className={'fct:flex-1 fct:font-semibold'}>{title}</h2>
                {action}
            </div>
            {children}
        </section>
    );
}

export default function PlayersScreen() {
    const { identifier } = useFactorioInfo();
    const players = useQuery({ queryKey: keys.players(identifier), queryFn: () => getPlayers(identifier), refetchInterval: 10_000 });
    const canManage = useServerPermission('ext.prism-factorio.players-manage');
    const { act, busy } = usePlayerAction(identifier);

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
            <div className={'fct:grid fct:gap-4 fct:lg:grid-cols-[1fr_22rem]'}>
                <div className={'fct:flex fct:min-w-0 fct:flex-col fct:gap-4'}>
                    <Card title={data.running ? `Online now (${data.online.length})` : 'Online now'} icon={'users'}>
                        {!data.running ? (
                            <p className={'fct:text-sm fct:text-muted-foreground'}>The server is offline.</p>
                        ) : data.online.length === 0 ? (
                            <p className={'fct:text-sm fct:text-muted-foreground'}>Nobody is playing right now.</p>
                        ) : (
                            <ul className={'fct:flex fct:flex-col fct:gap-1'}>
                                {data.online.map((player) => (
                                    <li key={player.name} className={'fct:flex fct:items-center fct:gap-3 fct:rounded-md fct:px-2 fct:py-1.5 fct:hover:bg-muted/40'}>
                                        <span className={'fct:size-2 fct:rounded-full fct:bg-success'} />
                                        <PlayerLink identifier={identifier} name={player.name} className={'fct:flex-1 fct:font-medium'} />
                                        {data.admins.includes(player.name) && (
                                            <Badge size={'sm'} tone={'info'}>
                                                Admin
                                            </Badge>
                                        )}
                                        {canManage && (
                                            <Button.Text size={'small'} disabled={busy} onClick={() => void act('kick', player.name)}>
                                                Kick
                                            </Button.Text>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    <Card title={'Who has played'} icon={'history'}>
                        {data.history.length === 0 ? (
                            <p className={'fct:text-sm fct:text-muted-foreground'}>Nobody has joined since Prism Factorio started keeping track.</p>
                        ) : (
                            <ul className={'fct:flex fct:flex-col fct:divide-y fct:divide-border'}>
                                {data.history.map((player) => (
                                    <li key={player.name} className={'fct:flex fct:flex-wrap fct:items-center fct:gap-3 fct:py-2'}>
                                        <PlayerLink identifier={identifier} name={player.name} className={'fct:flex-1 fct:font-medium'} />
                                        {player.online && (
                                            <Badge size={'sm'} tone={'success'}>
                                                Online
                                            </Badge>
                                        )}
                                        {data.bans.some((ban) => ban.name.toLowerCase() === player.name.toLowerCase()) && (
                                            <Badge size={'sm'} tone={'danger'}>
                                                Banned
                                            </Badge>
                                        )}
                                        {player.lastSeen !== null && (
                                            <span className={'fct:text-xs fct:text-muted-foreground'} title={player.firstSeen ? `First seen ${new Date(player.firstSeen * 1000).toLocaleString()}` : undefined}>
                                                {player.online ? 'playing now' : `last seen ${fromNow(new Date(player.lastSeen * 1000).toISOString())}`}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className={'fct:text-xs fct:text-muted-foreground'}>Joins and leaves are read from the server's console while it runs. Open a player to see what they said and to manage them.</p>
                    </Card>
                </div>

                <div className={'fct:flex fct:flex-col fct:gap-4'}>
                    <NameList
                        title={'Admins'}
                        icon={'shield'}
                        note={'Admins can use admin commands, kick and ban in the game, and join a full server.'}
                        names={data.admins}
                        empty={'No admins yet.'}
                        canManage={canManage}
                        busy={busy}
                        running={data.running}
                        identifier={identifier}
                        onAdd={(name) => act('promote', name)}
                        onRemove={(name) => act('demote', name)}
                    />
                    <NameList
                        title={'Banned'}
                        icon={'ban'}
                        note={'Banned players cannot join.'}
                        names={data.bans.map((ban) => ban.name)}
                        reasons={Object.fromEntries(data.bans.map((ban) => [ban.name, ban.reason]))}
                        empty={'Nobody is banned.'}
                        canManage={canManage}
                        busy={busy}
                        running={data.running}
                        identifier={identifier}
                        onAdd={(name) => act('ban', name)}
                        onRemove={(name) => act('unban', name)}
                    />
                    <NameList
                        title={'Whitelist'}
                        icon={'list-check'}
                        note={'When the whitelist is on (/whitelist enable in the console), only these players can join. While the server runs, the list is the game’s own.'}
                        names={data.whitelist}
                        empty={'The whitelist is empty.'}
                        canManage={canManage}
                        busy={busy}
                        running={data.running}
                        identifier={identifier}
                        onAdd={(name) => act('whitelist-add', name)}
                        onRemove={(name) => act('whitelist-remove', name)}
                    />
                </div>
            </div>
        </ServerContentBlock>
    );
}

/** A player's name, linking to their page. */
export function PlayerLink({ identifier, name, className }: { identifier: string; name: string; className?: string }) {
    return (
        <PanelLink destination={{ extension: 'prism-factorio', screen: 'player', params: { id: identifier, player: name } }} className={`${className ?? ''} fct:truncate fct:hover:underline`}>
            {name}
        </PanelLink>
    );
}

interface NameListProps {
    title: string;
    icon: string;
    note: string;
    names: string[];
    reasons?: Record<string, string | null>;
    empty: string;
    canManage: boolean;
    busy: boolean;
    running: boolean;
    identifier: string;
    onAdd: (name: string) => Promise<boolean>;
    onRemove: (name: string) => Promise<boolean>;
}

/** One of the server's lists: admins, bans or the whitelist. */
function NameList({ title, icon, note, names, reasons = {}, empty, canManage, busy, running, identifier, onAdd, onRemove }: NameListProps) {
    const [adding, setAdding] = useState('');

    return (
        <Card title={names.length > 0 ? `${title} (${names.length})` : title} icon={icon}>
            <p className={'fct:text-xs fct:text-muted-foreground'}>
                {note}
                {canManage && !running && ' The server is offline, so changes are saved to its list file and apply when it starts.'}
            </p>
            {names.length === 0 && <p className={'fct:text-sm fct:text-muted-foreground'}>{empty}</p>}
            <ul className={'fct:flex fct:flex-col fct:gap-1'}>
                {names.map((name) => (
                    <li key={name} className={'fct:flex fct:items-center fct:gap-2 fct:rounded-md fct:px-2 fct:py-1 fct:hover:bg-muted/40'}>
                        <span className={'fct:flex fct:min-w-0 fct:flex-1 fct:flex-col'}>
                            <PlayerLink identifier={identifier} name={name} className={'fct:text-sm fct:font-medium'} />
                            {reasons[name] && <span className={'fct:truncate fct:text-xs fct:text-muted-foreground'}>{reasons[name]}</span>}
                        </span>
                        {canManage && (
                            <Button.Text size={'small'} disabled={busy} onClick={() => void onRemove(name)} aria-label={`Remove ${name}`}>
                                <NamedIcon name={'x'} size={14} />
                            </Button.Text>
                        )}
                    </li>
                ))}
            </ul>
            {canManage && (
                <form
                    className={'fct:flex fct:gap-2'}
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (validName(adding.trim())) void onAdd(adding.trim()).then((done) => done && setAdding(''));
                    }}
                >
                    <Input value={adding} onChange={(event) => setAdding(event.target.value)} placeholder={'Factorio username'} className={'fct:flex-1'} />
                    <Button type={'submit'} size={'small'} isLoading={busy} disabled={!validName(adding.trim())}>
                        Add
                    </Button>
                </form>
            )}
        </Card>
    );
}
