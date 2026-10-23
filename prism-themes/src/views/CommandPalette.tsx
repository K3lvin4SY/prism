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
        queryKey: ['prism-themes', 'palette-servers'],
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
        <div className='fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh]' onMouseDown={onClose}>
            <div role='dialog' aria-label='Search and jump' className='pt-surface w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl' onMouseDown={(event) => event.stopPropagation()}>
                <div className='flex items-center gap-3 border-b border-border px-4'>
                    <NamedIcon name='search' size={16} className='text-muted-foreground' />
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
                        className='h-12 flex-1 bg-transparent text-sm outline-none'
                        aria-label='Search'
                    />
                    <kbd className='rounded border border-border px-1.5 text-[10px] text-muted-foreground'>Esc</kbd>
                </div>
                <div className='max-h-[55vh] overflow-y-auto p-1.5'>
                    {servers.isLoading && <p className='px-3 py-2 text-xs text-muted-foreground'>Loading servers…</p>}
                    {shown.length === 0 && !servers.isLoading && <p className='px-3 py-6 text-center text-sm text-muted-foreground'>Nothing matches.</p>}
                    {shown.map((command, at) => {
                        const heading = command.group !== group ? (group = command.group) : null;

                        return (
                            <div key={command.id}>
                                {heading && <p className='px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase'>{heading}</p>}
                                <button
                                    type='button'
                                    onMouseEnter={() => setIndex(at)}
                                    onClick={() => go(command)}
                                    className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm', at === index ? 'bg-primary/15 text-foreground' : 'text-muted-foreground')}
                                >
                                    <NamedIcon name={command.icon} size={15} className='shrink-0' />
                                    <span className='min-w-0 flex-1 truncate'>{command.label}</span>
                                    {command.hint && <span className='max-w-48 truncate text-xs text-muted-foreground'>{command.hint}</span>}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
