import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Input, ListRow, NamedIcon, ServerContentBlock, Spinner, TitledGreyBox, formatDate, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { getPlayers, playerAction, playerKeys, type PlayerAction, type PlayersOverview, type TShockBan, type VanillaBan } from '../api/players';
import { GiveDialog, ReasonDialog } from '../components/players/ActionDialogs';
import { useTerrariaInfo } from '../hooks/useTerrariaInfo';

type Pending = { title: string; confirm: string; withDuration?: boolean; build: (reason: string, duration?: string) => PlayerAction } | null;

export default function PlayersScreen() {
    const { identifier } = useTerrariaInfo();
    const queryClient = useQueryClient();
    const players = useQuery({ queryKey: playerKeys.overview(identifier), queryFn: () => getPlayers(identifier), refetchInterval: 20_000 });
    const [pending, setPending] = useState<Pending>(null);
    const [giving, setGiving] = useState<string | null>(null);
    const [broadcast, setBroadcast] = useState('');

    const refresh = () => queryClient.invalidateQueries({ queryKey: playerKeys.overview(identifier) });
    const run = async (action: PlayerAction, success: string) => {
        try {
            await playerAction(identifier, action);
            toast.success(success);
            refresh();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        }
    };

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

    const data: PlayersOverview = players.data;
    const tshock = data.kind === 'tshock';

    return (
        <ServerContentBlock title={'Players'}>
            <div className={'trs:grid trs:gap-4 trs:lg:grid-cols-[1fr_320px]'}>
                <div className={'trs:flex trs:flex-col trs:gap-4 trs:min-w-0'}>
                    {!tshock && (
                        <Alert type={'info'}>
                            Terraria keeps characters on each player&apos;s own computer, so their inventories are not on the server. Switch to TShock with server-side characters to see
                            and manage them here.
                        </Alert>
                    )}

                    <TitledGreyBox title={`Online now (${data.online.length})`}>
                        {!data.running ? (
                            <p className={'trs:text-sm trs:text-muted-foreground'}>The server is offline.</p>
                        ) : data.online.length === 0 ? (
                            <p className={'trs:text-sm trs:text-muted-foreground'}>Nobody is playing right now.</p>
                        ) : (
                            <div className={'trs:flex trs:flex-col trs:gap-2'}>
                                {data.online.map((player) => (
                                    <div key={player.name} className={'trs:flex trs:flex-wrap trs:items-center trs:gap-2 trs:rounded-md trs:border trs:border-border trs:bg-card trs:p-3'}>
                                        <span className={'trs:size-2 trs:rounded-full trs:bg-green-500'} />
                                        <span className={'trs:font-medium trs:flex-1 trs:min-w-0 trs:truncate'}>{player.name}</span>
                                        {player.ip && <span className={'trs:font-mono trs:text-xs trs:text-muted-foreground'}>{player.ip}</span>}
                                        {data.canManage && (
                                            <div className={'trs:flex trs:flex-wrap trs:gap-1'}>
                                                {tshock && (
                                                    <>
                                                        <Button size={'small'} isSecondary onClick={() => run({ action: 'heal', name: player.name }, `Healed ${player.name}.`)}>
                                                            Heal
                                                        </Button>
                                                        <Button size={'small'} isSecondary onClick={() => setGiving(player.name)}>
                                                            Give
                                                        </Button>
                                                        <Button size={'small'} isSecondary onClick={() => run({ action: 'godmode', name: player.name }, `Toggled god mode for ${player.name}.`)}>
                                                            God mode
                                                        </Button>
                                                        <Button
                                                            size={'small'}
                                                            isSecondary
                                                            onClick={() => setPending({ title: `Mute ${player.name}`, confirm: 'Mute', build: (reason) => ({ action: 'mute', name: player.name, reason }) })}
                                                        >
                                                            Mute
                                                        </Button>
                                                    </>
                                                )}
                                                <Button.Danger
                                                    size={'small'}
                                                    isSecondary
                                                    onClick={() => setPending({ title: `Kick ${player.name}`, confirm: 'Kick', build: (reason) => ({ action: 'kick', name: player.name, reason }) })}
                                                >
                                                    Kick
                                                </Button.Danger>
                                                <Button.Danger
                                                    size={'small'}
                                                    onClick={() =>
                                                        setPending({
                                                            title: `Ban ${player.name}`,
                                                            confirm: 'Ban',
                                                            withDuration: tshock,
                                                            build: (reason, duration) => ({ action: 'ban', name: player.name, reason, duration }),
                                                        })
                                                    }
                                                >
                                                    Ban
                                                </Button.Danger>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {data.canManage && data.running && (
                            <form
                                className={'trs:mt-3 trs:flex trs:gap-2'}
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    if (broadcast.trim() === '') return;
                                    run({ action: 'say', text: broadcast.trim() }, 'Message sent.');
                                    setBroadcast('');
                                }}
                            >
                                <Input value={broadcast} onChange={(event) => setBroadcast(event.target.value)} placeholder={'Message everyone on the server…'} className={'trs:flex-1'} />
                                <Button type={'submit'} disabled={broadcast.trim() === ''}>
                                    <NamedIcon name={'send'} size={14} /> Send
                                </Button>
                            </form>
                        )}
                    </TitledGreyBox>

                    {tshock && (
                        <TitledGreyBox title={`Accounts (${data.accounts?.length ?? 0})`}>
                            {!data.database ? (
                                <p className={'trs:text-sm trs:text-muted-foreground'}>TShock uses MySQL or PostgreSQL here, or has not made its database yet. Accounts are read from tshock/tshock.sqlite.</p>
                            ) : (data.accounts ?? []).length === 0 ? (
                                <p className={'trs:text-sm trs:text-muted-foreground'}>No accounts yet. Players register in game with /register.</p>
                            ) : (
                                <div className={'trs:flex trs:flex-col trs:gap-1'}>
                                    {!data.ssc && (
                                        <p className={'trs:mb-2 trs:text-xs trs:text-muted-foreground'}>Server-side characters are off, so inventories are not kept. Turn them on in Settings.</p>
                                    )}
                                    {(data.accounts ?? []).map((account) => (
                                        <ListRow key={account.id} destination={{ extension: 'terraria-suite', screen: 'player', params: { id: identifier, player: String(account.id) } }} interactive>
                                            <ListRow.Icon>
                                                <NamedIcon name={'user'} size={18} />
                                            </ListRow.Icon>
                                            <div className={'trs:min-w-0 trs:flex-1'}>
                                                <ListRow.Title>{account.name}</ListRow.Title>
                                                <ListRow.Description>
                                                    {account.lastSeen ? `Last seen ${formatDate(account.lastSeen, 'MMM D, YYYY HH:mm')}` : 'Never played'}
                                                </ListRow.Description>
                                            </div>
                                            <div className={'trs:flex trs:gap-1'}>
                                                <Badge size={'sm'} tone={'neutral'}>
                                                    {account.group}
                                                </Badge>
                                                {data.online.some((player) => player.name.toLowerCase() === account.name.toLowerCase()) && (
                                                    <Badge size={'sm'} tone={'success'}>
                                                        Online
                                                    </Badge>
                                                )}
                                                {account.hasCharacter && data.ssc && (
                                                    <Badge size={'sm'} tone={'info'}>
                                                        Character
                                                    </Badge>
                                                )}
                                            </div>
                                        </ListRow>
                                    ))}
                                </div>
                            )}
                        </TitledGreyBox>
                    )}

                    <TitledGreyBox title={`Bans (${data.bans.length})`}>
                        {data.bans.length === 0 ? (
                            <p className={'trs:text-sm trs:text-muted-foreground'}>Nobody is banned.</p>
                        ) : (
                            <div className={'trs:flex trs:flex-col trs:gap-2'}>
                                {tshock
                                    ? (data.bans as TShockBan[]).map((ban) => (
                                          <div key={ban.ticket} className={'trs:flex trs:flex-wrap trs:items-center trs:gap-2 trs:rounded-md trs:border trs:border-border trs:bg-card trs:p-3'}>
                                              <Badge size={'sm'} tone={'neutral'}>
                                                  {{ acc: 'Account', name: 'Name', ip: 'IP', uuid: 'UUID' }[ban.type] ?? ban.type}
                                              </Badge>
                                              <div className={'trs:min-w-0 trs:flex-1'}>
                                                  <p className={'trs:font-medium trs:truncate'}>{ban.value}</p>
                                                  <p className={'trs:text-xs trs:text-muted-foreground'}>
                                                      {ban.reason} · by {ban.by} · {ban.expires ? `until ${formatDate(ban.expires, 'MMM D, YYYY HH:mm')}` : 'permanent'}
                                                  </p>
                                              </div>
                                              {data.canManage && (
                                                  <Button size={'small'} isSecondary disabled={!data.running} onClick={() => run({ action: 'unban', ticket: ban.ticket }, `Ban ${ban.ticket} lifted.`)}>
                                                      Unban
                                                  </Button>
                                              )}
                                          </div>
                                      ))
                                    : (data.bans as VanillaBan[]).map((ban) => (
                                          <div key={ban.name} className={'trs:flex trs:flex-wrap trs:items-center trs:gap-2 trs:rounded-md trs:border trs:border-border trs:bg-card trs:p-3'}>
                                              <div className={'trs:min-w-0 trs:flex-1'}>
                                                  <p className={'trs:font-medium trs:truncate'}>{ban.name}</p>
                                                  {ban.ip && <p className={'trs:font-mono trs:text-xs trs:text-muted-foreground'}>{ban.ip}</p>}
                                              </div>
                                              {data.canManage && (
                                                  <Button size={'small'} isSecondary onClick={() => run({ action: 'unban', name: ban.name }, `${ban.name} was unbanned. Restart the server to apply.`)}>
                                                      Unban
                                                  </Button>
                                              )}
                                          </div>
                                      ))}
                            </div>
                        )}
                    </TitledGreyBox>
                </div>

                <TitledGreyBox title={'Recent activity'}>
                    {data.activity.length === 0 ? (
                        <p className={'trs:text-sm trs:text-muted-foreground'}>No joins or leaves in the logs yet.</p>
                    ) : (
                        <div className={'trs:flex trs:flex-col trs:gap-2'}>
                            {data.activity.map((event, index) => (
                                <div key={index} className={'trs:flex trs:items-center trs:gap-2 trs:text-sm'}>
                                    <NamedIcon name={event.event === 'joined' ? 'log-in' : 'log-out'} size={14} className={event.event === 'joined' ? 'trs:text-green-500' : 'trs:text-muted-foreground'} />
                                    <span className={'trs:flex-1 trs:min-w-0 trs:truncate'}>
                                        <strong>{event.name}</strong> {event.event === 'joined' ? 'joined' : 'left'}
                                        {event.detail && <span className={'trs:text-muted-foreground'}> ({event.detail})</span>}
                                    </span>
                                    {event.time && <span className={'trs:text-xs trs:text-muted-foreground'}>{event.time}</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </TitledGreyBox>
            </div>

            {pending && (
                <ReasonDialog
                    server={identifier}
                    title={pending.title}
                    confirm={pending.confirm}
                    withDuration={pending.withDuration}
                    build={pending.build}
                    onClose={() => setPending(null)}
                    onDone={() => {
                        setPending(null);
                        refresh();
                    }}
                />
            )}
            {giving && <GiveDialog server={identifier} player={giving} onClose={() => setGiving(null)} />}
        </ServerContentBlock>
    );
}
