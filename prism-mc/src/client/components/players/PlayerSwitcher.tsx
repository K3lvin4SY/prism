import { useMemo, useState } from 'react';
import { PanelLink, cn, usePanelNavigate } from '@pterodactyl/sdk';
import { NamedIcon } from '../../icons';
import type { PlayerSummary } from '../../api/players';
import PlayerHead from './PlayerHead';

/** How many players show as chips before the search has to find the rest. */
const SHOWN = 12;

/**
 * The row of players over the player page: the one shown, then everyone online, then the
 * most recently seen. The search narrows the chips; Enter opens the first match.
 */
export default function PlayerSwitcher({ server, players, current }: { server: string; players: PlayerSummary[]; current: string }) {
    const [search, setSearch] = useState('');
    const navigate = usePanelNavigate();

    const chips = useMemo(() => {
        const query = search.trim().toLowerCase();
        const known = players.filter((player): player is PlayerSummary & { uuid: string } => !!player.uuid);
        const sorted = [...known].sort(
            (a, b) => Number(b.uuid === current) - Number(a.uuid === current) || Number(b.online) - Number(a.online) || String(b.lastSeen ?? '').localeCompare(String(a.lastSeen ?? '')) || String(a.name ?? '').localeCompare(String(b.name ?? ''))
        );

        return query ? sorted.filter((player) => (player.name ?? player.uuid).toLowerCase().includes(query)) : sorted.slice(0, SHOWN);
    }, [players, current, search]);

    const destination = (uuid: string) => ({
        extension: 'prism-mc',
        screen: 'player',
        params: { id: server, player: uuid },
    });

    return (
        <div className={'mcs:@container'}>
            <div className={'mcs:flex mcs:flex-col-reverse mcs:gap-2 mcs:@xl:flex-row mcs:@xl:items-center'}>
                <div className={'mcs:flex mcs:min-w-0 mcs:flex-1 mcs:items-center mcs:gap-2 mcs:overflow-x-auto '} style={{ scrollbarWidth: 'none' }}>
                    <PanelLink
                        destination={{
                            extension: 'prism-mc',
                            screen: 'players',
                            params: { id: server },
                        }}
                        title={'All players'}
                        aria-label={'All players'}
                        className={'pt-surface mcs:flex mcs:size-9 mcs:shrink-0 mcs:items-center mcs:justify-center mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:text-muted-foreground mcs:hover:text-foreground'}
                    >
                        <NamedIcon name={'arrow-left'} size={16} />
                    </PanelLink>
                    {chips.map((player) => {
                        const active = player.uuid === current;

                        return (
                            <PanelLink
                                key={player.uuid}
                                destination={destination(player.uuid)}
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'pt-surface mcs:flex mcs:h-9 mcs:shrink-0 mcs:items-center mcs:gap-2 mcs:rounded-lg mcs:border mcs:py-1 mcs:pr-3 mcs:pl-1.5 mcs:text-sm mcs:font-medium mcs:transition-colors',
                                    active ? 'mcs:border-primary mcs:bg-primary/15 mcs:text-foreground' : 'mcs:border-border mcs:bg-card mcs:text-muted-foreground mcs:hover:text-foreground'
                                )}
                            >
                                <PlayerHead server={server} skinKey={player.uuid} className={'mcs:size-6'} />
                                <span className={'mcs:max-w-36 mcs:truncate'}>{player.name ?? player.uuid.slice(0, 8)}</span>
                                <span className={cn('mcs:size-1.5 mcs:shrink-0 mcs:rounded-full', player.online ? 'mcs:bg-success' : 'mcs:bg-muted-foreground/50')} title={player.online ? 'Online' : 'Offline'} />
                            </PanelLink>
                        );
                    })}
                    {search && chips.length === 0 && <span className={'mcs:px-2 mcs:text-sm mcs:text-muted-foreground'}>No player matches.</span>}
                </div>
                <label
                    className={'pt-surface mcs:flex mcs:h-9 mcs:w-full mcs:shrink-0 mcs:items-center mcs:gap-2 mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:px-3 mcs:text-muted-foreground mcs:focus-within:border-primary mcs:@xl:w-56'}
                >
                    <NamedIcon name={'search'} size={15} className={'mcs:shrink-0'} />
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') setSearch('');
                            if (event.key === 'Enter' && chips[0]) {
                                setSearch('');
                                navigate(destination(chips[0].uuid));
                            }
                        }}
                        placeholder={`Search ${players.length} player${players.length === 1 ? '' : 's'}`}
                        aria-label={'Search players'}
                        className={'mcs:min-w-0 mcs:flex-1 mcs:bg-transparent mcs:text-sm mcs:text-foreground mcs:outline-none mcs:placeholder:text-muted-foreground'}
                    />
                </label>
            </div>
        </div>
    );
}
