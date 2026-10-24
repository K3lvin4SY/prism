import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NamedIcon, cn, http, usePanelNavigate, useShortcut } from '@pterodactyl/sdk';
import type { AppLayoutModel } from '@pterodactyl/sdk/theme';

interface Command {
    id: string;
    label: string;
    group: string;
    icon: string;
    to: string;
    hint?: string;
}

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

/** Ctrl+K: jump to any server, a server's page, an admin page or the account by typing. */
export default function CommandPalette({ model, open, onOpen, onClose }: { model: AppLayoutModel; open: boolean; onOpen: () => void; onClose: () => void }) {
    const navigate = usePanelNavigate();
    const [query, setQuery] = useState('');
    const [index, setIndex] = useState(0);
    const input = useRef<HTMLInputElement>(null);
    useShortcut('mod+k', (event) => {
        event.preventDefault();
        onOpen();
    });

    const servers = useQuery({
        queryKey: ['prism-layout', 'palette-servers'],
        queryFn: async () => (await http.get<{ data: { attributes: { identifier: string; name: string; description: string | null } }[] }>('/api/client', { params: { per_page: 100 } })).data.data.map((item) => item.attributes),
        enabled: open,
        staleTime: 60_000,
    });

    const commands = useMemo<Command[]>(() => {
        const list: Command[] = model.links.map((link) => ({ id: `link-${link.id}`, label: link.label, group: 'Go to', icon: link.icon, to: link.id === 'dashboard' ? '/' : link.id === 'admin' ? '/panel' : '/account' }));
        for (const server of servers.data ?? []) {
            list.push({ id: `server-${server.identifier}`, label: server.name, group: 'Servers', icon: 'server', to: `/server/${server.identifier}`, hint: server.description ?? undefined });
            for (const [label, path, icon] of SERVER_PAGES) list.push({ id: `server-${server.identifier}-${label}`, label: `${server.name}: ${label}`, group: 'Server pages', icon, to: `/server/${server.identifier}${path}` });
        }
        if (model.user.rootAdmin) for (const [label, to, icon] of ADMIN) list.push({ id: `admin-${to}`, label, group: 'Administration', icon, to });

        return list;
    }, [model.links, model.user.rootAdmin, servers.data]);

    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = commands.filter((command) => words.every((word) => `${command.label} ${command.hint ?? ''} ${command.group}`.toLowerCase().includes(word))).filter((command) => words.length > 0 || command.group !== 'Server pages').slice(0, 60);

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
            <div role='dialog' aria-label='Search and jump' className='pt-surface pla:w-full pla:max-w-xl pla:overflow-hidden pla:rounded-xl pla:border pla:border-border pla:bg-popover pla:text-popover-foreground pla:shadow-2xl' onMouseDown={(event) => event.stopPropagation()}>
                <div className='pla:flex pla:items-center pla:gap-3 pla:border-b pla:border-border pla:px-4'>
                    <NamedIcon name='search' size={16} className='pla:text-muted-foreground' />
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
                        className='pla:h-12 pla:flex-1 pla:bg-transparent pla:text-sm pla:outline-none'
                        aria-label='Search'
                    />
                    <kbd className='pla:rounded pla:border pla:border-border pla:px-1.5 pla:text-[10px] pla:text-muted-foreground'>Esc</kbd>
                </div>
                <div className='pla:max-h-[55vh] pla:overflow-y-auto pla:p-1.5'>
                    {servers.isLoading && <p className='pla:px-3 pla:py-2 pla:text-xs pla:text-muted-foreground'>Loading servers…</p>}
                    {shown.length === 0 && !servers.isLoading && <p className='pla:px-3 pla:py-6 pla:text-center pla:text-sm pla:text-muted-foreground'>Nothing matches.</p>}
                    {shown.map((command, at) => {
                        const heading = command.group !== group ? (group = command.group) : null;

                        return (
                            <div key={command.id}>
                                {heading && <p className='pla:px-3 pla:pt-2 pla:pb-1 pla:text-[11px] pla:font-semibold pla:tracking-wider pla:text-muted-foreground pla:uppercase'>{heading}</p>}
                                <button
                                    type='button'
                                    onMouseEnter={() => setIndex(at)}
                                    onClick={() => go(command)}
                                    className={cn('pla:flex pla:w-full pla:items-center pla:gap-3 pla:rounded-lg pla:px-3 pla:py-2 pla:text-left pla:text-sm', at === index ? 'pla:bg-primary/15 pla:text-foreground' : 'pla:text-muted-foreground')}
                                >
                                    <NamedIcon name={command.icon} size={15} className='pla:shrink-0' />
                                    <span className='pla:min-w-0 pla:flex-1 pla:truncate'>{command.label}</span>
                                    {command.hint && <span className='pla:max-w-48 pla:truncate pla:text-xs pla:text-muted-foreground'>{command.hint}</span>}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
