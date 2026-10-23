import { Button, NamedIcon, PageHeading, PanelLink, Spinner, Switch, cn } from '@pterodactyl/sdk';
import { Slot, View, type ServerListItem, type ServerListModel, type ViewProps } from '@pterodactyl/sdk/theme';
import { eggColour, useSettings } from '../settings';

/** Power buttons outside the card's link, so they work without opening the server. */
function Power({ item }: { item: ServerListItem }) {
    const { state, permissions, actions, sending } = item;
    if (state.kind !== 'ready') return null;
    const button = 'flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40';

    return (
        <div className='flex gap-1'>
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

function Card({ item }: { item: ServerListItem }) {
    const settings = useSettings();
    const style = settings.cards;
    const colour = settings.egg_colors ? eggColour(tagsOf(item)) : null;
    const running = item.state.kind === 'ready' && item.state.power === 'running';

    return (
        <li
            className={cn(
                'pt-surface relative flex overflow-hidden rounded-lg border border-border bg-card',
                style === 'rows' ? 'items-center gap-4 px-4 py-3' : 'flex-col',
                style === 'outline' && 'bg-transparent shadow-none',
                style === 'neon' && 'pt-card-neon',
                style === 'tile' && 'pt-card-tile',
                style === 'minimal' && 'border-transparent bg-card/60 shadow-none'
            )}
            style={colour ? ({ '--pt-egg': colour } as React.CSSProperties) : undefined}
        >
            {settings.status_style === 'bar' && <span className={cn('absolute inset-y-0 left-0 w-1', running ? 'bg-success' : item.state.kind === 'ready' ? 'bg-destructive' : 'bg-muted')} />}
            {style === 'banner' && <div className='pt-card-banner h-20' />}
            <Slot name='dashboard.serverRow.before' data={item.server} />
            <PanelLink destination={{ to: '/server/$id', params: { id: item.identifier } }} aria-label={item.name} className={cn('min-w-0 flex-1 text-foreground no-underline', style === 'compact' ? 'p-3' : style === 'rows' ? '' : 'p-4')}>
                <View name='dashboard.serverCard' server={item.server} />
            </PanelLink>
            <Slot name='dashboard.serverRow.metrics.after' data={item.server} />
            {settings.power_buttons && (
                <div className={cn(style === 'rows' ? '' : 'flex justify-end px-4 pb-3', style === 'compact' && 'px-3 pb-2')}>
                    <Power item={item} />
                </div>
            )}
            <Slot name='dashboard.serverRow.after' data={item.server} />
        </li>
    );
}

/** The dashboard: a heading with counts and the servers in the chosen card style. */
export default function ServerList({ model }: ViewProps<'dashboard.serverList'>) {
    const settings = useSettings();
    const style = settings.cards;
    const others = model.scope === 'others';

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
                <div className='pt-surface flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-card/50 py-14 text-center'>
                    <NamedIcon name='server' size={32} className='text-muted-foreground' />
                    <p className='font-medium'>No servers yet</p>
                    <p className='text-sm text-muted-foreground'>Servers you own or are invited to show up here.</p>
                </div>
            )}
            <ul className={cn('grid gap-4', style === 'rows' ? 'grid-cols-1 gap-2' : style === 'compact' ? 'grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3')}>
                {model.servers.map((item) => (
                    <Card key={item.uuid} item={item} />
                ))}
            </ul>
            {model.pagination && model.pagination.totalPages > 1 && (
                <nav aria-label='Pages' className='mt-6 flex items-center justify-center gap-3 text-sm'>
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
