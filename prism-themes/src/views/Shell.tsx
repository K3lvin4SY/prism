import { useEffect, useState, type ReactNode } from 'react';
import { Avatar, NamedIcon, PanelLink, SpinnerOverlay, cn, usePanelLocation } from '@pterodactyl/sdk';
import { Main, View, type AppLayoutModel, type ViewProps } from '@pterodactyl/sdk/theme';
import { useSettings, type Bars } from '../settings';
import Announcement from './Announcement';
import CommandPalette from './CommandPalette';
import { AreaNav, FooterLinks, MainLinks, ServerCard, itemClass } from './nav';

const has = {
    sidebar: (bars: Bars) => bars === 'sidebar' || bars === 'sidebar_top',
    rail: (bars: Bars) => bars === 'rail' || bars === 'rail_top',
    top: (bars: Bars) => bars === 'top' || bars === 'sidebar_top' || bars === 'rail_top' || bars === 'top_dock',
    dock: (bars: Bars) => bars === 'dock' || bars === 'top_dock',
};

/** The logo, beside or instead of the name as Prism Branding says; a square one where space is tight. */
function Brand({ model, compact }: { model: AppLayoutModel; compact?: boolean }) {
    const beside = document.documentElement.dataset.pbrLogo === 'beside';
    const square = getComputedStyle(document.documentElement).getPropertyValue('--brand-logo-square').trim();

    if (compact) {
        return (
            <PanelLink destination={{ to: '/' }} aria-label={model.brand.name} className='flex size-10 items-center justify-center rounded-lg bg-primary/15 font-semibold text-primary no-underline' style={square ? { background: `${square} center / contain no-repeat` } : undefined}>
                {!square && model.brand.name.charAt(0).toUpperCase()}
            </PanelLink>
        );
    }

    return (
        <div id='logo' className='min-w-0'>
            <PanelLink destination={{ to: '/' }} className='flex min-w-0 items-center gap-2.5 px-2 font-header text-lg font-semibold text-foreground no-underline'>
                {model.brand.logoUrl && <img src={model.brand.logoUrl} alt={beside ? '' : model.brand.name} style={{ height: 'var(--pbr-logo-height, 2rem)' }} className='w-auto shrink-0' />}
                {(!model.brand.logoUrl || beside) && <span className='truncate'>{model.brand.name}</span>}
            </PanelLink>
        </div>
    );
}

function User({ model, compact, onPalette }: { model: AppLayoutModel; compact?: boolean; onPalette: (() => void) | null }) {
    const settings = useSettings();
    const button = itemClass('icons');

    return (
        <div className={cn('flex items-center gap-1', compact && 'flex-col')}>
            {onPalette && (
                <button type='button' onClick={onPalette} className={button} title='Search and jump (Ctrl+K)' aria-label='Search and jump'>
                    <NamedIcon name='command' size={16} />
                </button>
            )}
            {settings.scheme_switch && model.setScheme && (
                <button type='button' onClick={() => model.setScheme?.(model.scheme === 'dark' ? 'light' : 'dark')} className={button} title={model.scheme === 'dark' ? 'Use light' : 'Use dark'} aria-label={model.scheme === 'dark' ? 'Use the light scheme' : 'Use the dark scheme'}>
                    <NamedIcon name={model.scheme === 'dark' ? 'sun' : 'moon'} size={16} />
                </button>
            )}
            <span className='flex size-10 items-center justify-center' title={model.user.username}>
                <Avatar name={model.user.uuid} size={26} />
            </span>
            <button type='button' onClick={model.signOut} className={button} title='Sign out' aria-label='Sign out'>
                <NamedIcon name='log-out' size={16} />
            </button>
        </div>
    );
}

/**
 * The whole frame: one of seven navigation layouts around the page, the background, the
 * announcement and the Ctrl+K palette.
 */
export default function Shell({ model, children, Default }: ViewProps<'layout.app'>) {
    const settings = useSettings();
    const { pathname } = usePanelLocation();
    const [drawer, setDrawer] = useState(false);
    const [palette, setPalette] = useState(false);
    const bars = settings.bars;

    useEffect(() => setDrawer(false), [pathname]);

    // The admin area can keep the panel's own frame.
    if (model.area.kind === 'admin' && !settings.admin_styled) return <Default />;

    const links = [1, 2, 3]
        .map((n) => ({ label: String(settings[`link${n}_label` as keyof typeof settings] ?? ''), url: String(settings[`link${n}_url` as keyof typeof settings] ?? '') }))
        .filter((link) => /^https?:\/\//.test(link.url));
    const openPalette = settings.command_palette ? () => setPalette(true) : null;
    const area = model.area;
    const sideCard = settings.server_card && area.kind === 'server' ? <ServerCard area={area} /> : null;

    const sidebar = (
        <aside className={cn('pt-bar flex-col gap-4 overflow-y-auto border-r border-sidebar-border bg-sidebar p-3 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-sidebar lg:shrink-0', drawer ? 'fixed inset-y-0 left-0 z-40 flex w-72' : 'hidden')}>
            {!has.top(bars) && <Brand model={model} />}
            {!has.top(bars) && (
                <nav aria-label='Main' className='flex flex-col gap-0.5'>
                    <MainLinks model={model} variant='list' />
                </nav>
            )}
            {sideCard}
            <AreaNav area={area} variant='list' grouped={settings.group_nav} />
            {!has.top(bars) && <View name='app.search' className={itemClass('list')} />}
            <div className='mt-auto flex flex-col gap-2'>
                <FooterLinks links={links} variant='list' />
                {!has.top(bars) && <User model={model} onPalette={openPalette} />}
            </div>
        </aside>
    );

    const rail = (
        <aside className={cn('pt-bar flex-col items-center gap-3 border-r border-sidebar-border bg-sidebar px-2 py-3 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-16 lg:shrink-0', drawer ? 'fixed inset-y-0 left-0 z-40 flex w-16 overflow-y-auto' : 'hidden')}>
            {!has.top(bars) && <Brand model={model} compact />}
            {!has.top(bars) && (
                <nav aria-label='Main' className='flex flex-col items-center gap-1'>
                    <MainLinks model={model} variant='icons' />
                </nav>
            )}
            {area.kind !== 'dashboard' && <div className='h-px w-8 bg-border' />}
            <AreaNav area={area} variant='icons' grouped={false} />
            <div className='mt-auto flex flex-col items-center gap-1'>
                <FooterLinks links={links} variant='icons' />
                {!has.top(bars) && <User model={model} compact onPalette={openPalette} />}
            </div>
        </aside>
    );

    const top = (
        <header className='pt-bar sticky top-0 z-30 border-b border-border bg-sidebar'>
            <div className='mx-auto flex h-14 w-full max-w-panel items-center gap-3 px-3'>
                {(has.sidebar(bars) || has.rail(bars)) && (
                    <button type='button' onClick={() => setDrawer(!drawer)} className={cn(itemClass('icons'), 'lg:hidden')} aria-label='Menu' aria-expanded={drawer}>
                        <NamedIcon name='menu' size={18} />
                    </button>
                )}
                <Brand model={model} />
                <nav aria-label='Main' className='flex min-w-0 flex-1 items-center gap-1 overflow-x-auto'>
                    <MainLinks model={model} variant={bars === 'top' || bars === 'top_dock' ? 'list' : 'icons'} />
                </nav>
                <View name='app.search' className={itemClass('icons')} />
                {bars !== 'top' && <FooterLinks links={has.sidebar(bars) ? [] : links} variant='icons' />}
                <User model={model} onPalette={openPalette} />
            </div>
            {bars === 'top' && area.kind !== 'dashboard' && (
                <div className='border-t border-border'>
                    <div className='mx-auto flex w-full max-w-panel items-center gap-3 px-3'>
                        {area.kind === 'server' && <span className='shrink-0 py-2 text-sm font-semibold'>{area.name}</span>}
                        <AreaNav area={area} variant='tabs' grouped={false} />
                    </div>
                </div>
            )}
        </header>
    );

    const dockItems = bars === 'dock' ? 'all' : 'area';
    const dock = (
        <nav aria-label='Dock' className='pointer-events-none fixed inset-x-0 bottom-3 z-30 flex justify-center px-3'>
            <div className='pt-bar pt-dock pointer-events-auto flex max-w-full items-end gap-1 overflow-x-auto rounded-2xl border border-border bg-sidebar/90 px-2 py-1.5 shadow-xl backdrop-blur'>
                {dockItems === 'all' &&
                    model.links.map((link) => (
                        <PanelLink key={link.id} destination={link.destination} exact={link.exact} className={cn(itemClass('icons'), 'pt-dock-item')} title={link.label} aria-label={link.label}>
                            <NamedIcon name={link.icon} size={18} />
                        </PanelLink>
                    ))}
                {dockItems === 'all' && area.kind !== 'dashboard' && <span className='mx-1 h-8 w-px self-center bg-border' />}
                <DockArea model={model} />
                {dockItems === 'area' && area.kind === 'dashboard' &&
                    model.links.map((link) => (
                        <PanelLink key={link.id} destination={link.destination} exact={link.exact} className={cn(itemClass('icons'), 'pt-dock-item')} title={link.label} aria-label={link.label}>
                            <NamedIcon name={link.icon} size={18} />
                        </PanelLink>
                    ))}
            </div>
        </nav>
    );

    const smallHeader = (
        <header className='pt-bar sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-sidebar px-3'>
            <Brand model={model} />
            <div className='flex-1' />
            <View name='app.search' className={itemClass('icons')} />
            <FooterLinks links={links} variant='icons' />
            <User model={model} onPalette={openPalette} />
        </header>
    );

    return (
        <div className='flex min-h-dvh'>
            <div className='pt-bg' aria-hidden>
                <i />
            </div>
            <SpinnerOverlay visible={model.signingOut} fixed />
            {drawer && <button type='button' aria-label='Close the menu' className='fixed inset-0 z-30 bg-black/40 lg:hidden' onClick={() => setDrawer(false)} />}
            {has.sidebar(bars) && sidebar}
            {has.rail(bars) && rail}
            <div className='flex min-w-0 flex-1 flex-col'>
                {has.top(bars) ? top : bars === 'dock' ? smallHeader : <MobileBar model={model} onMenu={() => setDrawer(!drawer)} open={drawer} />}
                <Announcement model={model} />
                <Main className={cn('min-w-0 flex-1', has.dock(bars) && 'pb-24')}>{children as ReactNode}</Main>
            </div>
            {has.dock(bars) && dock}
            {settings.command_palette && <CommandPalette model={model} open={palette} onOpen={() => setPalette(true)} onClose={() => setPalette(false)} />}
        </div>
    );
}

/** The area's pages as dock icons, with the server card's colour on a server. */
function DockArea({ model }: { model: AppLayoutModel }) {
    const area = model.area;
    if (area.kind === 'dashboard') return null;

    return (
        <div className='flex items-end gap-1'>
            <AreaNav area={area} variant='icons' grouped={false} row itemExtra='pt-dock-item' />
        </div>
    );
}

/** On phones, a bar with the menu button for the sidebar and rail layouts. */
function MobileBar({ model, onMenu, open }: { model: AppLayoutModel; onMenu: () => void; open: boolean }) {
    return (
        <div className='pt-bar sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-sidebar px-2 lg:hidden'>
            <button type='button' onClick={onMenu} className={itemClass('icons')} aria-label='Menu' aria-expanded={open}>
                <NamedIcon name='menu' size={18} />
            </button>
            <Brand model={model} />
        </div>
    );
}
