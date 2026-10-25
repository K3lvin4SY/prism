import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, cn, http } from '@pterodactyl/sdk';
import { PREVIEW_WINDOW } from './configStore';
import { PREVIEW_MESSAGE, READY_MESSAGE } from './hub';
import { NamedIcon } from './icons';

/*
 * One preview window of the real panel for every Prism editor (the panel refuses to be framed).
 * Each editor sends its own extension's unsaved settings there, so drafts of several extensions
 * show together. In the window, Prism Core's hub (hub.ts) passes them on to the extensions.
 */
const WINDOW = PREVIEW_WINDOW;
const PREVIEW = PREVIEW_MESSAGE;
const READY = READY_MESSAGE;

export type Device = 'desktop' | 'tablet' | 'phone';
const SIZES: Record<Device, [number, number]> = { desktop: [1366, 860], tablet: [820, 1180], phone: [390, 844] };
export type Page = 'home' | 'dashboard' | 'server' | 'admin' | 'account';

/** Where each server extension shows itself: a server page, on a server of its game if it has one. */
const HOMES: Record<string, { label: string; path: string; tag?: string }> = {
    'prism-console': { label: 'Console', path: '' },
    'prism-files': { label: 'Files', path: '/files' },
    'prism-database': { label: 'Databases', path: '/databases' },
    'prism-backups': { label: 'Backups', path: '/backups' },
    'prism-schedules': { label: 'Schedules', path: '/schedules' },
    'prism-mc': { label: 'Minecraft', path: '/properties', tag: 'minecraft' },
    'prism-terraria': { label: 'Terraria', path: '/terraria-properties', tag: 'terraria' },
};

type ServerItem = { attributes: { identifier: string; egg_tags?: string[] } };

let target: Window | null = null;
let timer: number | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => listeners.delete(listener);
};
const isOpen = () => !!target && !target.closed;

/** Notices the window being closed by hand. */
function watch() {
    if (timer !== undefined) return;
    timer = window.setInterval(() => {
        if (isOpen()) return;
        window.clearInterval(timer);
        timer = undefined;
        target = null;
        notify();
    }, 1000);
}

export function closePreview(): void {
    target?.close();
    target = null;
    notify();
}

export function reloadPreview(): void {
    if (isOpen()) target?.location.reload();
}

export function usePreviewOpen(): boolean {
    return useSyncExternalStore(subscribe, isOpen, () => false);
}

/** Sends an extension's settings to the preview window, now, on each change and when a page loads there. An empty id sends nothing. */
export function usePreviewDraft(extension: string, settings: Record<string, unknown>): void {
    const open = usePreviewOpen();

    useEffect(() => {
        if (extension && open && target) target.postMessage({ type: PREVIEW, extension, settings }, window.location.origin);
    }, [open, extension, settings]);

    // Leaving the editor takes its draft back out of the window: the saved settings show again.
    useEffect(
        () => () => {
            if (extension && isOpen()) target?.postMessage({ type: PREVIEW, extension, settings: {} }, window.location.origin);
        },
        [extension]
    );

    useEffect(() => {
        const listener = (event: MessageEvent) => {
            if (!extension || event.origin !== window.location.origin || !target || event.source !== target) return;
            if ((event.data as { type?: string } | null)?.type === READY) target.postMessage({ type: PREVIEW, extension, settings }, window.location.origin);
        };
        window.addEventListener('message', listener);

        return () => window.removeEventListener('message', listener);
    }, [extension, settings]);
}

const pill = (active: boolean) =>
    cn('prism-switch-item ppx:inline-flex ppx:items-center ppx:gap-1.5 ppx:rounded-full ppx:px-3 ppx:py-1 ppx:text-xs ppx:font-medium ppx:cursor-pointer', active ? 'ppx:bg-primary ppx:text-primary-foreground' : 'ppx:text-muted-foreground ppx:hover:bg-muted ppx:hover:text-foreground');

/**
 * The page and device pickers and the button that opens the preview window. A server extension
 * opens on its own page; the others on the dashboard.
 */
export function PreviewControls({ extension, children }: { extension?: string; children?: ReactNode }) {
    const servers = useQuery({ queryKey: ['prism-core', 'preview-servers'], queryFn: async () => (await http.get<{ data: ServerItem[] }>('/api/client', { params: { per_page: 50 } })).data.data });
    const open = usePreviewOpen();
    const home = extension ? HOMES[extension] : undefined;
    const [page, setPage] = useState<Page>(home ? 'home' : 'dashboard');
    const firstServer = servers.data?.[0]?.attributes.identifier ?? null;
    const homeServer = (home?.tag ? servers.data?.find((server) => server.attributes.egg_tags?.includes(home.tag!)) : undefined)?.attributes.identifier ?? firstServer;
    const [device, setDevice] = useState<Device>('desktop');
    const [turned, setTurned] = useState(false);

    const show = (next: { page?: Page; device?: Device; turned?: boolean } = {}) => {
        const where = next.page ?? page;
        const size = SIZES[next.device ?? device];
        const [w, h] = (next.turned ?? turned) ? [size[1], size[0]] : size;
        const url =
            where === 'home' && home && homeServer
                ? `/server/${homeServer}${home.path}`
                : where === 'admin'
                  ? '/panel'
                  : where === 'account'
                    ? '/account'
                    : where === 'server' && firstServer
                      ? `/server/${firstServer}`
                      : '/';
        if (isOpen() && target && !next.device && next.turned === undefined) {
            target.location.href = url;
            target.focus();
        } else {
            target?.close();
            target = window.open(url, WINDOW, `popup=yes,width=${Math.min(w, window.screen.availWidth)},height=${Math.min(h, window.screen.availHeight)}`);
            watch();
        }
        notify();
    };

    return (
        <div className={'pt-surface ppx:flex ppx:flex-col ppx:gap-3 ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card ppx:p-4'}>
            <p className={'ppx:text-sm ppx:font-semibold'}>Live preview</p>
            <p className={'ppx:text-sm ppx:text-muted-foreground'}>
                The real panel in its own window, sized like the device you pick. Each change shows there at once; nobody else sees anything until you save. Settings the server enforces, such as limits and permissions, keep their saved values there until then.
            </p>
            <div className={'ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-2'}>
                <div className={'prism-switch ppx:flex ppx:gap-1 ppx:rounded-full ppx:border ppx:border-border ppx:p-1'}>
                    {((home ? ['home', 'dashboard', 'server', 'admin', 'account'] : ['dashboard', 'server', 'admin', 'account']) as Page[]).map((name) => (
                        <button
                            key={name}
                            type={'button'}
                            className={pill(page === name)}
                            onClick={() => {
                                setPage(name);
                                if (open) show({ page: name });
                            }}
                        >
                            {name === 'home' ? home?.label : name.charAt(0).toUpperCase() + name.slice(1)}
                        </button>
                    ))}
                </div>
                <div className={'prism-switch ppx:flex ppx:gap-1 ppx:rounded-full ppx:border ppx:border-border ppx:p-1'}>
                    {(['desktop', 'tablet', 'phone'] as Device[]).map((name) => (
                        <button
                            key={name}
                            type={'button'}
                            className={pill(device === name)}
                            title={name}
                            onClick={() => {
                                setDevice(name);
                                if (open) show({ device: name });
                            }}
                        >
                            <NamedIcon name={name === 'desktop' ? 'monitor' : name === 'tablet' ? 'tablet' : 'smartphone'} size={13} />
                        </button>
                    ))}
                    <button
                        type={'button'}
                        className={pill(turned)}
                        title={'Turn sideways'}
                        onClick={() => {
                            setTurned(!turned);
                            if (open) show({ turned: !turned });
                        }}
                    >
                        <NamedIcon name={'rotate-cw-square'} size={13} />
                    </button>
                </div>
            </div>
            <div className={'ppx:flex ppx:flex-wrap ppx:gap-2'}>
                <Button onClick={() => show()}>
                    <NamedIcon name={'app-window'} size={14} /> {open ? 'Show the preview window' : 'Open preview window'}
                </Button>
                {open && (
                    <Button.Text onClick={() => target?.location.reload()}>
                        <NamedIcon name={'refresh-cw'} size={14} /> Reload it
                    </Button.Text>
                )}
            </div>
            {children}
        </div>
    );
}
