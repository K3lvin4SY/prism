import { useEffect } from 'react';
import { Button, NamedIcon, PageHeading, PanelLink, Spinner, Switch, cn } from '@pterodactyl/sdk';
import { Slot, View, type ServerListItem, type ServerListModel, type ViewProps } from '@pterodactyl/sdk/theme';
import { NO_FILTERS, matches, publishServers, setFilters, useDashboard, type DashboardServer } from '../dashboard';
import { usePictures } from '../pictures';
import { cssUrlToken, eggColour, useSettings } from '../settings';

/** Power buttons outside the card's link, so they work without opening the server. */
function Power({ item }: { item: ServerListItem }) {
    const { state, permissions, actions, sending } = item;
    if (state.kind !== 'ready') return null;
    const button = 'pla:flex pla:size-8 pla:items-center pla:justify-center pla:rounded-md pla:border pla:border-border pla:text-muted-foreground pla:hover:text-foreground pla:disabled:opacity-40';

    return (
        <div className='pla:flex pla:gap-1'>
            {state.power === 'offline'
                ? permissions.start && (
                      <button type='button' className={button} disabled={sending} onClick={actions.start} title='Start' aria-label='Start'>
                          <NamedIcon name='play' size={14} />
                      </button>
                  )
                : [
                      permissions.restart && (
                          <button key='restart' type='button' className={button} disabled={sending} onClick={actions.restart} title='Restart' aria-label='Restart'>
                              <NamedIcon name='rotate-ccw' size={14} />
                          </button>
                      ),
                      permissions.stop && (
                          <button key='stop' type='button' className={button} disabled={sending} onClick={actions.stop} title='Stop' aria-label='Stop'>
                              <NamedIcon name='square' size={14} />
                          </button>
                      ),
                  ]}
        </div>
    );
}

const tagsOf = (item: ServerListItem) => (item.server.attributes as { egg_tags?: string[] }).egg_tags;

function Card({ item, picture }: { item: ServerListItem; picture: string | null }) {
    const settings = useSettings();
    const style = settings.cards;
    const colour = settings.egg_colors ? eggColour(tagsOf(item)) : null;
    const running = item.state.kind === 'ready' && item.state.power === 'running';

    return (
        <li
            className={cn(
                'pt-surface pla:relative pla:flex pla:overflow-hidden pla:rounded-lg pla:border pla:border-border pla:bg-card',
                style === 'rows' ? 'pla:items-center pla:gap-4 pla:px-4 pla:py-3' : 'pla:flex-col',
                style === 'outline' && 'pla:bg-transparent pla:shadow-none',
                style === 'neon' && 'pla-card-neon',
                style === 'tile' && 'pla-card-tile',
                style === 'minimal' && 'pla:border-transparent pla:bg-card/60 pla:shadow-none',
                colour && 'pla-card-egg'
            )}
            data-style={style}
            style={{ ...(colour ? { '--pla-egg': colour } : {}), ...(picture ? { '--pla-card-image': cssUrlToken(picture) } : {}) } as React.CSSProperties}
        >
            {settings.status_style === 'bar' && <span className={cn('pla:absolute pla:inset-y-0 pla:left-0 pla:w-1', running ? 'pla:bg-success' : item.state.kind === 'ready' ? 'pla:bg-destructive' : 'pla:bg-muted')} />}
            {colour && style === 'compact' && <span className='pla:absolute pla:inset-x-0 pla:top-0 pla:h-1 pla:bg-(--pla-egg)' aria-hidden />}
            {colour && style === 'rows' && (
                <span className='pla:flex pla:size-8 pla:shrink-0 pla:items-center pla:justify-center pla:rounded-md pla:bg-[color-mix(in_oklab,var(--pla-egg)_22%,transparent)] pla:text-(--pla-egg)' aria-hidden>
                    <NamedIcon name='gamepad-2' size={16} />
                </span>
            )}
            {style === 'banner' && <div className='pla-card-banner pla:h-20' />}
            <Slot name='dashboard.serverRow.before' data={item.server} />
            <PanelLink destination={{ to: '/server/$id', params: { id: item.identifier } }} aria-label={item.name} className={cn('pla:min-w-0 pla:flex-1 pla:text-foreground pla:no-underline', style === 'compact' ? 'pla:p-3' : style === 'rows' ? '' : 'pla:p-4')}>
                <View name='dashboard.serverCard' server={item.server} />
            </PanelLink>
            <Slot name='dashboard.serverRow.metrics.after' data={item.server} />
            {settings.power_buttons && (
                <div className={cn(style === 'rows' ? '' : 'pla:flex pla:justify-end pla:px-4 pla:pb-3', style === 'compact' && 'pla:px-3 pla:pb-2')}>
                    <Power item={item} />
                </div>
            )}
            <Slot name='dashboard.serverRow.after' data={item.server} />
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
    const pictures = usePictures(
        model.servers.map((item) => item.uuid),
        style === 'banner'
    );

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
            <ul className={cn('pla:grid pla:gap-4', style === 'rows' ? 'pla:grid-cols-1 pla:gap-2' : style === 'compact' ? 'pla:grid-cols-1 pla:gap-3 pla:sm:grid-cols-2 pla:lg:grid-cols-3 pla:2xl:grid-cols-4' : 'pla:grid-cols-1 pla:sm:grid-cols-2 pla:xl:grid-cols-3')}>
                {shown.map((item) => (
                    <Card key={item.uuid} item={item} picture={pictures.data?.[item.uuid] ?? null} />
                ))}
            </ul>
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
