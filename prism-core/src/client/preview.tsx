import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
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
/** Each extension's page in the preview window; `tag` or `startup` picks a server it applies to. */
const HOMES: Record<string, { label: string; path: string; tag?: string; startup?: string }> = {
    'prism-console': { label: 'Console', path: '' },
    'prism-files': { label: 'Files', path: '/files' },
    'prism-database': { label: 'Databases', path: '/databases' },
    'prism-backups': { label: 'Backups', path: '/backups' },
    'prism-schedules': { label: 'Schedules', path: '/schedules' },
    'prism-mc': { label: 'Minecraft', path: '/properties', tag: 'minecraft' },
    'prism-terraria': { label: 'Terraria', path: '/terraria-properties', tag: 'terraria' },
    // The Core Keeper egg has no tag of its own; its startup names the server binary.
    'prism-corekeeper': { label: 'Core Keeper', path: '/corekeeper-mods', tag: 'core-keeper', startup: 'CoreKeeperServer' },
    'prism-factorio': { label: 'Factorio', path: '/factorio-mods', tag: 'factorio', startup: 'bin/x64/factorio' },
    'prism-satisfactory': { label: 'Satisfactory', path: '/satisfactory-mods', tag: 'satisfactory', startup: 'FactoryGame' },
};

type ServerItem = { attributes: { identifier: string; egg_tags?: string[]; invocation?: string } };

/*
 * The window and the controls' choices live here, outside React, so the controls can be drawn in
 * more than one place (beside the settings on wide screens, under the navigation otherwise) and
 * always agree.
 */
let target: Window | null = null;
let timer: number | undefined;
let version = 0;
const ui: { page: Page | null; device: Device; turned: boolean; location: string | null; notes: Record<string, ReactNode> } = { page: null, device: 'desktop', turned: false, location: null, notes: {} };
const listeners = new Set<() => void>();
const notify = () => {
    version++;
    listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => listeners.delete(listener);
};
const isOpen = () => !!target && !target.closed;
const useUi = () => {
    useSyncExternalStore(subscribe, () => version, () => 0);

    return ui;
};

/** Where the window is now: it is the real panel, so people move around in it. */
function readLocation(): string | null {
    try {
        return isOpen() && target ? target.location.pathname : null;
    } catch {
        return null;
    }
}

/** Notices the window being closed by hand, and where it has been moved to. */
function watch() {
    if (timer !== undefined) return;
    timer = window.setInterval(() => {
        if (!isOpen()) {
            window.clearInterval(timer);
            timer = undefined;
            target = null;
            ui.location = null;
            notify();

            return;
        }
        const location = readLocation();
        if (location !== ui.location) {
            ui.location = location;
            notify();
        }
    }, 1000);
}

export function closePreview(): void {
    target?.close();
    target = null;
    ui.location = null;
    notify();
}

export function reloadPreview(): void {
    if (isOpen()) target?.location.reload();
}

export function usePreviewOpen(): boolean {
    return useSyncExternalStore(subscribe, isOpen, () => false);
}

/** A note an editor shows in the preview controls while it is open, such as how its preview works. */
export function usePreviewNote(extension: string, note: ReactNode): void {
    useEffect(() => {
        ui.notes = { ...ui.notes, [extension]: note };
        notify();
    }, [extension, note]);

    useEffect(
        () => () => {
            const { [extension]: _gone, ...rest } = ui.notes;
            ui.notes = rest;
            notify();
        },
        [extension]
    );
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
 * opens on its own page; the others on the dashboard. The page buttons follow the window: when
 * someone has moved elsewhere in it, none is lit and the card says where it is.
 */
export function PreviewControls({ extension }: { extension?: string }) {
    const servers = useQuery({ queryKey: ['prism-core', 'preview-servers'], queryFn: async () => (await http.get<{ data: ServerItem[] }>('/api/client', { params: { per_page: 50 } })).data.data });
    const state = useUi();
    const open = usePreviewOpen();
    const home = extension ? HOMES[extension] : undefined;
    const pages: Page[] = home ? ['home', 'dashboard', 'server', 'admin', 'account'] : ['dashboard', 'server', 'admin', 'account'];
    const chosen: Page = state.page && pages.includes(state.page) ? state.page : home ? 'home' : 'dashboard';
    const firstServer = servers.data?.[0]?.attributes.identifier ?? null;
    const homeServer =
        (home?.tag || home?.startup
            ? servers.data?.find((server) => (home.tag && server.attributes.egg_tags?.includes(home.tag)) || (home.startup && server.attributes.invocation?.includes(home.startup)))
            : undefined
        )?.attributes.identifier ?? firstServer;

    const urlOf = (where: Page) =>
        where === 'home' && home && homeServer
            ? `/server/${homeServer}${home.path}`
            : where === 'admin'
              ? '/panel'
              : where === 'account'
                ? '/account'
                : where === 'server' && firstServer
                  ? `/server/${firstServer}`
                  : '/';

    // Open, the lit page is the one the window is really on; the chosen one first when two share an address.
    const location = open ? state.location : null;
    const lit: Page | null = location === null ? chosen : urlOf(chosen) === location ? chosen : (pages.find((name) => urlOf(name) === location) ?? null);

    const show = (next: { page?: Page; device?: Device; turned?: boolean } = {}) => {
        const where = next.page ?? chosen;
        const size = SIZES[next.device ?? state.device];
        const [w, h] = (next.turned ?? state.turned) ? [size[1], size[0]] : size;
        const url = urlOf(where);
        if (isOpen() && target && !next.device && next.turned === undefined) {
            target.location.href = url;
            target.focus();
        } else {
            target?.close();
            target = window.open(url, WINDOW, `popup=yes,width=${Math.min(w, window.screen.availWidth)},height=${Math.min(h, window.screen.availHeight)}`);
            watch();
        }
        ui.location = url;
        notify();
    };

    const choose = (patch: Partial<Pick<typeof ui, 'page' | 'device' | 'turned'>>) => {
        Object.assign(ui, patch);
        notify();
    };

    const note = extension ? state.notes[extension] : null;

    return (
        <div className={'pt-surface ppx:flex ppx:flex-col ppx:gap-3 ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card ppx:p-4'}>
            <div className={'ppx:flex ppx:items-center ppx:gap-2'}>
                <NamedIcon name={'app-window'} size={15} className={'ppx:text-muted-foreground'} />
                <p className={'ppx:flex-1 ppx:text-sm ppx:font-semibold'}>Live preview</p>
                {open && (
                    <span className={'ppx:inline-flex ppx:items-center ppx:gap-1.5 ppx:text-xs ppx:text-success'}>
                        <span className={'ppx:size-1.5 ppx:rounded-full ppx:bg-success'} /> Open
                    </span>
                )}
            </div>
            <p className={'ppx:text-xs ppx:text-muted-foreground'}>
                The real panel in its own window, sized like the device you pick. Each change shows there at once; nobody else sees anything until you save. Settings the server enforces, such as limits and permissions, keep their saved values there until then.
            </p>
            <div className={'prism-switch ppx:flex ppx:flex-wrap ppx:gap-1 ppx:rounded-2xl ppx:border ppx:border-border ppx:p-1'}>
                {pages.map((name) => (
                    <button
                        key={name}
                        type={'button'}
                        className={pill(lit === name)}
                        onClick={() => {
                            choose({ page: name });
                            if (open) show({ page: name });
                        }}
                    >
                        {name === 'home' ? home?.label : name.charAt(0).toUpperCase() + name.slice(1)}
                    </button>
                ))}
            </div>
            {open && location !== null && lit === null && (
                <p className={'ppx:flex ppx:items-center ppx:gap-1.5 ppx:truncate ppx:text-xs ppx:text-muted-foreground'} title={location}>
                    <NamedIcon name={'map-pin'} size={12} className={'ppx:shrink-0'} /> Showing <span className={'ppx:truncate ppx:font-mono'}>{location}</span>
                </p>
            )}
            <div className={'prism-switch ppx:flex ppx:w-fit ppx:gap-1 ppx:rounded-full ppx:border ppx:border-border ppx:p-1'}>
                {(['desktop', 'tablet', 'phone'] as Device[]).map((name) => (
                    <button
                        key={name}
                        type={'button'}
                        className={pill(state.device === name)}
                        title={name}
                        aria-label={name}
                        onClick={() => {
                            choose({ device: name });
                            if (open) show({ device: name });
                        }}
                    >
                        <NamedIcon name={name === 'desktop' ? 'monitor' : name === 'tablet' ? 'tablet' : 'smartphone'} size={13} />
                    </button>
                ))}
                <button
                    type={'button'}
                    className={pill(state.turned)}
                    title={'Turn sideways'}
                    aria-label={'Turn sideways'}
                    onClick={() => {
                        choose({ turned: !state.turned });
                        if (open) show({ turned: !state.turned });
                    }}
                >
                    <NamedIcon name={'rotate-cw-square'} size={13} />
                </button>
            </div>
            <div className={'ppx:flex ppx:flex-wrap ppx:gap-2'}>
                <Button size={'small'} onClick={() => show()}>
                    <NamedIcon name={'app-window'} size={14} /> {open ? 'Show the window' : 'Open preview window'}
                </Button>
                {open && (
                    <Button.Text size={'small'} onClick={() => target?.location.reload()}>
                        <NamedIcon name={'refresh-cw'} size={14} /> Reload
                    </Button.Text>
                )}
            </div>
            {note}
        </div>
    );
}
