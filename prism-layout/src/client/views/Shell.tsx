import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Avatar, PanelLink, SpinnerOverlay, cn, usePanelLocation } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { Main, type AppLayoutModel, type ViewProps } from '@pterodactyl/sdk/theme';
import { remember } from '../dashboard';
import { cssString, useSettings, type Bars } from '../settings';
import Announcement from './Announcement';
import CommandPalette from './CommandPalette';
import DashboardPanel from './DashboardPanel';
import { AreaNav, FooterLinks, MainLinks, ServerCard, itemClass } from './nav';

const has = {
    sidebar: (bars: Bars) => bars === 'sidebar' || bars === 'sidebar_top',
    rail: (bars: Bars) => bars === 'rail' || bars === 'rail_top',
    top: (bars: Bars) => bars === 'top' || bars === 'sidebar_top' || bars === 'rail_top' || bars === 'top_dock',
    dock: (bars: Bars) => bars === 'dock' || bars === 'top_dock',
};

/** The logo, beside or instead of the name as Prism Branding says; a square one where space is tight. */
function Brand({ model, compact, fold }: { model: AppLayoutModel; compact?: boolean; fold?: boolean }) {
    const settings = useSettings();
    const beside = settings.logo_mode === 'beside';
    const logo = settings.logo_mode === 'name' ? null : model.brand.logoUrl;

    if (compact) {
        // The square logo where there is one, else the logo itself; the letter only without either.
        const mark = settings.logo_mode === 'name' ? null : (settings.logo_square ?? settings.logo);

        return mark ? (
            <PanelLink destination={{ to: '/' }} aria-label={model.brand.name} className='pla:flex pla:size-10 pla:shrink-0 pla:items-center pla:justify-center pla:rounded-lg pla:no-underline'>
                <img src={mark} alt='' className='pla:max-h-10 pla:max-w-10 pla:rounded-md pla:object-contain' />
            </PanelLink>
        ) : (
            <PanelLink destination={{ to: '/' }} aria-label={model.brand.name} className='pla:flex pla:size-10 pla:shrink-0 pla:items-center pla:justify-center pla:rounded-lg pla:bg-primary/15 pla:font-semibold pla:text-primary pla:no-underline'>
                {model.brand.name.charAt(0).toUpperCase()}
            </PanelLink>
        );
    }

    return (
        <div id='logo' className='pla:min-w-0'>
            <PanelLink destination={{ to: '/' }} className='pla:flex pla:min-w-0 pla:items-center pla:gap-2.5 pla:px-2 pla:font-header pla:text-lg pla:font-semibold pla:text-foreground pla:no-underline'>
                {logo && <img src={logo} alt={beside ? '' : model.brand.name} style={{ height: 'var(--pla-logo-height, 2rem)' }} className='pla:w-auto pla:shrink-0' />}
                {(!logo || beside) && <span className={cn('pla:truncate', fold && 'pla-fold-label')}>{model.brand.name}</span>}
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
            <PanelLink destination={{ to: '/account' }} className='pla:flex pla:size-10 pla:items-center pla:justify-center pla:rounded-full pla:transition-shadow pla:hover:ring-2 pla:hover:ring-primary/50' title={`Account settings: ${model.user.username}`} aria-label='Account settings'>
                <Avatar name={model.user.uuid} size={26} />
            </PanelLink>
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
export default function Shell({ model: panelModel, children, Default }: ViewProps<'layout.app'>) {
    // The dashboard is drawn as a dashboard everywhere its link shows, not as the panel's layers.
    const model = useMemo(() => ({ ...panelModel, links: panelModel.links.map((link) => (link.id === 'dashboard' ? { ...link, icon: 'layout-dashboard' } : link)) }), [panelModel]);
    const settings = useSettings();
    const { pathname } = usePanelLocation();
    const [drawer, setDrawer] = useState(false);
    const [palette, setPalette] = useState(false);
    const [collapsed, setCollapsed] = useState(readCollapsed);
    const area = model.area;

    useEffect(() => setDrawer(false), [pathname]);
    useEffect(() => {
        if (area.kind === 'server') remember({ identifier: area.identifier, name: area.name });
    }, [area]);

    // Off, or in an admin area kept as it was: the panel's own frame, with the logo choice.
    if (!settings.enabled || (area.kind === 'admin' && !settings.admin_styled)) return <PanelFrame model={model} Default={Default} />;

    // A collapsible sidebar is one element that narrows into a rail, so nothing jumps.
    const collapsible = settings.sidebar_collapse && has.sidebar(settings.bars);
    const folded = collapsible && collapsed;
    // The phone drawer always opens wide.
    const narrow = folded && !drawer;
    const bars: Bars = settings.bars;
    const toggle = () => {
        setCollapsed(!collapsed);
        writeCollapsed(!collapsed);
    };
    const collapseButton = collapsible && (
        <button type='button' onClick={toggle} className={cn(itemClass('icons'), 'pla:hidden pla:shrink-0 pla:lg:flex')} title={folded ? 'Expand the sidebar' : 'Collapse the sidebar'} aria-label={folded ? 'Expand the sidebar' : 'Collapse the sidebar'} aria-expanded={!folded}>
            <NamedIcon name={folded ? 'panel-left-open' : 'panel-left-close'} size={17} />
        </button>
    );
    // The logo goes to the sidebar's top when the admin asks and there is a top bar to take it from.
    const side = has.sidebar(bars) || has.rail(bars);
    const brandSide = settings.brand_place === 'sidebar' && has.top(bars) && side;
    const brandInSide = !has.top(bars) || brandSide;

    const links = [1, 2, 3]
        .map((n) => ({ label: String(settings[`link${n}_label` as keyof typeof settings] ?? ''), url: String(settings[`link${n}_url` as keyof typeof settings] ?? '') }))
        .filter((link) => /^https?:\/\//.test(link.url));
    const openPalette = settings.command_palette ? () => setPalette(true) : null;
    const sideCard = settings.server_card && area.kind === 'server' ? <ServerCard area={area} /> : null;
    const dashboard = settings.dashboard_panel && area.kind === 'dashboard';
    // Folded, a logo keeps its size and place and only the name beside it fades; without one, the initial shows.
    const foldLogo = settings.logo_mode !== 'name' && model.brand.logoUrl !== null;

    const sidebar = (
        <aside className={cn('pt-bar pla:flex-col pla:gap-4 pla:overflow-y-auto pla:border-r pla:border-sidebar-border pla:bg-sidebar pla:p-3 pla:lg:sticky pla:lg:top-0 pla:lg:flex pla:lg:h-dvh pla:lg:w-sidebar pla:lg:shrink-0', drawer ? 'pla:fixed pla:inset-y-0 pla:left-0 pla:z-40 pla:flex pla:w-72' : 'pla:hidden')}>
            {(brandInSide || (collapseButton && !has.top(bars))) && (
                <div className='pla:flex pla:items-center pla:gap-1'>
                    {brandInSide && (
                        <div className='pla:min-w-0 pla:flex-1'>
                            <Brand model={model} />
                        </div>
                    )}
                    {!has.top(bars) && collapseButton}
                </div>
            )}
            {!has.top(bars) && (
                <nav aria-label='Main' className='pla:flex pla:flex-col pla:gap-0.5'>
                    <MainLinks model={model} variant='list' />
                </nav>
            )}
            {sideCard}
            {dashboard && <DashboardPanel variant='list' />}
            <AreaNav area={area} variant='list' grouped={settings.group_nav} />
            <div className='pla:mt-auto pla:flex pla:flex-col pla:gap-2'>
                <FooterLinks links={links} variant='list' />
                {!has.top(bars) && <User model={model} onPalette={openPalette} />}
            </div>
        </aside>
    );

    const rail = (
        <aside className={cn('pt-bar pla:flex-col pla:items-center pla:gap-3 pla:border-r pla:border-sidebar-border pla:bg-sidebar pla:px-2 pla:py-3 pla:lg:sticky pla:lg:top-0 pla:lg:flex pla:lg:h-dvh pla:lg:w-16 pla:lg:shrink-0', drawer ? 'pla:fixed pla:inset-y-0 pla:left-0 pla:z-40 pla:flex pla:w-16 pla:overflow-y-auto' : 'pla:hidden')}>
            {brandInSide && <Brand model={model} compact />}
            {!has.top(bars) && collapseButton}
            {!has.top(bars) && (
                <nav aria-label='Main' className='pla:flex pla:flex-col pla:items-center pla:gap-1'>
                    <MainLinks model={model} variant='icons' />
                </nav>
            )}
            {(area.kind !== 'dashboard' || dashboard) && <div className='pla:h-px pla:w-8 pla:bg-border' />}
            {area.kind === 'server' && settings.server_card && <ServerBadge name={area.name} state={area.state} />}
            {dashboard && <DashboardPanel variant='icons' />}
            <AreaNav area={area} variant='icons' grouped={false} />
            <div className='pla:mt-auto pla:flex pla:flex-col pla:items-center pla:gap-1'>
                <FooterLinks links={links} variant='icons' />
                {!has.top(bars) && <User model={model} compact onPalette={openPalette} />}
            </div>
        </aside>
    );

    /*
     * The folding sidebar: its width eases between the sidebar's and the rail's (styles.css,
     * .pla-fold). Every icon keeps its place, labels fade and headings become lines, so the
     * pages line up in both widths.
     */
    const foldSidebar = (
        <aside data-folded={narrow} className={cn('pt-bar pla-fold pla:flex-col pla:gap-3 pla:overflow-x-hidden pla:overflow-y-auto pla:border-r pla:border-sidebar-border pla:bg-sidebar pla:px-2 pla:py-3 pla:lg:sticky pla:lg:top-0 pla:lg:flex pla:lg:h-dvh pla:lg:shrink-0', drawer ? 'pla:fixed pla:inset-y-0 pla:left-0 pla:z-40 pla:flex pla:w-72' : 'pla:hidden')}>
            {(brandInSide || !has.top(bars)) && (
                <>
                    <div className={cn('pla:flex pla:h-10 pla:shrink-0 pla:items-center pla:gap-1', narrow && !(brandInSide && foldLogo) && 'pla:justify-center')}>
                        {brandInSide &&
                            (narrow && !foldLogo ? (
                                <Brand model={model} compact />
                            ) : (
                                <div className='pla:min-w-0 pla:flex-1'>
                                    <Brand model={model} fold />
                                </div>
                            ))}
                        {!has.top(bars) && (!narrow || !brandInSide) && collapseButton}
                    </div>
                    {/* Folded with no top bar, the button has its own row under the logo. */}
                    {!has.top(bars) && narrow && brandInSide && <div className='pla:flex pla:h-10 pla:shrink-0 pla:justify-center'>{collapseButton}</div>}
                    <div className='pla:mx-2 pla:h-px pla:shrink-0 pla:bg-border' />
                </>
            )}
            {!has.top(bars) && (
                <nav aria-label='Main' className='pla:flex pla:flex-col pla:gap-0.5'>
                    <MainLinks model={model} variant='fold' />
                </nav>
            )}
            {settings.server_card && area.kind === 'server' && <ServerCard area={area} folded={narrow} />}
            {dashboard && <DashboardPanel variant={narrow ? 'icons' : 'list'} />}
            <AreaNav area={area} variant='fold' grouped={settings.group_nav} />
            <div className='pla:mt-auto pla:flex pla:flex-col pla:gap-2'>
                <FooterLinks links={links} variant='fold' />
                {!has.top(bars) && <User model={model} compact={narrow} onPalette={openPalette} />}
            </div>
        </aside>
    );

    const top = (
        <header className='pt-bar pla:sticky pla:top-0 pla:z-30 pla:border-b pla:border-border pla:bg-sidebar'>
            <div className='pla:relative pla:flex pla:h-14 pla:items-center'>
                {/*
                 * At the bar's own left edge, beside the sidebar. It lies over the bar rather than
                 * taking room in it, so the row below centres exactly like the page under it; until
                 * the page is wide enough for the margins to hold it, the row makes room. The menu
                 * button takes its place on narrow screens.
                 */}
                {collapseButton && <div className='pla:absolute pla:inset-y-0 pla:left-3 pla:z-10 pla:hidden pla:items-center pla:lg:flex'>{collapseButton}</div>}
                <div className={cn('pla:mx-auto pla:flex pla:h-14 pla:w-full pla:min-w-0 pla:max-w-panel pla:items-center pla:gap-3 pla:px-3', collapseButton && 'pla:lg:pl-16 pla:2xl:pl-3')}>
                    {(has.sidebar(bars) || has.rail(bars)) && (
                        <button type='button' onClick={() => setDrawer(!drawer)} className={cn(itemClass('icons'), 'pla:lg:hidden')} aria-label='Menu' aria-expanded={drawer}>
                            <NamedIcon name='menu' size={18} />
                        </button>
                    )}
                    <div className={cn('pla:min-w-0', brandSide && 'pla:lg:hidden')}>
                        <Brand model={model} />
                    </div>
                    <nav aria-label='Main' className='pla:flex pla:min-w-0 pla:flex-1 pla:items-center pla:gap-1 pla:overflow-x-auto'>
                        <MainLinks model={model} variant={bars === 'top' || bars === 'top_dock' ? 'list' : 'icons'} />
                    </nav>
                    {bars !== 'top' && <FooterLinks links={has.sidebar(bars) ? [] : links} variant='icons' />}
                    <User model={model} onPalette={openPalette} />
                </div>
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
            <div className='pt-bar pla-dock pla:pointer-events-auto pla:flex pla:max-w-full pla:items-end pla:gap-1 pla:overflow-x-auto pla:lg:overflow-visible pla:rounded-2xl pla:border pla:border-border pla:bg-sidebar/90 pla:px-2 pla:py-1.5 pla:shadow-xl pla:backdrop-blur'>
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
            {has.sidebar(bars) && (collapsible ? foldSidebar : sidebar)}
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

const COLLAPSED = 'prism-layout:collapsed';

function readCollapsed(): boolean {
    try {
        return window.localStorage.getItem(COLLAPSED) === '1';
    } catch {
        return false;
    }
}

function writeCollapsed(value: boolean): void {
    try {
        window.localStorage.setItem(COLLAPSED, value ? '1' : '0');
    } catch {
        // Remembered for this visit only.
    }
}

const BADGE_DOT: Record<string, string> = { running: 'pla:bg-success', starting: 'pla:bg-warning', stopping: 'pla:bg-warning', offline: 'pla:bg-destructive' };

/** On the rail, the open server's initials with its power state as a dot. */
function ServerBadge({ name, state }: { name: string; state: string | null | undefined }) {
    const initials = name
        .split(/[\s_-]+/)
        .filter(Boolean)
        .slice(-2)
        .map((word) => word.charAt(0).toUpperCase())
        .join('');

    return (
        <span title={`${name}${state ? `: ${state}` : ''}`} className='pla:relative pla:flex pla:size-10 pla:shrink-0 pla:items-center pla:justify-center pla:rounded-lg pla:border pla:border-border pla:bg-card pla:text-xs pla:font-semibold'>
            {initials || '?'}
            <span className={cn('pla:absolute pla:-top-0.5 pla:-right-0.5 pla:size-2.5 pla:rounded-full pla:ring-2 pla:ring-sidebar', BADGE_DOT[state ?? ''] ?? 'pla:bg-muted-foreground')} />
        </span>
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
