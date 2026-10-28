import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Dialog, Input, PanelLink, ServerContentBlock, Spinner, fromNow, httpErrorToHuman, useServerPermission, type ScreenComponentProps } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { getPlayer, type PlayerAction, type PlayerPage } from '../api/players';
import { usePlayerAction } from '../hooks/usePlayerAction';
import { useFactorioInfo } from '../hooks/useFactorioInfo';
import { NamedIcon } from '../icons';
import { Card } from './PlayersScreen';

const when = (seconds: number) => fromNow(new Date(seconds * 1000).toISOString());

/** One tile in the facts grid: a small label over its value. */
function Fact({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
    return (
        <div className={'fct:flex fct:min-w-0 fct:flex-col fct:gap-1 fct:bg-card fct:px-4 fct:py-3'}>
            <p className={'fct:flex fct:items-center fct:gap-1.5 fct:text-xs fct:text-muted-foreground'}>
                <NamedIcon name={icon} size={13} /> {label}
            </p>
            <p className={'fct:truncate fct:text-sm fct:font-semibold'}>{children}</p>
        </div>
    );
}

export default function PlayerScreen({ data: route }: ScreenComponentProps) {
    const { identifier } = useFactorioInfo();
    const name = String(route.params.player ?? '');
    const page = useQuery({ queryKey: keys.player(identifier, name), queryFn: () => getPlayer(identifier, name), refetchInterval: 15_000 });

    const back = (
        <PanelLink destination={{ extension: 'prism-factorio', screen: 'players', params: { id: identifier } }} className={'fct:inline-flex fct:items-center fct:gap-1 fct:text-sm fct:text-muted-foreground fct:hover:text-foreground'}>
            <NamedIcon name={'arrow-left'} size={14} /> Players
        </PanelLink>
    );

    if (page.isLoading) {
        return (
            <ServerContentBlock title={'Player'}>
                <Spinner centered />
            </ServerContentBlock>
        );
    }

    if (page.isError || !page.data) {
        return (
            <ServerContentBlock title={'Player'}>
                <div className={'fct:flex fct:flex-col fct:gap-4'}>
                    {back}
                    <Alert type={'danger'}>{httpErrorToHuman(page.error)}</Alert>
                </div>
            </ServerContentBlock>
        );
    }

    const data = page.data;
    const { player } = data;

    return (
        <ServerContentBlock title={player.name}>
            <div className={'fct:flex fct:flex-col fct:gap-4'}>
                {back}
                <div className={'pt-surface fct:flex fct:flex-wrap fct:items-center fct:gap-4 fct:rounded-md fct:border fct:border-border fct:bg-card fct:p-4'}>
                    <span className={'fct:flex fct:size-12 fct:items-center fct:justify-center fct:rounded-lg fct:bg-primary/15 fct:text-primary'}>
                        <NamedIcon name={'user'} size={22} />
                    </span>
                    <div className={'fct:min-w-0 fct:flex-1'}>
                        <p className={'fct:flex fct:flex-wrap fct:items-center fct:gap-2 fct:text-lg fct:font-semibold'}>
                            {player.name}
                            {player.online && (
                                <Badge size={'sm'} tone={'success'}>
                                    Online
                                </Badge>
                            )}
                            {data.admin && (
                                <Badge size={'sm'} tone={'info'}>
                                    Admin
                                </Badge>
                            )}
                            {data.ban && (
                                <Badge size={'sm'} tone={'danger'}>
                                    Banned
                                </Badge>
                            )}
                            {data.whitelisted && <Badge size={'sm'}>Whitelisted</Badge>}
                        </p>
                        <p className={'fct:text-xs fct:text-muted-foreground'}>
                            {player.online ? 'Playing now' : player.lastSeen ? `Last seen ${when(player.lastSeen)}` : 'Not seen by Prism Factorio yet'}
                        </p>
                    </div>
                </div>

                <div className={'pt-surface fct:grid fct:grid-cols-2 fct:gap-px fct:overflow-hidden fct:rounded-md fct:border fct:border-border fct:bg-border fct:md:grid-cols-4'}>
                    <Fact icon={'clock'} label={'First seen'}>
                        {player.firstSeen ? new Date(player.firstSeen * 1000).toLocaleDateString() : '—'}
                    </Fact>
                    <Fact icon={'history'} label={'Last seen'}>
                        {player.online ? 'Now' : player.lastSeen ? when(player.lastSeen) : '—'}
                    </Fact>
                    <Fact icon={'shield'} label={'Admin'}>
                        {data.admin ? 'Yes' : 'No'}
                    </Fact>
                    <Fact icon={'ban'} label={'Banned'}>
                        {data.ban ? (data.ban.reason ?? 'Yes') : 'No'}
                    </Fact>
                </div>

                <div className={'fct:grid fct:gap-4 fct:lg:grid-cols-[1fr_22rem]'}>
                    <Card title={'What they said'} icon={'message-circle'}>
                        {data.chat.length === 0 ? (
                            <p className={'fct:text-sm fct:text-muted-foreground'}>No chat from {player.name} seen yet.</p>
                        ) : (
                            <ul className={'fct:flex fct:flex-col fct:gap-1.5'}>
                                {data.chat.map((line, index) => (
                                    <li key={`${line.at}-${index}`} className={'fct:flex fct:gap-3 fct:text-sm'}>
                                        <span className={'fct:w-20 fct:shrink-0 fct:text-xs fct:text-muted-foreground'}>{line.at ? when(line.at) : ''}</span>
                                        <span className={'fct:min-w-0 fct:break-words'}>{line.text}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>
                    <Actions identifier={identifier} data={data} />
                </div>
            </div>
        </ServerContentBlock>
    );
}

function Actions({ identifier, data }: { identifier: string; data: PlayerPage }) {
    const canManage = useServerPermission('ext.prism-factorio.players-manage');
    const { act, busy } = usePlayerAction(identifier);
    const [asking, setAsking] = useState<'ban' | 'kick' | 'whisper' | null>(null);
    const [text, setText] = useState('');
    const name = data.player.name;

    if (!canManage) return null;

    const button = (label: string, icon: string, action: PlayerAction, tone?: 'danger') => (
        <Button size={'small'} isSecondary={tone !== 'danger'} color={tone === 'danger' ? 'red' : undefined} disabled={busy} onClick={() => void act(action, name)}>
            <NamedIcon name={icon} size={14} className={'fct:mr-1'} /> {label}
        </Button>
    );
    const ask = (label: string, icon: string, action: 'ban' | 'kick' | 'whisper') => (
        <Button
            size={'small'}
            isSecondary
            disabled={busy}
            onClick={() => {
                setText('');
                setAsking(action);
            }}
        >
            <NamedIcon name={icon} size={14} className={'fct:mr-1'} /> {label}
        </Button>
    );

    return (
        <Card title={'Manage'} icon={'settings'}>
            <div className={'fct:flex fct:flex-wrap fct:gap-2'}>
                {data.player.online && ask('Message', 'message-circle', 'whisper')}
                {data.player.online && ask('Kick', 'log-out', 'kick')}
                {data.admin ? button('Remove admin', 'shield-off', 'demote') : button('Make admin', 'shield', 'promote')}
                {data.whitelisted ? button('Off the whitelist', 'list-x', 'whitelist-remove') : button('Whitelist', 'list-check', 'whitelist-add')}
                {data.ban ? button('Unban', 'circle-check', 'unban') : ask('Ban', 'ban', 'ban')}
            </div>
            <p className={'fct:text-xs fct:text-muted-foreground'}>On a running server these are the game's own commands. When it is offline, the lists are changed for its next start.</p>

            {asking && (
                <Dialog open onClose={() => setAsking(null)} title={asking === 'whisper' ? `Message ${name}` : asking === 'kick' ? `Kick ${name}?` : `Ban ${name}?`}>
                    <div className={'fct:flex fct:flex-col fct:gap-2 fct:text-sm'}>
                        <p className={'fct:text-muted-foreground'}>
                            {asking === 'whisper' ? 'Only they see it, from the server.' : asking === 'kick' ? 'They can join again straight away.' : 'They cannot join until they are unbanned.'}
                        </p>
                        <Input value={text} maxLength={200} onChange={(event) => setText(event.target.value)} placeholder={asking === 'whisper' ? 'Message' : 'Reason (shown to them)'} autoFocus />
                    </div>
                    <Dialog.Footer>
                        <Button.Text onClick={() => setAsking(null)}>Cancel</Button.Text>
                        <Button
                            isLoading={busy}
                            disabled={asking === 'whisper' && text.trim() === ''}
                            onClick={() => void act(asking, name, text.trim()).then((done) => done && setAsking(null))}
                        >
                            {asking === 'whisper' ? 'Send' : asking === 'kick' ? 'Kick' : 'Ban'}
                        </Button>
                    </Dialog.Footer>
                </Dialog>
            )}
        </Card>
    );
}
