import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, PanelLink, ServerContentBlock, Spinner, fromNow, httpErrorToHuman, type ScreenComponentProps } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { getPlayer, type PlayerDetails } from '../api/players';
import { useCoreKeeperInfo } from '../hooks/useCoreKeeperInfo';
import { NamedIcon } from '../icons';

const when = (seconds: number) => fromNow(new Date(seconds * 1000).toISOString());

function Card({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
    return (
        <section className={'pt-surface cks:flex cks:flex-col cks:gap-3 cks:rounded-lg cks:border cks:border-border cks:bg-card cks:p-4'}>
            <div className={'cks:flex cks:items-center cks:gap-2'}>
                <NamedIcon name={icon} size={18} className={'cks:text-primary'} />
                <h2 className={'cks:flex-1 cks:font-semibold'}>{title}</h2>
            </div>
            {children}
        </section>
    );
}

/** One tile in the facts grid: a small label over its value. */
function Fact({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
    return (
        <div className={'cks:flex cks:min-w-0 cks:flex-col cks:gap-1 cks:bg-card cks:px-4 cks:py-3'}>
            <p className={'cks:flex cks:items-center cks:gap-1.5 cks:text-xs cks:text-muted-foreground'}>
                <NamedIcon name={icon} size={13} /> {label}
            </p>
            <p className={'cks:truncate cks:text-sm cks:font-semibold'}>{children}</p>
        </div>
    );
}

/** "HairColor" → "Hair color" */
const label = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (first) => first.toUpperCase()).replace(/ [A-Z]/g, (word) => word.toLowerCase());

export default function PlayerScreen({ data: route }: ScreenComponentProps) {
    const { identifier } = useCoreKeeperInfo();
    const id = String(route.params.player ?? '');
    const page = useQuery({ queryKey: keys.player(identifier, id), queryFn: () => getPlayer(identifier, id), refetchInterval: 15_000 });

    const back = (
        <PanelLink destination={{ extension: 'prism-corekeeper', screen: 'players', params: { id: identifier } }} className={'cks:inline-flex cks:items-center cks:gap-1 cks:text-sm cks:text-muted-foreground cks:hover:text-foreground'}>
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
                <div className={'cks:flex cks:flex-col cks:gap-4'}>
                    {back}
                    <Alert type={'danger'}>{httpErrorToHuman(page.error)}</Alert>
                </div>
            </ServerContentBlock>
        );
    }

    const { player, admin, latestSync, details, serverMod } = page.data;

    return (
        <ServerContentBlock title={player.name}>
            <div className={'cks:flex cks:flex-col cks:gap-4'}>
                {back}
                <div className={'pt-surface cks:flex cks:flex-wrap cks:items-center cks:gap-4 cks:rounded-md cks:border cks:border-border cks:bg-card cks:p-4'}>
                    <span className={'cks:flex cks:size-12 cks:items-center cks:justify-center cks:rounded-lg cks:bg-primary/15 cks:text-primary'}>
                        <NamedIcon name={'user'} size={22} />
                    </span>
                    <div className={'cks:min-w-0 cks:flex-1'}>
                        <p className={'cks:flex cks:flex-wrap cks:items-center cks:gap-2 cks:text-lg cks:font-semibold'}>
                            {player.name}
                            {player.online && (
                                <Badge size={'sm'} tone={'success'}>
                                    Online
                                </Badge>
                            )}
                            {admin && (
                                <Badge size={'sm'} tone={'info'}>
                                    Admin
                                </Badge>
                            )}
                        </p>
                        <p className={'cks:text-xs cks:text-muted-foreground'}>
                            {player.steamId && (
                                <a href={`https://steamcommunity.com/profiles/${player.steamId}`} target={'_blank'} rel={'noreferrer'} className={'cks:font-mono cks:hover:text-foreground cks:hover:underline'}>
                                    {player.steamId}
                                </a>
                            )}
                            {player.steamId && ' · '}
                            {player.online ? 'playing now' : `last seen ${when(player.lastSeen)}`} · first seen {when(player.firstSeen)}
                        </p>
                    </div>
                </div>

                <div className={'cks:grid cks:gap-px cks:overflow-hidden cks:rounded-lg cks:border cks:border-border cks:bg-border cks:sm:grid-cols-2 cks:lg:grid-cols-4'}>
                    <Fact icon={'map'} label={'Latest map sync'}>
                        {latestSync ? `${when(latestSync.at)}${latestSync.exact ? '' : ' (likely)'}` : 'Never'}
                    </Fact>
                    <Fact icon={'heart'} label={'Health'}>
                        {details?.health != null ? `${Math.round(details.health)}${details.maxHealth != null ? ` / ${Math.round(details.maxHealth)}` : ''}${details.dead ? ' (dead)' : ''}` : '—'}
                    </Fact>
                    <Fact icon={'apple'} label={'Food'}>
                        {details?.hunger != null ? Math.round(details.hunger) : '—'}
                    </Fact>
                    <Fact icon={'map-pin'} label={'Last position'}>
                        {details?.x != null && details.y != null ? `x ${Math.round(details.x)}, y ${Math.round(details.y)}` : '—'}
                    </Fact>
                </div>

                {details ? (
                    <Details details={details} />
                ) : (
                    <Alert type={'info'}>
                        {serverMod
                            ? 'The Prism server mod has not seen this player yet. Their skills and gear show here after their next visit.'
                            : 'Turn on the Prism server mod in Properties to see skills, health, food and gear. They are kept from each player’s last visit until they come back.'}
                    </Alert>
                )}
            </div>
        </ServerContentBlock>
    );
}

function Details({ details }: { details: PlayerDetails }) {
    const total = details.skills.reduce((sum, skill) => sum + skill.level, 0);
    const customization = Object.entries(details.customization).filter(([, value]) => value !== '');

    return (
        <>
            <p className={'cks:text-xs cks:text-muted-foreground'}>
                {details.capturedAt ? `As the server saw them ${when(details.capturedAt)}.` : ''} Core Keeper has no character level; each skill levels on its own.
            </p>
            <div className={'cks:grid cks:gap-4 cks:lg:grid-cols-2'}>
                {details.skills.length > 0 && (
                    <Card title={`Skills (total ${total})`} icon={'sparkles'}>
                        <ul className={'cks:grid cks:grid-cols-2 cks:gap-x-4 cks:gap-y-2'}>
                            {details.skills.map((skill) => (
                                <li key={skill.name} className={'cks:flex cks:flex-col cks:gap-1'}>
                                    <span className={'cks:flex cks:justify-between cks:text-sm'}>
                                        <span>{label(skill.name)}</span>
                                        <span className={'cks:font-mono cks:text-muted-foreground'}>{skill.level}</span>
                                    </span>
                                    <span className={'cks:h-1.5 cks:overflow-hidden cks:rounded-full cks:bg-muted'}>
                                        <span className={'cks:block cks:h-full cks:rounded-full cks:bg-primary'} style={{ width: `${Math.min(100, skill.level)}%` }} />
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                )}
                {details.equipment.length > 0 && (
                    <Card title={'Equipped'} icon={'shield'}>
                        <ul className={'cks:flex cks:flex-col cks:divide-y cks:divide-border'}>
                            {details.equipment.map((item) => (
                                <li key={`${item.slot}-${item.id}`} className={'cks:flex cks:items-center cks:gap-3 cks:py-1.5 cks:text-sm'}>
                                    <span className={'cks:w-28 cks:shrink-0 cks:text-muted-foreground'}>{label(item.slot)}</span>
                                    <span className={'cks:flex-1 cks:font-medium'}>{item.name || `Item ${item.id}`}</span>
                                    {item.amount > 1 && <span className={'cks:font-mono cks:text-xs cks:text-muted-foreground'}>×{item.amount}</span>}
                                </li>
                            ))}
                        </ul>
                    </Card>
                )}
                {customization.length > 0 && (
                    <Card title={'Character'} icon={'user'}>
                        <dl className={'cks:grid cks:grid-cols-2 cks:gap-x-4 cks:gap-y-1 cks:text-sm'}>
                            {customization.map(([key, value]) => (
                                <div key={key} className={'cks:contents'}>
                                    <dt className={'cks:text-muted-foreground'}>{label(key)}</dt>
                                    <dd>{value}</dd>
                                </div>
                            ))}
                        </dl>
                    </Card>
                )}
            </div>
        </>
    );
}
