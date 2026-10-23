import { Badge, NamedIcon, PanelLink, cn, http, toast, httpErrorToHuman } from '@pterodactyl/sdk';
import { Navigation, NavigationLink, Slot, type AppArea, type AppLayoutModel, type NavItem, type ServerArea } from '@pterodactyl/sdk/theme';
import { useState } from 'react';

export type Variant = 'list' | 'icons' | 'tabs';

export const itemClass = (variant: Variant) =>
    cn(
        'flex items-center gap-3 rounded-lg text-sm text-muted-foreground no-underline transition-colors',
        'hover:bg-sidebar-accent hover:text-foreground data-[status=active]:bg-primary/15 data-[status=active]:text-foreground data-[status=active]:font-medium',
        variant === 'list' && 'px-3 py-2',
        variant === 'icons' && 'size-10 justify-center',
        variant === 'tabs' && 'shrink-0 px-3 py-1.5 whitespace-nowrap data-[status=active]:bg-transparent data-[status=active]:shadow-[inset_0_-2px_0_var(--primary)] rounded-none hover:bg-transparent'
    );

/** The dashboard, admin area and account. */
export function MainLinks({ model, variant }: { model: AppLayoutModel; variant: Variant }) {
    return (
        <>
            <Slot name='nav.items.before' />
            {model.links.map((link) => (
                <PanelLink key={link.id} destination={link.destination} exact={link.exact} className={itemClass(variant)} title={variant === 'icons' ? link.label : undefined} aria-label={link.label}>
                    <NamedIcon name={link.icon} size={16} aria-hidden />
                    {variant !== 'icons' && <span className='min-w-0 truncate'>{link.label}</span>}
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
    const groups = groupsOf(area, items, grouped && variant === 'list');

    return (
        <nav aria-label={{ server: 'Server', account: 'Account', admin: 'Administration' }[area.kind]} className={cn('flex', variant === 'tabs' || row ? 'items-stretch gap-1 overflow-x-auto' : 'flex-col gap-1', variant === 'icons' && 'items-center')}>
            <AreaSlot area={area} at='before' />
            {groups.map(([name, list]) => (
                <div key={name ?? 'all'} className={cn('flex', variant === 'tabs' || row ? 'items-end gap-1' : 'flex-col gap-0.5', variant === 'icons' && 'items-center')}>
                    {name && variant === 'list' && <p className='px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase'>{name}</p>}
                    <Navigation items={list}>
                        {(item, { badge }) => (
                            <NavigationLink item={item} className={cn(itemClass(variant), itemExtra)} title={variant === 'icons' ? item.label : undefined}>
                                {item.icon && <NamedIcon name={item.icon} size={16} aria-hidden />}
                                {variant !== 'icons' && <span className='min-w-0 flex-1 truncate'>{item.label}</span>}
                                {variant !== 'icons' && badge}
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

/** The open server's name, status and power buttons, above its pages. */
export function ServerCard({ area }: { area: ServerArea }) {
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
    const button = 'flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground disabled:opacity-40';

    return (
        <div className='pt-surface rounded-lg border border-border bg-card p-3'>
            <div className='flex items-center gap-2'>
                <span className='min-w-0 flex-1 truncate text-sm font-semibold'>{area.name}</span>
                <Badge size='sm' tone={state.tone}>
                    {state.label}
                </Badge>
            </div>
            {area.state && (
                <div className='mt-2 flex gap-1'>
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
        <div className={cn('flex', variant === 'list' ? 'flex-col gap-0.5' : 'items-center gap-1')}>
            {links.map((link) => (
                <a key={link.url} href={link.url} target='_blank' rel='noopener noreferrer' className={itemClass(variant === 'tabs' ? 'list' : variant)} title={link.label}>
                    <NamedIcon name={/discord/i.test(link.url + link.label) ? 'message-circle' : /store|shop/i.test(link.url + link.label) ? 'shopping-bag' : 'external-link'} size={16} aria-hidden />
                    {variant === 'list' && <span className='truncate'>{link.label}</span>}
                </a>
            ))}
        </div>
    );
}
