import { useEffect, useState, type ReactNode } from 'react';
import { Avatar, NamedIcon, PanelLink, SpinnerOverlay, cn, usePanelLocation } from '@pterodactyl/sdk';
import { Main, type AppLayoutModel, type ViewProps } from '@pterodactyl/sdk/theme';
import { cssString, useSettings, type Bars } from '../settings';
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
    const settings = useSettings();
    const beside = settings.logo_mode === 'beside';
    const logo = settings.logo_mode === 'name' ? null : model.brand.logoUrl;
    const square = getComputedStyle(document.documentElement).getPropertyValue('--brand-logo-square').trim();

    if (compact) {
        return (
            <PanelLink destination={{ to: '/' }} aria-label={model.brand.name} className='pla:flex pla:size-10 pla:items-center pla:justify-center pla:rounded-lg pla:bg-primary/15 pla:font-semibold pla:text-primary pla:no-underline' style={square ? { background: `${square} center / contain no-repeat` } : undefined}>
                {!square && model.brand.name.charAt(0).toUpperCase()}
            </PanelLink>
        );
    }

    return (
        <div id='logo' className='pla:min-w-0'>
            <PanelLink destination={{ to: '/' }} className='pla:flex pla:min-w-0 pla:items-center pla:gap-2.5 pla:px-2 pla:font-header pla:text-lg pla:font-semibold pla:text-foreground pla:no-underline'>
                {logo && <img src={logo} alt={beside ? '' : model.brand.name} style={{ height: 'var(--pla-logo-height, 2rem)' }} className='pla:w-auto pla:shrink-0' />}
                {(!logo || beside) && <span className='pla:truncate'>{model.brand.name}</span>}
            </PanelLink>
        </div>
    );
}

function User({ model, compact, onPalette }: { model: AppLayoutModel; compact?: boolean; onPalette: (() => void) | null }) {
    const settings = useSettings();
    const button = itemClass('icons');

    return (
        <div className={cn('pla:flex pla:items-center pla:gap-1', compact && 'pla:flex-col')}>
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
            <span className='pla:flex pla:size-10 pla:items-center pla:justify-center' title={model.user.username}>
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

    // Off, or in an admin area kept as it was: the panel's own frame, with the logo choice.
    if (!settings.enabled || (model.area.kind === 'admin' && !settings.admin_styled)) return <PanelFrame model={model} Default={Default} />;

    const links = [1, 2, 3]
        .map((n) => ({ label: String(settings[`link${n}_label` as keyof typeof settings] ?? ''), url: String(settings[`link${n}_url` as keyof typeof settings] ?? '') }))
        .filter((link) => /^https?:\/\//.test(link.url));
    const openPalette = settings.command_palette ? () => setPalette(true) : null;
    const area = model.area;
    const sideCard = settings.server_card && area.kind === 'server' ? <ServerCard area={area} /> : null;

    const sidebar = (
        <aside className={cn('pt-bar pla:flex-col pla:gap-4 pla:overflow-y-auto pla:border-r pla:border-sidebar-border pla:bg-sidebar pla:p-3 pla:lg:sticky pla:lg:top-0 pla:lg:flex pla:lg:h-dvh pla:lg:w-sidebar pla:lg:shrink-0', drawer ? 'pla:fixed pla:inset-y-0 pla:left-0 pla:z-40 pla:flex pla:w-72' : 'pla:hidden')}>
            {!has.top(bars) && <Brand model={model} />}
            {!has.top(bars) && (
                <nav aria-label='Main' className='pla:flex pla:flex-col pla:gap-0.5'>
                    <MainLinks model={model} variant='list' />
                </nav>
            )}
            {sideCard}
            <AreaNav area={area} variant='list' grouped={settings.group_nav} />
            <div className='pla:mt-auto pla:flex pla:flex-col pla:gap-2'>
                <FooterLinks links={links} variant='list' />
                {!has.top(bars) && <User model={model} onPalette={openPalette} />}
            </div>
        </aside>
    );

    const rail = (
        <aside className={cn('pt-bar pla:flex-col pla:items-center pla:gap-3 pla:border-r pla:border-sidebar-border pla:bg-sidebar pla:px-2 pla:py-3 pla:lg:sticky pla:lg:top-0 pla:lg:flex pla:lg:h-dvh pla:lg:w-16 pla:lg:shrink-0', drawer ? 'pla:fixed pla:inset-y-0 pla:left-0 pla:z-40 pla:flex pla:w-16 pla:overflow-y-auto' : 'pla:hidden')}>
            {!has.top(bars) && <Brand model={model} compact />}
            {!has.top(bars) && (
                <nav aria-label='Main' className='pla:flex pla:flex-col pla:items-center pla:gap-1'>
                    <MainLinks model={model} variant='icons' />
                </nav>
            )}
            {area.kind !== 'dashboard' && <div className='pla:h-px pla:w-8 pla:bg-border' />}
            <AreaNav area={area} variant='icons' grouped={false} />
            <div className='pla:mt-auto pla:flex pla:flex-col pla:items-center pla:gap-1'>
                <FooterLinks links={links} variant='icons' />
                {!has.top(bars) && <User model={model} compact onPalette={openPalette} />}
            </div>
        </aside>
    );

    const top = (
        <header className='pt-bar pla:sticky pla:top-0 pla:z-30 pla:border-b pla:border-border pla:bg-sidebar'>
            <div className='pla:mx-auto pla:flex pla:h-14 pla:w-full pla:max-w-panel pla:items-center pla:gap-3 pla:px-3'>
                {(has.sidebar(bars) || has.rail(bars)) && (
                    <button type='button' onClick={() => setDrawer(!drawer)} className={cn(itemClass('icons'), 'pla:lg:hidden')} aria-label='Menu' aria-expanded={drawer}>
                        <NamedIcon name='menu' size={18} />
                    </button>
                )}
                <Brand model={model} />
                <nav aria-label='Main' className='pla:flex pla:min-w-0 pla:flex-1 pla:items-center pla:gap-1 pla:overflow-x-auto'>
                    <MainLinks model={model} variant={bars === 'top' || bars === 'top_dock' ? 'list' : 'icons'} />
                </nav>
                {bars !== 'top' && <FooterLinks links={has.sidebar(bars) ? [] : links} variant='icons' />}
                <User model={model} onPalette={openPalette} />
            </div>
            {bars === 'top' && area.kind !== 'dashboard' && (
                <div className='pla:border-t pla:border-border'>
                    <div className='pla:mx-auto pla:flex pla:w-full pla:max-w-panel pla:items-center pla:gap-3 pla:px-3'>
                        {area.kind === 'server' && <span className='pla:shrink-0 pla:py-2 pla:text-sm pla:font-semibold'>{area.name}</span>}
                        <AreaNav area={area} variant='tabs' grouped={false} />
                    </div>
                </div>
            )}
        </header>
    );

    const dockItems = bars === 'dock' ? 'all' : 'area';
    const dock = (
        <nav aria-label='Dock' className='pla:pointer-events-none pla:fixed pla:inset-x-0 pla:bottom-3 pla:z-30 pla:flex pla:justify-center pla:px-3'>
            <div className='pt-bar pla-dock pla:pointer-events-auto pla:flex pla:max-w-full pla:items-end pla:gap-1 pla:overflow-x-auto pla:rounded-2xl pla:border pla:border-border pla:bg-sidebar/90 pla:px-2 pla:py-1.5 pla:shadow-xl pla:backdrop-blur'>
                {dockItems === 'all' &&
                    model.links.map((link) => (
                        <PanelLink key={link.id} destination={link.destination} exact={link.exact} className={cn(itemClass('icons'), 'pla-dock-item')} title={link.label} aria-label={link.label}>
                            <NamedIcon name={link.icon} size={18} />
                        </PanelLink>
                    ))}
                {dockItems === 'all' && area.kind !== 'dashboard' && <span className='pla:mx-1 pla:h-8 pla:w-px pla:self-center pla:bg-border' />}
                <DockArea model={model} />
                {dockItems === 'area' && area.kind === 'dashboard' &&
                    model.links.map((link) => (
                        <PanelLink key={link.id} destination={link.destination} exact={link.exact} className={cn(itemClass('icons'), 'pla-dock-item')} title={link.label} aria-label={link.label}>
                            <NamedIcon name={link.icon} size={18} />
                        </PanelLink>
                    ))}
            </div>
        </nav>
    );

    const smallHeader = (
        <header className='pt-bar pla:sticky pla:top-0 pla:z-30 pla:flex pla:h-14 pla:items-center pla:gap-3 pla:border-b pla:border-border pla:bg-sidebar pla:px-3'>
            <Brand model={model} />
            <div className='pla:flex-1' />
            <FooterLinks links={links} variant='icons' />
            <User model={model} onPalette={openPalette} />
        </header>
    );

    return (
        <div className='pla:flex pla:min-h-dvh'>
            <SpinnerOverlay visible={model.signingOut} fixed />
            {drawer && <button type='button' aria-label='Close the menu' className='pla:fixed pla:inset-0 pla:z-30 pla:bg-black/40 pla:lg:hidden' onClick={() => setDrawer(false)} />}
            {has.sidebar(bars) && sidebar}
            {has.rail(bars) && rail}
            <div className='pla:flex pla:min-w-0 pla:flex-1 pla:flex-col'>
                {has.top(bars) ? top : bars === 'dock' ? smallHeader : <MobileBar model={model} onMenu={() => setDrawer(!drawer)} open={drawer} />}
                <Announcement model={model} />
                <Main className={cn('pla:min-w-0 pla:flex-1', has.dock(bars) && 'pla:pb-24')}>{children as ReactNode}</Main>
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
        <div className='pla:flex pla:items-end pla:gap-1'>
            <AreaNav area={area} variant='icons' grouped={false} row itemExtra='pla-dock-item' />
        </div>
    );
}

/** On phones, a bar with the menu button for the sidebar and rail layouts. */
function MobileBar({ model, onMenu, open }: { model: AppLayoutModel; onMenu: () => void; open: boolean }) {
    return (
        <div className='pt-bar pla:sticky pla:top-0 pla:z-30 pla:flex pla:h-12 pla:items-center pla:gap-2 pla:border-b pla:border-border pla:bg-sidebar pla:px-2 pla:lg:hidden'>
            <button type='button' onClick={onMenu} className={itemClass('icons')} aria-label='Menu' aria-expanded={open}>
                <NamedIcon name='menu' size={18} />
            </button>
            <Brand model={model} />
        </div>
    );
}

/**
 * The panel's own layout with the logo choice: "Name only" hides any logo, and "Beside the name"
 * adds the company name after it through the stylesheet.
 */
function PanelFrame({ model, Default }: { model: AppLayoutModel; Default: ViewProps<'layout.app'>['Default'] }) {
    const settings = useSettings();
    const name = model.brand.name;

    useEffect(() => {
        document.documentElement.style.setProperty('--pla-name', cssString(name));
    }, [name]);

    if (settings.logo_mode === 'name') return <Default model={{ ...model, brand: { ...model.brand, logoUrl: null } }} />;

    return <Default />;
}
