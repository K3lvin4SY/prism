import { useEffect } from 'react';
import { Button, PageHeading, PanelLink, Spinner, Switch, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { Slot, View, type ServerListItem, type ServerListModel, type ViewProps } from '@pterodactyl/sdk/theme';
import { NO_FILTERS, matches, publishServers, setFilters, useDashboard, type DashboardServer } from '../dashboard';
import { useGames, type Game } from '../logos';
import { CardGameContext, type CardGame } from './cardContext';
import { usePictures } from '../pictures';
import { cssUrlToken, useEggColor, useSettings } from '../settings';

const POWER_BUTTON = 'pla:inline-flex pla:items-center pla:justify-center pla:rounded-md pla:transition-colors pla:disabled:opacity-40';
const POWER_TONE = {
    start: 'pla:bg-success/15 pla:text-success pla:hover:bg-success/25',
    restart: 'pla:bg-muted pla:text-foreground pla:hover:bg-secondary',
    stop: 'pla:bg-destructive/15 pla:text-destructive pla:hover:bg-destructive/25',
} as const;

/**
 * Power buttons outside the card's link, so they work without opening the server, tinted by what
 * they do: square on rows, sharing the tile's width on tiles.
 */
function Power({ item, wide }: { item: ServerListItem; wide: boolean }) {
    const { state, permissions, actions, sending } = item;
    if (state.kind !== 'ready') return null;
    const buttons = (
        state.power === 'offline'
            ? [permissions.start && (['start', 'Start', 'play', actions.start] as const)]
            : [permissions.restart && (['restart', 'Restart', 'rotate-ccw', actions.restart] as const), permissions.stop && (['stop', 'Stop', 'square', actions.stop] as const)]
    ).filter((button) => !!button);

    return (
        <div className={cn('pla:flex pla:gap-2', wide ? 'pla:w-full' : 'pla:justify-end')}>
            {buttons.map(([kind, label, icon, action]) => (
                <button key={kind} type='button' className={cn(POWER_BUTTON, POWER_TONE[kind], wide ? 'pla:h-10 pla:flex-1' : 'pla:size-9')} disabled={sending} onClick={action} title={label} aria-label={label}>
                    <NamedIcon name={icon} size={wide ? 16 : 14} className={kind === 'stop' ? 'pla:fill-current' : undefined} />
                </button>
            ))}
        </div>
    );
}

const tagsOf = (item: ServerListItem) => (item.server.attributes as { egg_tags?: string[] }).egg_tags;

function Card({ item, picture, game }: { item: ServerListItem; picture: string | null; game: Game | undefined }) {
    const settings = useSettings();
    const eggColor = useEggColor();
    const rows = settings.cards === 'rows';
    const color = settings.egg_colors === 'color' ? eggColor(tagsOf(item)) : null;
    const running = item.state.kind === 'ready' && item.state.power === 'running';
    const card: CardGame = { game: game?.game ?? null, logo: game?.logo ?? null, tags: tagsOf(item), color };
    const slots = (
        <>
            <Slot name='dashboard.serverRow.before' data={item.server} />
            <Slot name='dashboard.serverRow.metrics.after' data={item.server} />
            <Slot name='dashboard.serverRow.after' data={item.server} />
        </>
    );

    return (
        <li
            className={cn('pla:relative', rows ? 'pla-row pla:px-5 pla:py-3 pla:transition-colors pla:hover:bg-muted/40' : 'pt-surface pla:flex pla:flex-col pla:overflow-hidden pla:rounded-xl pla:border pla:border-border pla:bg-card')}
            style={{ ...(color ? { '--pla-egg': color } : {}), ...(picture ? { '--pla-card-image': cssUrlToken(picture) } : {}) } as React.CSSProperties}
        >
            {settings.status_style === 'bar' && <span className={cn('pla:absolute pla:inset-y-0 pla:left-0 pla:w-1', running ? 'pla:bg-success' : item.state.kind === 'ready' ? 'pla:bg-destructive' : 'pla:bg-muted')} />}
            {!rows && settings.card_banner && <div className='pla-card-banner pla:h-24' />}
            <PanelLink destination={{ to: '/server/$id', params: { id: item.identifier } }} aria-label={item.name} className={cn('pla:min-w-0 pla:text-foreground pla:no-underline', rows ? 'pla-row-link' : 'pla:flex-1 pla:p-5')}>
                <CardGameContext.Provider value={card}>
                    <View name='dashboard.serverCard' server={item.server} />
                </CardGameContext.Provider>
            </PanelLink>
            {rows ? (
                <div className='pla-row-power pla:flex pla:items-center pla:justify-end pla:gap-2'>
                    {slots}
                    {settings.power_buttons && <Power item={item} wide={false} />}
                </div>
            ) : (
                <>
                    {slots}
                    {settings.power_buttons && item.state.kind === 'ready' && (
                        <div className='pla:px-5 pla:pb-5'>
                            <Power item={item} wide />
                        </div>
                    )}
                </>
            )}
        </li>
    );
}

/** The dashboard: a heading with counts and the servers in the chosen card style. */
export default function ServerList({ model, Default }: ViewProps<'dashboard.serverList'>) {
    return useSettings().enabled ? <Servers model={model} /> : <Default />;
}

const toDashboard = (item: ServerListItem): DashboardServer => {
    const ready = item.state.kind === 'ready' ? item.state : null;

    return {
        identifier: item.identifier,
        name: item.name,
        power: ready?.power ?? null,
        tags: tagsOf(item) ?? [],
        cpu: ready?.cpu.value ?? 0,
        memory: ready?.memory.value ?? 0,
        memoryLimit: ready?.memory.limit ?? 0,
        disk: ready?.disk.value ?? 0,
        diskLimit: ready?.disk.limit ?? 0,
    };
};

function Servers({ model }: { model: ServerListModel }) {
    const settings = useSettings();
    const { filters } = useDashboard();
    const style = settings.cards;
    const others = model.scope === 'others';
    const uuids = model.servers.map((item) => item.uuid);
    const pictures = usePictures(uuids, style === 'tile' && settings.card_banner);
    const games = useGames(uuids);

    // The sidebar's overview and filters read the servers on this page.
    useEffect(() => {
        if (!model.loading) publishServers(model.servers.map(toDashboard), (model.pagination?.totalPages ?? 1) > 1);
    }, [model.loading, model.servers, model.pagination]);

    const shown = model.servers.filter((item) => matches({ name: item.name, power: item.state.kind === 'ready' ? item.state.power : null, tags: tagsOf(item) ?? [] }, filters));

    return (
        <>
            <PageHeading
                title='Servers'
                description={model.loading ? undefined : `${model.totals.servers} ${model.totals.servers === 1 ? 'server' : 'servers'} · ${model.totals.runningOnPage} online`}
                actions={model.canViewOthers && <Switch checked={others} onChange={() => model.actions.setScope(others ? 'mine' : 'others')} label="Show other users' servers" controlPosition='end' />}
            />
            <Slot name='dashboard.before' />
            {model.loading && <Spinner size='large' centered />}
            {!model.loading && model.servers.length === 0 && (
                <div className='pt-surface pla:flex pla:flex-col pla:items-center pla:gap-2 pla:rounded-lg pla:border pla:border-dashed pla:border-border pla:bg-card/50 pla:py-14 pla:text-center'>
                    <NamedIcon name='server' size={32} className='pla:text-muted-foreground' />
                    <p className='pla:font-medium'>No servers yet</p>
                    <p className='pla:text-sm pla:text-muted-foreground'>Servers you own or are invited to show up here.</p>
                </div>
            )}
            {!model.loading && model.servers.length > 0 && shown.length === 0 && (
                <div className='pla:flex pla:flex-col pla:items-center pla:gap-2 pla:rounded-lg pla:border pla:border-dashed pla:border-border pla:py-10 pla:text-center'>
                    <NamedIcon name='filter-x' size={28} className='pla:text-muted-foreground' />
                    <p className='pla:font-medium'>No server matches the filters</p>
                    <Button size='xsmall' color='grey' onClick={() => setFilters(NO_FILTERS)}>
                        Clear the filters
                    </Button>
                </div>
            )}
            {shown.length > 0 && (
                <ul
                    className={cn(
                        style === 'rows' ? 'pla-rows pt-surface pla:divide-y pla:divide-border pla:overflow-hidden pla:rounded-xl pla:border pla:border-border pla:bg-card' : 'pla:grid pla:grid-cols-1 pla:gap-4 pla:md:grid-cols-2 pla:2xl:grid-cols-3'
                    )}
                    data-usage={settings.usage_style}
                >
                    {shown.map((item) => (
                        <Card key={item.uuid} item={item} picture={pictures.data?.[item.uuid] ?? null} game={games.data?.[item.uuid]} />
                    ))}
                </ul>
            )}
            {model.pagination && model.pagination.totalPages > 1 && (
                <nav aria-label='Pages' className='pla:mt-6 pla:flex pla:items-center pla:justify-center pla:gap-3 pla:text-sm'>
                    <Button size='xsmall' color='grey' disabled={model.pagination.currentPage === 1} onClick={() => model.actions.setPage(model.pagination!.currentPage - 1)}>
                        Previous
                    </Button>
                    {model.pagination.currentPage} of {model.pagination.totalPages}
                    <Button size='xsmall' color='grey' disabled={model.pagination.currentPage === model.pagination.totalPages} onClick={() => model.actions.setPage(model.pagination!.currentPage + 1)}>
                        Next
                    </Button>
                </nav>
            )}
            <Slot name='dashboard.after' />
        </>
    );
}

export type { ServerListModel };
