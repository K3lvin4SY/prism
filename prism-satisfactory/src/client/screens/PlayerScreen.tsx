import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, PanelLink, ServerContentBlock, Spinner, fromNow, httpErrorToHuman, type ScreenComponentProps } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { getPlayer } from '../api/players';
import { useSatisfactoryInfo } from '../hooks/useSatisfactoryInfo';
import { NamedIcon } from '../icons';

const when = (seconds: number) => fromNow(new Date(seconds * 1000).toISOString());

/** One tile in the facts grid: a small label over its value. */
function Fact({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
    return (
        <div className={'sfy:flex sfy:min-w-0 sfy:flex-col sfy:gap-1 sfy:bg-card sfy:px-4 sfy:py-3'}>
            <p className={'sfy:flex sfy:items-center sfy:gap-1.5 sfy:text-xs sfy:text-muted-foreground'}>
                <NamedIcon name={icon} size={13} /> {label}
            </p>
            <p className={'sfy:truncate sfy:text-sm sfy:font-semibold'}>{children}</p>
        </div>
    );
}

export default function PlayerScreen({ data: route }: ScreenComponentProps) {
    const { identifier } = useSatisfactoryInfo();
    const name = String(route.params.player ?? '');
    const page = useQuery({ queryKey: keys.player(identifier, name), queryFn: () => getPlayer(identifier, name), refetchInterval: 15_000 });

    const back = (
        <PanelLink destination={{ extension: 'prism-satisfactory', screen: 'players', params: { id: identifier } }} className={'sfy:inline-flex sfy:items-center sfy:gap-1 sfy:text-sm sfy:text-muted-foreground sfy:hover:text-foreground'}>
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
                <div className={'sfy:flex sfy:flex-col sfy:gap-4'}>
                    {back}
                    <Alert type={'danger'}>{httpErrorToHuman(page.error)}</Alert>
                </div>
            </ServerContentBlock>
        );
    }

    const { player } = page.data;

    return (
        <ServerContentBlock title={player.name}>
            <div className={'sfy:flex sfy:flex-col sfy:gap-4'}>
                {back}
                <div className={'pt-surface sfy:flex sfy:flex-wrap sfy:items-center sfy:gap-4 sfy:rounded-md sfy:border sfy:border-border sfy:bg-card sfy:p-4'}>
                    <span className={'sfy:flex sfy:size-12 sfy:items-center sfy:justify-center sfy:rounded-lg sfy:bg-primary/15 sfy:text-primary'}>
                        <NamedIcon name={'user'} size={22} />
                    </span>
                    <div className={'sfy:min-w-0 sfy:flex-1'}>
                        <p className={'sfy:flex sfy:flex-wrap sfy:items-center sfy:gap-2 sfy:text-lg sfy:font-semibold'}>
                            {player.name}
                            {player.online && (
                                <Badge size={'sm'} tone={'success'}>
                                    Online
                                </Badge>
                            )}
                        </p>
                        <p className={'sfy:text-xs sfy:text-muted-foreground'}>{player.online ? 'Playing now' : `Last seen ${when(player.lastSeen)}`}</p>
                    </div>
                </div>

                <div className={'pt-surface sfy:grid sfy:grid-cols-3 sfy:gap-px sfy:overflow-hidden sfy:rounded-md sfy:border sfy:border-border sfy:bg-border'}>
                    <Fact icon={'clock'} label={'First seen'}>
                        {new Date(player.firstSeen * 1000).toLocaleDateString()}
                    </Fact>
                    <Fact icon={'history'} label={'Last seen'}>
                        {player.online ? 'Now' : when(player.lastSeen)}
                    </Fact>
                    <Fact icon={'log-in'} label={'Joins'}>
                        {player.joins}
                    </Fact>
                </div>
                <p className={'sfy:text-xs sfy:text-muted-foreground'}>Characters and inventories live in the save, which the Panel does not read.</p>
            </div>
        </ServerContentBlock>
    );
}
