import { Badge, NamedIcon, PanelLink, cn, http, toast, httpErrorToHuman } from '@pterodactyl/sdk';
import { Navigation, NavigationLink, Slot, type AppArea, type AppLayoutModel, type NavItem, type ServerArea } from '@pterodactyl/sdk/theme';
import { useState } from 'react';

/** list: the sidebar; fold: the sidebar that folds into a rail, icons kept in place; icons: the rail; tabs: the top bar. */
export type Variant = 'list' | 'fold' | 'icons' | 'tabs';

/** Labels and headings in a folding sidebar fade out as it folds; the stylesheet does it. */
const foldLabel = (variant: Variant) => (variant === 'fold' ? 'pla-fold-label' : undefined);

export const itemClass = (variant: Variant) =>
    cn(
        'pla:flex pla:items-center pla:gap-3 pla:rounded-lg pla:text-sm pla:text-muted-foreground pla:no-underline pla:transition-colors',
        'pla:hover:bg-sidebar-accent pla:hover:text-foreground pla:data-[status=active]:bg-primary/15 pla:data-[status=active]:text-foreground pla:data-[status=active]:font-medium',
        variant === 'list' && 'pla:px-3 pla:py-2',
        // The icon sits 1.5rem from the edge in both widths, the centre of the 4rem rail.
        variant === 'fold' && 'pla:h-10 pla:shrink-0 pla:overflow-hidden pla:px-4',
        variant === 'icons' && 'pla:size-10 pla:justify-center',
        variant === 'tabs' && 'pla:shrink-0 pla:px-3 pla:py-1.5 pla:whitespace-nowrap pla:data-[status=active]:bg-transparent pla:data-[status=active]:shadow-[inset_0_-2px_0_var(--primary)] pla:rounded-none pla:hover:bg-transparent'
    );

/** The dashboard, admin area and account. */
export function MainLinks({ model, variant }: { model: AppLayoutModel; variant: Variant }) {
    return (
        <>
            <Slot name='nav.items.before' />
            {model.links.map((link) => (
                <PanelLink key={link.id} destination={link.destination} exact={link.exact} className={itemClass(variant)} title={variant === 'icons' || variant === 'fold' ? link.label : undefined} aria-label={link.label}>
                    <NamedIcon name={link.icon} size={16} aria-hidden className='pla:shrink-0' />
                    {variant !== 'icons' && <span className={cn('pla:min-w-0 pla:truncate', foldLabel(variant))}>{link.label}</span>}
                </PanelLink>
            ))}
            <Slot name='nav.items.after' />
        </>
    );
}

type Area = Exclude<AppArea, { kind: 'dashboard' }>;

/** Where each of a server's own pages goes when the pages are grouped. */
const SERVER_GROUPS: [string, string[]][] = [
    ['Manage', ['index', 'console', 'activity', 'users', 'schedules']],
    ['Files and data', ['files', 'databases', 'backups']],
    ['Configuration', ['network', 'startup', 'settings']],
];

function groupsOf(area: Area, items: readonly NavItem[], grouped: boolean): [string | null, NavItem[]][] {
    if (!grouped) return [[null, [...items]]];

    const groups = new Map<string, NavItem[]>();
    const add = (name: string, item: NavItem) => groups.set(name, [...(groups.get(name) ?? []), item]);
    for (const item of items) {
        if (item.group) add(item.group, item);
        else if (area.kind === 'server' && !item.extensionId) add(SERVER_GROUPS.find(([, ids]) => ids.includes(item.id))?.[0] ?? 'Manage', item);
        else add(area.kind === 'server' ? 'More' : '', item);
    }

    // Core groups first, in their order, then the rest as they came.
    const order = SERVER_GROUPS.map(([name]) => name);

    return [...groups.entries()].sort(([a], [b]) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b))).map(([name, list]) => [name || null, list]);
}

function AreaSlot({ area, at }: { area: Area; at: 'before' | 'after' }) {
    if (area.kind === 'server') return <Slot name={`server.navigation.${at}`} data={area.server} />;
    if (area.kind === 'account') return <Slot name={`account.navigation.${at}`} />;

    return <Slot name={`panel.navigation.${at}`} />;
}

/** The pages of the area the user is in: a server's, the account's or the admin area's. */
export function AreaNav({ area, variant, grouped, row = false, itemExtra }: { area: AppArea; variant: Variant; grouped: boolean; row?: boolean; itemExtra?: string }) {
    if (area.kind === 'dashboard') return null;

    const items = area.kind === 'server' && area.adminLink ? [...area.nav.items, area.adminLink] : area.nav.items;
    const groups = groupsOf(area, items, grouped && (variant === 'list' || variant === 'fold'));

    return (
        <nav aria-label={{ server: 'Server', account: 'Account', admin: 'Administration' }[area.kind]} className={cn('pla:flex', variant === 'tabs' ? 'pla:items-stretch pla:gap-1 pla:overflow-x-auto' : row ? 'pla:items-stretch pla:gap-1 pla:overflow-x-auto pla:lg:overflow-visible' : 'pla:flex-col pla:gap-1', variant === 'icons' && 'pla:items-center')}>
            <AreaSlot area={area} at='before' />
            {groups.map(([name, list]) => (
                <div key={name ?? 'all'} className={cn('pla:flex', variant === 'tabs' || row ? 'pla:items-end pla:gap-1' : 'pla:flex-col pla:gap-0.5', variant === 'icons' && 'pla:items-center')}>
                    {name && (variant === 'list' || variant === 'fold') && (
                        <p className={cn('pla:pt-3 pla:pb-1 pla:text-[11px] pla:font-semibold pla:tracking-wider pla:text-muted-foreground pla:uppercase', variant === 'fold' ? 'pla-fold-heading pla:relative pla:overflow-hidden pla:px-4 pla:whitespace-nowrap' : 'pla:px-3')}>{name}</p>
                    )}
                    <Navigation items={list}>
                        {(item, { badge }) => (
                            <NavigationLink item={item} className={cn(itemClass(variant), itemExtra)} title={variant === 'icons' || variant === 'fold' ? item.label : undefined}>
                                {item.icon && <NamedIcon name={item.icon} size={16} aria-hidden className='pla:shrink-0' />}
                                {variant === 'fold' ? (
                                    <span className='pla-fold-label pla:flex pla:min-w-0 pla:flex-1 pla:items-center pla:gap-2'>
                                        <span className='pla:min-w-0 pla:flex-1 pla:truncate'>{item.label}</span>
                                        {badge}
                                    </span>
                                ) : (
                                    variant !== 'icons' && (
                                        <>
                                            <span className='pla:min-w-0 pla:flex-1 pla:truncate'>{item.label}</span>
                                            {badge}
                                        </>
                                    )
                                )}
                            </NavigationLink>
                        )}
                    </Navigation>
                </div>
            ))}
            <AreaSlot area={area} at='after' />
        </nav>
    );
}

const STATE: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
    running: { label: 'Online', tone: 'success' },
    starting: { label: 'Starting', tone: 'warning' },
    stopping: { label: 'Stopping', tone: 'warning' },
    offline: { label: 'Offline', tone: 'danger' },
};

const DOT: Record<string, string> = { success: 'pla:bg-success', warning: 'pla:bg-warning', danger: 'pla:bg-destructive', neutral: 'pla:bg-muted-foreground' };

/**
 * The open server's name, status and power buttons, above its pages. Folded into the rail it keeps
 * its height, so the pages below it do not move: the initials with a status dot, and one button.
 */
export function ServerCard({ area, folded = false }: { area: ServerArea; folded?: boolean }) {
    const [busy, setBusy] = useState(false);
    const state = STATE[area.state ?? ''] ?? { label: 'Unknown', tone: 'neutral' as const };
    const power = async (signal: 'start' | 'restart' | 'stop') => {
        setBusy(true);
        try {
            await http.post(`/api/client/servers/${area.identifier}/power`, { signal });
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };
    const button = 'pla:flex pla:size-7 pla:items-center pla:justify-center pla:rounded-md pla:text-muted-foreground pla:hover:bg-sidebar-accent pla:hover:text-foreground pla:disabled:opacity-40';

    if (folded) {
        const initials = area.name
            .split(/[\s_-]+/)
            .filter(Boolean)
            .slice(-2)
            .map((word) => word.charAt(0).toUpperCase())
            .join('');
        const [signal, icon, label] = area.state === 'offline' ? (['start', 'play', 'Start'] as const) : (['restart', 'rotate-ccw', 'Restart'] as const);

        return (
            <div className='pt-surface pla:flex pla:shrink-0 pla:flex-col pla:items-center pla:rounded-lg pla:border pla:border-border pla:bg-card pla:py-3' title={`${area.name}: ${state.label}`}>
                <span className='pla:relative pla:flex pla:h-5 pla:items-center pla:text-xs pla:font-semibold'>
                    {initials || '?'}
                    <span className={cn('pla:absolute pla:-top-0.5 pla:-right-2 pla:size-2 pla:rounded-full', DOT[state.tone])} />
                </span>
                {area.state && (
                    <div className='pla:mt-2 pla:flex pla:h-7'>
                        <button type='button' disabled={busy} onClick={() => void power(signal)} className={button} title={label} aria-label={label}>
                            <NamedIcon name={icon} size={14} />
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className='pt-surface pla:shrink-0 pla:rounded-lg pla:border pla:border-border pla:bg-card pla:p-3'>
            <div className='pla:flex pla:h-5 pla:items-center pla:gap-2'>
                <span className='pla:min-w-0 pla:flex-1 pla:truncate pla:text-sm pla:font-semibold'>{area.name}</span>
                <Badge size='sm' tone={state.tone}>
                    {state.label}
                </Badge>
            </div>
            {area.state && (
                <div className='pla:mt-2 pla:flex pla:h-7 pla:gap-1'>
                    {area.state === 'offline' ? (
                        <button type='button' disabled={busy} onClick={() => void power('start')} className={button} title='Start' aria-label='Start'>
                            <NamedIcon name='play' size={14} />
                        </button>
                    ) : (
                        <>
                            <button type='button' disabled={busy} onClick={() => void power('restart')} className={button} title='Restart' aria-label='Restart'>
                                <NamedIcon name='rotate-ccw' size={14} />
                            </button>
                            <button type='button' disabled={busy} onClick={() => void power('stop')} className={button} title='Stop' aria-label='Stop'>
                                <NamedIcon name='square' size={14} />
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

/** The admin's own links, such as Discord or a store. */
export function FooterLinks({ links, variant }: { links: { label: string; url: string }[]; variant: Variant }) {
    if (links.length === 0) return null;

    return (
        <div className={cn('pla:flex', variant === 'list' || variant === 'fold' ? 'pla:flex-col pla:gap-0.5' : 'pla:items-center pla:gap-1')}>
            {links.map((link) => (
                <a key={link.url} href={link.url} target='_blank' rel='noopener noreferrer' className={itemClass(variant === 'tabs' ? 'list' : variant)} title={link.label} aria-label={link.label}>
                    <NamedIcon name={/discord/i.test(link.url + link.label) ? 'message-circle' : /store|shop/i.test(link.url + link.label) ? 'shopping-bag' : 'external-link'} size={16} aria-hidden />
                    {(variant === 'list' || variant === 'fold') && <span className={cn('pla:truncate', foldLabel(variant))}>{link.label}</span>}
                </a>
            ))}
        </div>
    );
}
