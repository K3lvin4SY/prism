import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PanelLink, bytesToString, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { NO_FILTERS, filtering, gameTag, matches, readRecent, setFilters, useDashboard, type DashboardServer } from '../dashboard';
import { useEggColor } from '../settings';
import { itemClass } from './nav';

const online = (server: DashboardServer) => server.power !== null && server.power !== 'offline';
const heading = 'pla:px-1 pla:pb-1.5 pla:text-[11px] pla:font-semibold pla:tracking-wider pla:text-muted-foreground pla:uppercase';

function Bar({ value, limit }: { value: number; limit: number }) {
    const percent = limit > 0 ? Math.min(100, (value / limit) * 100) : 0;

    return (
        <div className='pla:h-1.5 pla:overflow-hidden pla:rounded-full pla:bg-muted'>
            <div className='pla:h-full pla:rounded-full pla:bg-primary' style={{ width: `${percent}%` }} />
        </div>
    );
}

function Overview() {
    const { servers } = useDashboard();
    const up = servers.filter(online).length;
    const sum = (key: 'cpu' | 'memory' | 'memoryLimit' | 'disk' | 'diskLimit') => servers.reduce((total, server) => total + server[key], 0);

    return (
        <section aria-label='Overview' className='pt-surface pla:flex pla:flex-col pla:gap-2.5 pla:rounded-lg pla:border pla:border-border pla:bg-card pla:p-3'>
            <div className='pla:flex pla:items-baseline pla:gap-1.5'>
                <span className='pla:font-header pla:text-2xl pla:font-semibold pla:tabular-nums'>{up}</span>
                <span className='pla:text-sm pla:text-muted-foreground'>of {servers.length} online</span>
                <span className={cn('pla:ml-auto pla:size-2 pla:rounded-full', up === servers.length && up > 0 ? 'pla:bg-success' : up > 0 ? 'pla:bg-warning' : 'pla:bg-destructive')} />
            </div>
            <div className='pla:flex pla:flex-col pla:gap-2 pla:text-xs pla:text-muted-foreground'>
                <p className='pla:flex pla:justify-between'>
                    CPU <span className='pla:text-foreground pla:tabular-nums'>{sum('cpu').toFixed(0)}%</span>
                </p>
                <div className='pla:flex pla:flex-col pla:gap-1'>
                    <p className='pla:flex pla:justify-between'>
                        Memory <span className='pla:text-foreground pla:tabular-nums'>{bytesToString(sum('memory'))}</span>
                    </p>
                    <Bar value={sum('memory')} limit={sum('memoryLimit')} />
                </div>
                <div className='pla:flex pla:flex-col pla:gap-1'>
                    <p className='pla:flex pla:justify-between'>
                        Disk <span className='pla:text-foreground pla:tabular-nums'>{bytesToString(sum('disk'))}</span>
                    </p>
                    <Bar value={sum('disk')} limit={sum('diskLimit')} />
                </div>
            </div>
        </section>
    );
}

const chip = (active: boolean) =>
    cn('pla:inline-flex pla:cursor-pointer pla:items-center pla:gap-1.5 pla:rounded-full pla:border pla:px-2.5 pla:py-1 pla:text-xs pla:transition-colors', active ? 'pla:border-primary pla:bg-primary/15 pla:text-foreground' : 'pla:border-border pla:text-muted-foreground pla:hover:text-foreground');

function FilterPanel() {
    const { servers, filters, paged } = useDashboard();
    const eggColor = useEggColor();
    const games = useMemo(() => [...new Set(servers.map((server) => gameTag(server.tags)).filter((tag): tag is string => tag !== null))].sort(), [servers]);
    const shown = servers.filter((server) => matches(server, filters)).length;

    return (
        <section aria-label='Filters' className='pla:flex pla:flex-col pla:gap-2'>
            <div className='pla:flex pla:items-center'>
                <p className={heading}>Filters</p>
                {filtering(filters) && (
                    <button type='button' onClick={() => setFilters(NO_FILTERS)} className='pla:ml-auto pla:pb-1.5 pla:text-xs pla:text-muted-foreground pla:hover:text-foreground'>
                        Clear
                    </button>
                )}
            </div>
            <div className='pla:relative'>
                <NamedIcon name='search' size={13} className='pla:pointer-events-none pla:absolute pla:top-1/2 pla:left-2.5 pla:-translate-y-1/2 pla:text-muted-foreground' />
                <input
                    value={filters.name}
                    onChange={(event) => setFilters({ name: event.target.value })}
                    placeholder='Filter by name'
                    aria-label='Filter servers by name'
                    className='pla:w-full pla:rounded-md pla:border pla:border-input-border pla:bg-input pla:py-1.5 pla:pr-2 pla:pl-8 pla:text-sm pla:outline-none pla:focus:border-primary'
                />
            </div>
            <div className='prism-switch pla:flex pla:gap-1 pla:rounded-lg pla:bg-muted/50 pla:p-0.5' role='group' aria-label='Status'>
                {(['all', 'online', 'offline'] as const).map((status) => (
                    <button
                        key={status}
                        type='button'
                        aria-pressed={filters.status === status}
                        onClick={() => setFilters({ status })}
                        className={cn('prism-switch-item pla:flex-1 pla:cursor-pointer pla:rounded-md pla:py-1 pla:text-xs pla:capitalize', filters.status === status ? 'pla:bg-card pla:font-semibold pla:text-foreground pla:shadow-sm' : 'pla:text-muted-foreground pla:hover:text-foreground')}
                    >
                        {status}
                    </button>
                ))}
            </div>
            {games.length > 1 && (
                <div className='pla:flex pla:flex-wrap pla:gap-1.5' role='group' aria-label='Game'>
                    {games.map((game) => (
                        <button key={game} type='button' aria-pressed={filters.game === game} onClick={() => setFilters({ game: filters.game === game ? null : game })} className={chip(filters.game === game)}>
                            <span className='pla:size-2 pla:rounded-full' style={{ background: eggColor([game]) ?? 'var(--primary)' }} />
                            {game}
                        </button>
                    ))}
                </div>
            )}
            <p className='pla:px-1 pla:text-xs pla:text-muted-foreground'>
                {filtering(filters) ? `${shown} of ${servers.length} shown` : `${servers.length} ${servers.length === 1 ? 'server' : 'servers'}`}
                {paged && ' · filters this page'}
            </p>
        </section>
    );
}

function Recent() {
    const { servers } = useDashboard();
    const [recent] = useState(readRecent);

    return (
        <section aria-label='Recent servers' className='pla:flex pla:flex-col pla:gap-0.5'>
            <p className={heading}>Recent</p>
            {recent.length === 0 ? (
                <p className='pla:px-1 pla:text-xs pla:text-muted-foreground'>Servers you open show up here.</p>
            ) : (
                recent.map((item) => {
                    const server = servers.find((entry) => entry.identifier === item.identifier);

                    return (
                        <PanelLink key={item.identifier} destination={{ to: '/server/$id', params: { id: item.identifier } }} className={itemClass('list')}>
                            <span className={cn('pla:size-2 pla:shrink-0 pla:rounded-full', !server || server.power === null ? 'pla:bg-muted-foreground/40' : online(server) ? 'pla:bg-success' : 'pla:bg-destructive')} />
                            <span className='pla:min-w-0 pla:truncate'>{item.name}</span>
                        </PanelLink>
                    );
                })
            )}
        </section>
    );
}

/** The dashboard's sidebar: how the servers are doing, filters for the cards and recent servers. */
export default function DashboardPanel({ variant }: { variant: 'list' | 'icons' }) {
    if (variant === 'list') {
        return (
            <div className='pla:flex pla:flex-col pla:gap-5'>
                <Overview />
                <FilterPanel />
                <Recent />
            </div>
        );
    }

    return (
        <div className='pla:flex pla:flex-col pla:items-center pla:gap-1'>
            <Popover icon='activity' label='Overview'>
                <Overview />
            </Popover>
            <Popover icon='filter' label='Filters' marked={filtering(useDashboard().filters)}>
                <FilterPanel />
            </Popover>
            <Popover icon='history' label='Recent servers'>
                <Recent />
            </Popover>
        </div>
    );
}

/**
 * An icon on the rail that opens its section beside the rail. The section is drawn on the page's
 * top layer, placed by the button, so the rail's scrolling and clipping never cut it off.
 */
function Popover({ icon, label, marked, children }: { icon: string; label: string; marked?: boolean; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
    const box = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!open) return;
        const measure = () => {
            const button = box.current?.getBoundingClientRect();
            if (!button) return;
            const height = panel.current?.offsetHeight ?? 0;
            setPlace({ left: button.right + 8, top: Math.max(8, Math.min(button.top, window.innerHeight - height - 8)) });
        };
        measure();
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);

        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const away = (event: MouseEvent) => !box.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node) && setOpen(false);
        const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', away);
        document.addEventListener('keydown', escape);

        return () => {
            document.removeEventListener('mousedown', away);
            document.removeEventListener('keydown', escape);
        };
    }, [open]);

    return (
        <div ref={box} className='pla:relative'>
            <button type='button' onClick={() => { setPlace(null); setOpen(!open); }} aria-expanded={open} aria-label={label} title={label} className={cn(itemClass('icons'), 'pla:relative', open && 'pla:bg-sidebar-accent pla:text-foreground')}>
                <NamedIcon name={icon} size={16} />
                {marked && <span className='pla:absolute pla:top-2 pla:right-2 pla:size-1.5 pla:rounded-full pla:bg-primary' />}
            </button>
            {open &&
                createPortal(
                    <div
                        ref={panel}
                        role='dialog'
                        aria-label={label}
                        style={{ left: place?.left ?? 0, top: place?.top ?? 0, visibility: place ? 'visible' : 'hidden' }}
                        className='pt-surface pla:fixed pla:z-50 pla:max-h-[calc(100dvh-1rem)] pla:w-64 pla:overflow-y-auto pla:rounded-lg pla:border pla:border-border pla:bg-popover pla:p-3 pla:shadow-xl'
                    >
                        {children}
                    </div>,
                    document.body
                )}
        </div>
    );
}
