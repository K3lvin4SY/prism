import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ServerContentBlock, Spinner, cn, useCurrentServerRequired } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { Slot, type ViewProps } from '@pterodactyl/sdk/theme';
import { fileKeys, getState, savePreferences, type Preferences } from '../api';
import FileBrowser from '../components/FileBrowser';
import TrashView from '../components/TrashView';
import UploadPanel from '../components/UploadPanel';
import { applyConfig, getConfig, type EditorSettings, type Keybinds } from '../config';
import { normalize } from '../lib/paths';
import { UploadQueue } from '../lib/uploads';
import { useWorkbench, workbenchFor } from '../workbench/store';

const Workbench = lazy(() => import('../workbench/Workbench'));

type Tab = 'files' | 'editor' | 'trash';

const queues = new Map<string, UploadQueue>();

/** The folder shown, kept in the address bar's hash as the panel's own file manager does. */
function readHash(): string {
    try {
        return normalize(decodeURIComponent(window.location.hash.replace(/^#/, '')) || '/');
    } catch {
        return '/';
    }
}

export function usePrismFiles() {
    const server = useCurrentServerRequired();
    const identifier = server.attributes.identifier;
    const queryClient = useQueryClient();
    // Fetched again each time the page opens, for the trash and the admin's current settings.
    const state = useQuery({ queryKey: fileKeys.state(identifier), queryFn: () => getState(identifier), staleTime: 30_000, refetchOnMount: 'always' });
    applyConfig(state.data?.config);
    const [local, setLocal] = useState<Preferences>({});
    const preferences: Preferences = { ...(Array.isArray(state.data?.preferences) ? {} : state.data?.preferences), ...local };
    const timer = useRef<number>(undefined);
    const config = getConfig();

    const update = (patch: Preferences) => {
        const next = { ...preferences, ...patch };
        setLocal(next);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void savePreferences(identifier, next).catch(() => undefined), 600);
    };

    let queue = queues.get(identifier);
    if (!queue) {
        queue = new UploadQueue(identifier, () => getConfig().parallelUploads, (directory) => void queryClient.invalidateQueries({ queryKey: fileKeys.list(identifier, directory) }));
        queues.set(identifier, queue);
    }

    const editor: EditorSettings = { ...config.editor, ...(config.allowEditorSettings ? preferences.editor : {}) };
    const keybinds: Keybinds = { ...config.keybinds, ...(config.allowEditorSettings ? preferences.keybinds : {}) } as Keybinds;

    return { identifier, state, preferences, update, queue, editor, keybinds };
}

/** Prism File Browser: Files, Editor and Trash in one page. */
export default function FilesPage({ Default }: ViewProps<'page.server.files'>) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const state = useQuery({ queryKey: fileKeys.state(identifier), queryFn: () => getState(identifier), staleTime: 30_000 });
    applyConfig(state.data?.config);
    const config = getConfig();
    if (!config.enabled) return <Default />;

    return <PrismFilesPage />;
}

function PrismFiles({ initialPath = null }: { initialPath?: string | null }) {
    const config = getConfig();
    const { identifier, state, preferences, update, queue, editor, keybinds } = usePrismFiles();
    const workbench = useWorkbench(workbenchFor(identifier));
    const [tab, setTab] = useState<Tab>(initialPath || (config.workbench && config.openOn === 'editor') ? 'editor' : 'files');
    const [directory, setDirectory] = useState(readHash);
    // Monaco loads the first time the editor is shown, not with the file list.
    const [editorUsed, setEditorUsed] = useState(tab === 'editor');
    useEffect(() => {
        if (tab === 'editor') setEditorUsed(true);
    }, [tab]);
    const trashItems = state.data?.trash.items ?? [];

    useEffect(() => {
        const follow = () => setDirectory(readHash());
        window.addEventListener('hashchange', follow);

        return () => window.removeEventListener('hashchange', follow);
    }, []);

    const navigate = (next: string) => {
        const clean = normalize(next);
        setDirectory(clean);
        setTab('files');
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${clean === '/' ? '' : `#${encodeURI(clean)}`}`);
    };

    const edit = (path: string) => {
        if (!config.workbench) {
            window.location.href = `${window.location.pathname.replace(/\/files.*$/, '')}/files/edit#${encodeURI(path)}`;

            return;
        }
        workbench.open(path);
        setTab('editor');
    };

    const tabs = useMemo(
        () =>
            [
                { id: 'files' as const, label: 'Files', icon: 'folder', count: null },
                config.workbench && { id: 'editor' as const, label: 'Editor', icon: 'code-xml', count: workbench.tabs.length || null },
                config.trash && { id: 'trash' as const, label: 'Trash', icon: 'trash-2', count: trashItems.length || null },
            ].filter(Boolean) as { id: Tab; label: string; icon: string; count: number | null }[],
        [config.workbench, config.trash, workbench.tabs.length, trashItems.length]
    );

    return (
        <div className={'pfl:flex pfl:flex-col pfl:gap-3'}>
            <div className={'prism-switch pfl:flex pfl:flex-wrap pfl:gap-1 pfl:self-start pfl:rounded-full pfl:border pfl:border-border pfl:bg-card pfl:p-1'}>
                {tabs.map((item) => (
                    <button
                        key={item.id}
                        type={'button'}
                        onClick={() => setTab(item.id)}
                        className={cn(
                            'prism-switch-item pfl:inline-flex pfl:items-center pfl:gap-1.5 pfl:rounded-full pfl:px-3 pfl:py-1 pfl:text-sm pfl:cursor-pointer',
                            tab === item.id ? 'pfl:bg-primary pfl:text-primary-foreground' : 'pfl:text-muted-foreground pfl:hover:text-foreground'
                        )}
                    >
                        <NamedIcon name={item.icon} size={14} /> {item.label}
                        {item.count !== null && <span className={cn('pfl:rounded-full pfl:px-1.5 pfl:text-xs', tab === item.id ? 'pfl:bg-white/20' : 'pfl:bg-muted')}>{item.count}</span>}
                    </button>
                ))}
            </div>

            {tab === 'files' && (
                <FileBrowser
                    server={identifier}
                    directory={directory}
                    onNavigate={navigate}
                    onEdit={edit}
                    queue={queue}
                    view={preferences.view ?? config.defaultView}
                    onView={(view) => update({ view })}
                    showHidden={preferences.showHidden ?? false}
                    onShowHidden={(showHidden) => update({ showHidden })}
                />
            )}
            {config.workbench && editorUsed && (
                <div className={tab === 'editor' ? '' : 'pfl:hidden'}>
                    {/* The editor stays mounted while hidden, so its tabs and cursor survive switching views. */}
                    <Suspense fallback={<Spinner centered />}>
                        <Workbench
                            server={identifier}
                            editor={editor}
                            keybinds={keybinds}
                            showHidden={preferences.showHidden ?? false}
                            onRevealInFiles={navigate}
                            initialPath={initialPath}
                            personal={config.allowEditorSettings ? { defaults: { editor: config.editor, keybinds: config.keybinds }, onChange: update } : null}
                        />
                    </Suspense>
                </div>
            )}
            {tab === 'trash' && <TrashView server={identifier} items={trashItems} ignored={state.data?.trash.ignored ?? false} />}

            <UploadPanel queue={queue} />
        </div>
    );
}

/** The page frame: the panel's slots stay around Prism's browser. */
export function PrismFilesPage({ initialPath }: { initialPath?: string | null }) {
    const server = useCurrentServerRequired();

    return (
        <ServerContentBlock title={'Files'} className={'pfl:[--layout-content-width:100%]'}>
            <Slot name={'server.files.before'} />
            <PrismFiles initialPath={initialPath} />
            <Slot name={'server.files.after'} />
        </ServerContentBlock>
    );
}
