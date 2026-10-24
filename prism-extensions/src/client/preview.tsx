import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, NamedIcon, cn, http } from '@pterodactyl/sdk';

/*
 * One preview window of the real panel for every Prism editor (the panel refuses to be framed).
 * Each editor sends its own extension's unsaved settings there, so a draft look and a draft layout
 * show together. Prism Themes and Prism Layout listen for these messages in that window.
 */
const WINDOW = 'prism-preview';
const PREVIEW = 'prism-preview';
const READY = 'prism-preview:ready';

export type Device = 'desktop' | 'tablet' | 'phone';
const SIZES: Record<Device, [number, number]> = { desktop: [1366, 860], tablet: [820, 1180], phone: [390, 844] };
export type Page = 'dashboard' | 'server' | 'admin' | 'account';

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

/** The page and device pickers and the button that opens the preview window. */
export function PreviewControls({ children }: { children?: ReactNode }) {
    const firstServer = useQuery({ queryKey: ['prism-extensions', 'first-server'], queryFn: async () => (await http.get<{ data: { attributes: { identifier: string } }[] }>('/api/client', { params: { per_page: 1 } })).data.data[0]?.attributes.identifier ?? null });
    const open = usePreviewOpen();
    const [page, setPage] = useState<Page>('dashboard');
    const [device, setDevice] = useState<Device>('desktop');
    const [turned, setTurned] = useState(false);

    const show = (next: { page?: Page; device?: Device; turned?: boolean } = {}) => {
        const where = next.page ?? page;
        const size = SIZES[next.device ?? device];
        const [w, h] = (next.turned ?? turned) ? [size[1], size[0]] : size;
        const url = where === 'dashboard' ? '/' : where === 'admin' ? '/panel' : where === 'account' ? '/account' : firstServer.data ? `/server/${firstServer.data}` : '/';
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
        <div className={'ppx:flex ppx:flex-col ppx:gap-3 ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card ppx:p-4'}>
            <p className={'ppx:text-sm ppx:font-semibold'}>Live preview</p>
            <p className={'ppx:text-sm ppx:text-muted-foreground'}>The real panel in its own window, sized like the device you pick. Each change shows there at once; nobody else sees anything until you save.</p>
            <div className={'ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-2'}>
                <div className={'prism-switch ppx:flex ppx:gap-1 ppx:rounded-full ppx:border ppx:border-border ppx:p-1'}>
                    {(['dashboard', 'server', 'admin', 'account'] as Page[]).map((name) => (
                        <button
                            key={name}
                            type={'button'}
                            className={pill(page === name)}
                            onClick={() => {
                                setPage(name);
                                if (open) show({ page: name });
                            }}
                        >
                            {name.charAt(0).toUpperCase() + name.slice(1)}
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
