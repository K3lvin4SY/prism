import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { cn, http, usePanelNavigate, useShortcut } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import type { AppLayoutModel } from '@pterodactyl/sdk/theme';
import { GameLogo, useGames } from '../logos';
import { useEggColor, useSettings } from '../settings';
import { shortcutKeys } from '../shortcut';

interface Command {
    id: string;
    label: string;
    group: string;
    icon: string;
    to: string;
    hint?: string;
    /** A server row: drawn with its game's logo and its status. */
    server?: PaletteServer;
    /** A server page row: the server's name before the page's. */
    page?: { server: string; label: string };
}

interface PaletteServer {
    identifier: string;
    uuid: string;
    name: string;
    description: string | null;
    egg_tags?: string[];
}

/** How many listed servers get their status looked up, one request each. */
const STATUS_LIMIT = 20;

const STATES: Record<string, { label: string; text: string; dot: string }> = {
    running: { label: 'Online', text: 'pla:text-success', dot: 'pla:bg-success' },
    starting: { label: 'Starting', text: 'pla:text-warning', dot: 'pla:bg-warning' },
    stopping: { label: 'Stopping', text: 'pla:text-warning', dot: 'pla:bg-warning' },
    offline: { label: 'Offline', text: 'pla:text-muted-foreground', dot: 'pla:bg-muted-foreground' },
};


const ADMIN: [string, string, string][] = [
    ['Overview', '/panel', 'layout-dashboard'],
    ['Servers', '/panel/servers', 'server'],
    ['Users', '/panel/users', 'users'],
    ['Nodes', '/panel/nodes', 'network'],
    ['Locations', '/panel/locations', 'map-pin'],
    ['Eggs', '/panel/eggs', 'egg'],
    ['Extensions', '/panel/extensions', 'puzzle'],
    ['Themes', '/panel/themes', 'palette'],
    ['Prism Properties', '/panel/prism', 'sparkles'],
];

const SERVER_PAGES: [string, string, string][] = [
    ['Console', '', 'terminal'],
    ['Files', '/files', 'folder'],
    ['Databases', '/databases', 'database'],
    ['Schedules', '/schedules', 'calendar-clock'],
    ['Backups', '/backups', 'archive'],
    ['Settings', '/settings', 'settings'],
];

/** Ctrl+K, or the shortcut set: jump to any server, a server's page, an admin page or the account by typing. */
export default function CommandPalette({ model, open, onOpen, onClose }: { model: AppLayoutModel; open: boolean; onOpen: () => void; onClose: () => void }) {
    const navigate = usePanelNavigate();
    const [query, setQuery] = useState('');
    const [index, setIndex] = useState(0);
    const input = useRef<HTMLInputElement>(null);
    const settings = useSettings();
    const eggColor = useEggColor();
    useShortcut(settings.palette_shortcut, (event) => {
        event.preventDefault();
        onOpen();
    });

    const servers = useQuery({
        queryKey: ['prism-layout', 'palette-servers'],
        queryFn: async () =>
            (await http.get<{ data: { attributes: PaletteServer }[] }>('/api/client', { params: { per_page: 100 } })).data.data.map(({ attributes: { identifier, uuid, name, description, egg_tags } }) => ({ identifier, uuid, name, description, egg_tags })),
        enabled: open,
        staleTime: 60_000,
    });

    // The game's name, and its logo when cards show the game by logo.
    const games = useGames(
        (servers.data ?? []).map((server) => server.uuid),
        open
    );

    const commands = useMemo<Command[]>(() => {
        const list: Command[] = model.links.map((link) => ({ id: `link-${link.id}`, label: link.label, group: 'Go to', icon: link.icon, to: link.id === 'dashboard' ? '/' : link.id === 'admin' ? '/panel' : '/account' }));
        const pages: Command[] = [];
        const admin: Command[] = [];
        for (const server of servers.data ?? []) {
            const game = games.data?.[server.uuid]?.game;
            list.push({ id: `server-${server.identifier}`, label: server.name, group: 'Servers', icon: 'server', to: `/server/${server.identifier}`, hint: [game, server.description].filter(Boolean).join(' '), server });
            for (const [label, path, icon] of SERVER_PAGES)
                pages.push({ id: `server-${server.identifier}-${label}`, label: `${server.name}: ${label}`, group: 'Pages', icon, to: `/server/${server.identifier}${path}`, page: { server: server.name, label } });
        }
        if (model.user.rootAdmin) for (const [label, to, icon] of ADMIN) admin.push({ id: `admin-${to}`, label, group: 'Administration', icon, to });

        // Each group once: the servers, then their pages.
        return [...list, ...pages, ...admin];
    }, [model.links, model.user.rootAdmin, servers.data, games.data]);

    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = commands.filter((command) => words.every((word) => `${command.label} ${command.hint ?? ''} ${command.group}`.toLowerCase().includes(word))).filter((command) => words.length > 0 || command.group !== 'Pages').slice(0, 60);

    // The status of the servers listed now, while the palette is open.
    const listed = shown.flatMap((command) => (command.server ? [command.server.identifier] : [])).slice(0, STATUS_LIMIT);
    const states = useQueries({
        queries: listed.map((identifier) => ({
            queryKey: ['prism-layout', 'palette-state', identifier],
            queryFn: async () => (await http.get<{ attributes: { current_state: string } }>(`/api/client/servers/${identifier}/resources`)).data.attributes.current_state,
            enabled: open,
            staleTime: 15_000,
            retry: false,
        })),
    });
    const stateOf = (identifier: string) => {
        const at = listed.indexOf(identifier);

        return at === -1 ? undefined : states[at]?.data;
    };

    useEffect(() => {
        if (open) {
            setQuery('');
            setIndex(0);
            window.setTimeout(() => input.current?.focus(), 0);
        }
    }, [open]);

    useEffect(() => setIndex(0), [query]);

    if (!open) return null;

    const go = (command: Command | undefined) => {
        if (!command) return;
        onClose();
        void navigate({ to: command.to as never });
    };

    let group = '';

    return (
        <div className='pla:fixed pla:inset-0 pla:z-50 pla:flex pla:items-start pla:justify-center pla:bg-black/50 pla:px-4 pla:pt-[12vh]' onMouseDown={onClose}>
            <div role='dialog' aria-label='Search and jump' className='pt-surface pt-overlay pla:w-full pla:max-w-2xl pla:overflow-hidden pla:rounded-2xl pla:border pla:border-border pla:bg-card pla:text-card-foreground pla:shadow-2xl' onMouseDown={(event) => event.stopPropagation()}>
                <div className='pla:flex pla:items-center pla:gap-3 pla:border-b pla:border-border pla:px-5'>
                    <NamedIcon name='search' size={18} className='pla:text-muted-foreground' />
                    <input
                        ref={input}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') onClose();
                            else if (event.key === 'ArrowDown') {
                                event.preventDefault();
                                setIndex((current) => Math.min(shown.length - 1, current + 1));
                            } else if (event.key === 'ArrowUp') {
                                event.preventDefault();
                                setIndex((current) => Math.max(0, current - 1));
                            } else if (event.key === 'Enter') go(shown[index]);
                        }}
                        placeholder='Search servers, pages and settings…'
                        className='pla:h-14 pla:flex-1 pla:bg-transparent pla:text-base pla:outline-none'
                        aria-label='Search'
                    />
                    <span className='pla:flex pla:gap-1' aria-hidden>
                        {shortcutKeys(settings.palette_shortcut).map((key) => (
                            <kbd key={key} className='pla:rounded-md pla:border pla:border-input-border pla:bg-muted/60 pla:px-1.5 pla:py-0.5 pla:font-mono pla:text-[11px] pla:text-muted-foreground'>
                                {key}
                            </kbd>
                        ))}
                    </span>
                </div>
                <div className='pla:max-h-[60vh] pla:overflow-y-auto pla:px-2 pla:pb-2'>
                    {servers.isLoading && <p className='pla:px-3 pla:py-3 pla:text-xs pla:text-muted-foreground'>Loading servers…</p>}
                    {shown.length === 0 && !servers.isLoading && <p className='pla:px-3 pla:py-8 pla:text-center pla:text-sm pla:text-muted-foreground'>Nothing matches.</p>}
                    {shown.map((command, at) => {
                        const heading = command.group !== group ? (group = command.group) : null;
                        const active = at === index;
                        const state = command.server ? STATES[stateOf(command.server.identifier) ?? ''] : undefined;
                        const game = command.server ? games.data?.[command.server.uuid] : undefined;

                        return (
                            <div key={command.id}>
                                {heading && <p className='pla-label pla:px-3 pla:pt-4 pla:pb-2 pla:text-[11px] pla:font-medium pla:tracking-[0.14em] pla:text-muted-foreground pla:uppercase'>{heading}</p>}
                                <button
                                    type='button'
                                    onMouseEnter={() => setIndex(at)}
                                    onClick={() => go(command)}
                                    className={cn('pla:flex pla:w-full pla:items-center pla:gap-3 pla:rounded-xl pla:px-3 pla:py-2 pla:text-left pla:text-sm', active ? 'pla:bg-muted pla:text-foreground' : 'pla:text-foreground/90')}
                                >
                                    {command.server && settings.egg_colors === 'logo' ? (
                                        <GameLogo logo={game?.logo ?? null} tags={command.server.egg_tags} size={28} className='pla:rounded-lg' />
                                    ) : command.server && settings.egg_colors === 'color' && eggColor(command.server.egg_tags) ? (
                                        <span
                                            className='pla:flex pla:size-7 pla:shrink-0 pla:items-center pla:justify-center pla:rounded-lg pla:bg-[color-mix(in_oklab,var(--pla-egg)_22%,transparent)] pla:text-(--pla-egg)'
                                            style={{ '--pla-egg': eggColor(command.server.egg_tags) } as React.CSSProperties}
                                        >
                                            <NamedIcon name='gamepad-2' size={15} />
                                        </span>
                                    ) : (
                                        <span className='pla:flex pla:size-7 pla:shrink-0 pla:items-center pla:justify-center pla:rounded-lg pla:border pla:border-border pla:text-muted-foreground'>
                                            <NamedIcon name={command.icon} size={15} />
                                        </span>
                                    )}
                                    {command.page ? (
                                        <span className='pla:flex pla:min-w-0 pla:flex-1 pla:items-baseline pla:gap-1.5'>
                                            <span className='pla:truncate pla:font-semibold'>{command.page.server}</span>
                                            <span className='pla:shrink-0 pla:text-muted-foreground'>› {command.page.label}</span>
                                        </span>
                                    ) : (
                                        <span className='pla:flex pla:min-w-0 pla:flex-1 pla:items-baseline pla:gap-2'>
                                            <span className={cn('pla:truncate', command.server && 'pla:font-semibold')}>{command.label}</span>
                                            {game?.game && <span className='pla:truncate pla:text-muted-foreground'>{game.game}</span>}
                                        </span>
                                    )}
                                    {state && (
                                        <span className={cn('pla:flex pla:shrink-0 pla:items-center pla:gap-1.5 pla:text-xs', state.text)}>
                                            <span className={cn('pla:size-1.5 pla:rounded-full', state.dot)} />
                                            {state.label}
                                        </span>
                                    )}
                                    {!command.server && !command.page && command.hint && <span className='pla:max-w-48 pla:truncate pla:text-xs pla:text-muted-foreground'>{command.hint}</span>}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
