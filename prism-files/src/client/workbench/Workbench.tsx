import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Alert, Button, Dialog, Spinner, cn, fromNow, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { readFile, type FileEntry } from '../api';
import { useFileActions, useFilePermissions, useIsProtected, validName } from '../actions';
import ContextMenu from '../components/ContextMenu';
import Prompt from '../components/Prompt';
import { getConfig, type EditorSettings, type Keybinds } from '../config';
import { basename, dirname, fileIcon, join } from '../lib/paths';
import { ConflictError, documentsFor, type Document } from './documents';
import Explorer from './Explorer';
import monaco, { keybinding, matchesChord, themeFor } from './monaco';
import Palette, { type Command } from './Palette';
import { useWorkbench, workbenchFor } from './store';

interface Props {
    server: string;
    editor: EditorSettings;
    keybinds: Keybinds;
    showHidden: boolean;
    onRevealInFiles: (directory: string) => void;
    /** Opened from the panel's edit page: a file to open first. */
    initialPath?: string | null;
}

type Menu = { x: number; y: number; entry: FileEntry | null; directory: string };

export default function Workbench({ server, editor: settings, keybinds, showHidden, onRevealInFiles, initialPath }: Props) {
    const state = useWorkbench(workbenchFor(server));
    const documents = documentsFor(server, state);
    const actions = useFileActions(server);
    const permissions = useFilePermissions();
    const isProtected = useIsProtected();
    const host = useRef<HTMLDivElement>(null);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const [current, setCurrent] = useState<Document | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cursor, setCursor] = useState({ line: 1, column: 1 });
    const [palette, setPalette] = useState<'files' | 'commands' | null>(null);
    const [menu, setMenu] = useState<Menu | null>(null);
    const [prompt, setPrompt] = useState<{ kind: 'file' | 'folder' | 'rename'; directory: string; entry?: FileEntry } | null>(null);
    const [conflict, setConflict] = useState<{ path: string; server: string; modified: string } | null>(null);
    const [recent, setRecent] = useState<string[]>([]);
    const [dragging, setDragging] = useState<number | null>(null);
    const readOnly = !permissions.update;

    // One editor; each open file is a model swapped in, with its scroll and selection kept.
    useEffect(() => {
        if (!host.current) return;
        const instance = monaco.editor.create(host.current, {
            automaticLayout: true,
            theme: themeFor(settings.theme),
            fontSize: settings.fontSize,
            tabSize: settings.tabSize,
            wordWrap: settings.wordWrap ? 'on' : 'off',
            minimap: { enabled: settings.minimap },
            stickyScroll: { enabled: settings.stickyScroll },
            bracketPairColorization: { enabled: settings.bracketColors },
            guides: { bracketPairs: settings.bracketColors },
            fontFamily: 'JetBrains Mono, Fira Code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontLigatures: true,
            smoothScrolling: true,
            readOnly,
            model: null,
        });
        instance.onDidChangeCursorPosition((event) => setCursor({ line: event.position.lineNumber, column: event.position.column }));
        editorRef.current = instance;

        return () => {
            instance.dispose();
            editorRef.current = null;
        };
        // The editor is created once; settings are applied below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        editorRef.current?.updateOptions({
            fontSize: settings.fontSize,
            tabSize: settings.tabSize,
            wordWrap: settings.wordWrap ? 'on' : 'off',
            minimap: { enabled: settings.minimap },
            stickyScroll: { enabled: settings.stickyScroll },
            bracketPairColorization: { enabled: settings.bracketColors },
            readOnly,
        });
        monaco.editor.setTheme(themeFor(settings.theme));
    }, [settings, readOnly]);

    const open = useCallback(
        (path: string, preview = false) => {
            state.open(path, preview);
            setRecent((list) => [path, ...list.filter((item) => item !== path)].slice(0, 15));
        },
        [state]
    );

    useEffect(() => {
        if (initialPath) open(initialPath);
    }, [initialPath, open]);

    // Shows the active tab's file.
    useEffect(() => {
        const instance = editorRef.current;
        const path = state.active;
        if (!instance) return;
        if (current) current.viewState = instance.saveViewState();
        if (!path) {
            instance.setModel(null);
            setCurrent(null);

            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);
        documents
            .open(path)
            .then((document) => {
                if (cancelled) return;
                instance.setModel(document.model);
                if (document.viewState) instance.restoreViewState(document.viewState);
                instance.focus();
                setCurrent(document);
            })
            .catch((failure) => !cancelled && setError(failure instanceof Error && !('response' in failure) ? failure.message : httpErrorToHuman(failure)))
            .finally(() => !cancelled && setLoading(false));

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.active]);

    const save = useCallback(
        async (path: string | null = state.active, force = false) => {
            if (!path || !documents.get(path)) return;
            if (isProtected(path)) {
                toast.error(`${path} is protected, so it cannot be changed here.`);

                return;
            }
            try {
                await documents.save(path, force);
                toast.success(`Saved ${basename(path)}`);
            } catch (failure) {
                if (failure instanceof ConflictError) {
                    setConflict({ path, server: await readFile(server, path).catch(() => ''), modified: failure.modified });
                } else {
                    toast.error(httpErrorToHuman(failure));
                }
            }
        },
        [documents, isProtected, server, state.active]
    );

    const saveAll = useCallback(async () => {
        for (const path of [...state.dirty]) await save(path);
    }, [save, state.dirty]);

    // Tabs waiting to close; unsaved ones ask in the panel's own dialog, one at a time.
    const [closing, setClosing] = useState<string[]>([]);
    const [closingBusy, setClosingBusy] = useState(false);
    const discard = useCallback(
        (path: string) => {
            state.close(path);
            documents.close(path);
        },
        [documents, state]
    );
    const close = useCallback(
        (...paths: string[]) => {
            const unsaved = paths.filter((path) => state.dirty.has(path));
            paths.filter((path) => !state.dirty.has(path)).forEach(discard);
            if (unsaved.length > 0) setClosing((current) => [...current, ...unsaved.filter((path) => !current.includes(path))]);
        },
        [discard, state]
    );
    const asking = closing[0] ?? null;
    const [deleting, setDeleting] = useState<FileEntry | null>(null);

    const commands: Command[] = [
        { id: 'save', label: 'File: Save', keys: keybinds.save, run: () => save() },
        { id: 'saveAll', label: 'File: Save all', keys: keybinds.saveAll, run: () => saveAll() },
        { id: 'newFile', label: 'File: New file', run: () => setPrompt({ kind: 'file', directory: state.active ? dirname(state.active) : '/' }) },
        { id: 'newFolder', label: 'File: New folder', run: () => setPrompt({ kind: 'folder', directory: state.active ? dirname(state.active) : '/' }) },
        { id: 'revert', label: 'File: Revert to the server copy', run: () => state.active && documents.revert(state.active) },
        { id: 'compare', label: 'File: Compare with the server copy', run: async () => state.active && setConflict({ path: state.active, server: await readFile(server, state.active), modified: '' }) },
        { id: 'copyPath', label: 'File: Copy path', run: () => state.active && navigator.clipboard.writeText(state.active) },
        { id: 'reveal', label: 'File: Reveal in the file list', run: () => onRevealInFiles(state.active ? dirname(state.active) : '/') },
        { id: 'closeTab', label: 'View: Close tab', keys: keybinds.closeTab, run: () => state.active && close(state.active) },
        { id: 'closeOthers', label: 'View: Close other tabs', run: () => state.active && close(...state.tabs.map((tab) => tab.path).filter((path) => path !== state.active)) },
        { id: 'closeAll', label: 'View: Close all tabs', run: () => close(...state.tabs.map((tab) => tab.path)) },
        { id: 'reopen', label: 'View: Reopen closed tab', keys: keybinds.reopenTab, run: () => state.reopen() },
        { id: 'explorer', label: 'View: Toggle explorer', keys: keybinds.toggleExplorer, run: () => ((state.explorer = !state.explorer), state.changed()) },
        { id: 'goToLine', label: 'Go to line', keys: keybinds.goToLine, run: () => editorRef.current?.getAction('editor.action.gotoLine')?.run() },
        { id: 'find', label: 'Find and replace', keys: 'Ctrl+H', run: () => editorRef.current?.getAction('editor.action.startFindReplaceAction')?.run() },
        { id: 'format', label: 'Format document', run: () => editorRef.current?.getAction('editor.action.formatDocument')?.run() },
        { id: 'quickOpen', label: 'Go to file', keys: keybinds.quickOpen, run: () => setPalette('files') },
    ];

    // Keybinds work inside the editor through Monaco, and everywhere else in the workbench.
    const latest = useRef(commands);
    latest.current = commands;
    useEffect(() => {
        const instance = editorRef.current;
        if (!instance) return;
        const disposables = (Object.entries(keybinds) as [keyof Keybinds, string][]).flatMap(([action, chord]) => {
            const binding = keybinding(chord);
            const id = action === 'quickOpen' ? 'quickOpen' : action === 'commandPalette' ? 'palette' : action;
            if (binding === null) return [];

            return [
                instance.addAction({
                    id: `prism.${id}`,
                    label: id,
                    keybindings: [binding],
                    run: () => (action === 'commandPalette' ? setPalette('commands') : latest.current.find((command) => command.id === id)?.run()),
                }),
            ];
        });

        const keys = (event: KeyboardEvent) => {
            if (!host.current?.isConnected || (event.target instanceof Node && host.current.contains(event.target))) return;
            for (const [action, chord] of Object.entries(keybinds) as [keyof Keybinds, string][]) {
                if (!matchesChord(event, chord)) continue;
                event.preventDefault();
                if (action === 'commandPalette') setPalette('commands');
                else latest.current.find((command) => command.id === action)?.run();
            }
        };
        window.addEventListener('keydown', keys);

        return () => {
            disposables.forEach((disposable) => disposable.dispose());
            window.removeEventListener('keydown', keys);
        };
    }, [keybinds]);

    // Auto save after a pause, or when the editor loses focus.
    useEffect(() => {
        const instance = editorRef.current;
        if (!instance || settings.autosave === 'off') return;
        let timer: number | undefined;
        const disposable =
            settings.autosave === 'delay'
                ? instance.onDidChangeModelContent(() => {
                      window.clearTimeout(timer);
                      timer = window.setTimeout(() => state.active && state.dirty.has(state.active) && save(), 1500);
                  })
                : instance.onDidBlurEditorText(() => state.active && state.dirty.has(state.active) && save());

        return () => {
            window.clearTimeout(timer);
            disposable.dispose();
        };
    }, [settings.autosave, save, state]);

    // Leaving the page with unsaved edits asks first; the drafts are kept either way.
    useEffect(() => {
        if (state.dirty.size === 0) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);

        return () => window.removeEventListener('beforeunload', warn);
    }, [state.dirty.size]);

    const contextMenu = (event: MouseEvent, entry: FileEntry | null, directory: string) => {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY, entry, directory });
    };

    const move = async (from: string, toDirectory: string) => {
        const to = join(toDirectory, basename(from));
        if (isProtected(from) || isProtected(to)) return toast.error(`${from} is protected, so it cannot be moved here.`);
        await actions.move([{ from, to }]);
        state.renamed(from, to);
        documents.rename(from, to);
    };

    const active = current && state.active === current.path ? current : null;

    return (
        <div className={'pfl-workbench pfl:flex pfl:h-[calc(100vh-13rem)] pfl:min-h-[30rem] pfl:overflow-hidden pfl:rounded-lg pfl:border pfl:border-border'}>
            {/* Activity bar */}
            <div className={'pfl:flex pfl:w-11 pfl:shrink-0 pfl:flex-col pfl:items-center pfl:gap-1 pfl:border-r pfl:border-border pfl:py-2'}>
                <ActivityButton icon={'files'} label={'Explorer'} active={state.explorer} onClick={() => ((state.explorer = !state.explorer), state.changed())} />
                <ActivityButton icon={'search'} label={'Go to file'} onClick={() => setPalette('files')} />
                <ActivityButton icon={'square-terminal'} label={'Command palette'} onClick={() => setPalette('commands')} />
                <div className={'pfl:flex-1'} />
                <ActivityButton icon={'folder-tree'} label={'Show in the file list'} onClick={() => onRevealInFiles(state.active ? dirname(state.active) : '/')} />
            </div>

            {/* Explorer */}
            {state.explorer && (
                <div className={'pfl:hidden pfl:w-64 pfl:shrink-0 pfl:flex-col pfl:border-r pfl:border-border pfl:md:flex'}>
                    <div className={'pfl:flex pfl:items-center pfl:gap-1 pfl:px-3 pfl:py-2 pfl:text-xs pfl:font-semibold pfl:uppercase pfl:tracking-wide pfl:text-muted-foreground'}>
                        <span className={'pfl:flex-1'}>Explorer</span>
                        {permissions.create && (
                            <>
                                <SmallButton icon={'file-plus'} label={'New file'} onClick={() => setPrompt({ kind: 'file', directory: state.active ? dirname(state.active) : '/' })} />
                                <SmallButton icon={'folder-plus'} label={'New folder'} onClick={() => setPrompt({ kind: 'folder', directory: state.active ? dirname(state.active) : '/' })} />
                            </>
                        )}
                        <SmallButton icon={'refresh-cw'} label={'Refresh'} onClick={() => actions.refresh('/')} />
                    </div>
                    <Explorer server={server} active={state.active} dirty={state.dirty} showHidden={showHidden} onOpen={open} onMove={move} onContext={contextMenu} />
                </div>
            )}

            {/* Editor */}
            <div className={'pfl:flex pfl:min-w-0 pfl:flex-1 pfl:flex-col'}>
                <div className={'pfl:flex pfl:min-h-9 pfl:overflow-x-auto pfl:border-b pfl:border-border'} role={'tablist'}>
                    {state.tabs.map((tab, index) => {
                        const icon = fileIcon(basename(tab.path), false);

                        return (
                            <div
                                key={tab.path}
                                role={'tab'}
                                aria-selected={tab.path === state.active}
                                draggable
                                onDragStart={() => setDragging(index)}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={() => {
                                    if (dragging !== null && dragging !== index) state.move(dragging, index);
                                    setDragging(null);
                                }}
                                onClick={() => state.open(tab.path)}
                                onDoubleClick={() => state.pin(tab.path)}
                                onAuxClick={(event) => event.button === 1 && close(tab.path)}
                                title={tab.path}
                                className={cn(
                                    'pfl:group pfl:flex pfl:shrink-0 pfl:cursor-pointer pfl:items-center pfl:gap-1.5 pfl:border-r pfl:border-border pfl:px-3 pfl:text-[13px]',
                                    tab.path === state.active ? 'pfl:bg-[var(--editor-background,transparent)] pfl:shadow-[inset_0_2px_0_var(--primary)]' : 'pfl:text-muted-foreground pfl:hover:bg-muted/40'
                                )}
                            >
                                <NamedIcon name={icon.icon} size={14} className={icon.color} />
                                <span className={cn(tab.preview && 'pfl:italic')}>{basename(tab.path)}</span>
                                <button
                                    type={'button'}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        close(tab.path);
                                    }}
                                    aria-label={`Close ${basename(tab.path)}`}
                                    className={'pfl:flex pfl:size-5 pfl:items-center pfl:justify-center pfl:rounded pfl:cursor-pointer pfl:hover:bg-muted'}
                                >
                                    {state.dirty.has(tab.path) ? <span className={'pfl:size-2 pfl:rounded-full pfl:bg-foreground/80 pfl:group-hover:hidden'} /> : null}
                                    <NamedIcon name={'x'} size={13} className={cn(state.dirty.has(tab.path) ? 'pfl:hidden pfl:group-hover:block' : 'pfl:opacity-0 pfl:group-hover:opacity-100', tab.path === state.active && 'pfl:opacity-100')} />
                                </button>
                            </div>
                        );
                    })}
                </div>

                {active && (
                    <div className={'pfl:flex pfl:items-center pfl:gap-1 pfl:border-b pfl:border-border pfl:px-3 pfl:py-1 pfl:text-xs pfl:text-muted-foreground'}>
                        {active.path
                            .split('/')
                            .filter(Boolean)
                            .map((part, index, parts) => (
                                <span key={index} className={'pfl:flex pfl:items-center pfl:gap-1'}>
                                    {index > 0 && <NamedIcon name={'chevron-right'} size={11} />}
                                    {index === parts.length - 1 ? <span className={'pfl:text-foreground'}>{part}</span> : part}
                                </span>
                            ))}
                    </div>
                )}

                {active?.restoredDraft && (
                    <div className={'pfl:flex pfl:flex-wrap pfl:items-center pfl:gap-2 pfl:border-b pfl:border-border pfl:bg-primary/10 pfl:px-3 pfl:py-1.5 pfl:text-xs'}>
                        <NamedIcon name={'history'} size={13} /> Unsaved changes from {fromNow(new Date(active.restoredDraft.saved).toISOString())} were restored.
                        <Button size={'xsmall'} isSecondary onClick={() => save(active.path)}>
                            Save them
                        </Button>
                        <Button.Text size={'xsmall'} onClick={() => documents.revert(active.path).then(() => setCurrent({ ...active, restoredDraft: null }))}>
                            Discard
                        </Button.Text>
                    </div>
                )}

                <div className={'pfl:relative pfl:min-h-0 pfl:flex-1'}>
                    <div ref={host} className={cn('pfl:absolute pfl:inset-0', !state.active && 'pfl:invisible')} />
                    {!state.active && (
                        <div className={'pfl:absolute pfl:inset-0 pfl:flex pfl:flex-col pfl:items-center pfl:justify-center pfl:gap-3 pfl:text-sm pfl:text-muted-foreground'}>
                            <NamedIcon name={'code-xml'} size={40} className={'pfl:opacity-40'} />
                            <p>Open a file from the explorer.</p>
                            <div className={'pfl:grid pfl:grid-cols-[auto_auto] pfl:gap-x-4 pfl:gap-y-1 pfl:text-xs'}>
                                <span>Go to file</span>
                                <kbd className={'pfl:font-mono'}>{keybinds.quickOpen}</kbd>
                                <span>Command palette</span>
                                <kbd className={'pfl:font-mono'}>{keybinds.commandPalette}</kbd>
                                <span>Save</span>
                                <kbd className={'pfl:font-mono'}>{keybinds.save}</kbd>
                            </div>
                        </div>
                    )}
                    {loading && (
                        <div className={'pfl:absolute pfl:inset-0 pfl:flex pfl:items-center pfl:justify-center pfl:bg-black/10'}>
                            <Spinner />
                        </div>
                    )}
                    {error && (
                        <div className={'pfl:absolute pfl:inset-x-4 pfl:top-4'}>
                            <Alert type={'danger'}>{error}</Alert>
                        </div>
                    )}
                </div>

                <div className={'pfl:flex pfl:items-center pfl:gap-4 pfl:border-t pfl:border-border pfl:px-3 pfl:py-1 pfl:text-xs pfl:text-muted-foreground'}>
                    {active ? (
                        <>
                            <span>{state.dirty.has(active.path) ? '● Unsaved' : 'Saved'}</span>
                            {isProtected(active.path) && (
                                <span className={'pfl:flex pfl:items-center pfl:gap-1 pfl:text-amber-400'}>
                                    <NamedIcon name={'lock'} size={11} /> Protected
                                </span>
                            )}
                            {readOnly && <span>Read only</span>}
                            <span className={'pfl:ml-auto'}>
                                Ln {cursor.line}, Col {cursor.column}
                            </span>
                            <span>Spaces: {settings.tabSize}</span>
                            <span>UTF-8</span>
                            <span>{active.model.getLanguageId()}</span>
                        </>
                    ) : (
                        <span>{state.tabs.length} open</span>
                    )}
                </div>
            </div>

            {palette && <Palette server={server} mode={palette} commands={commands} recent={recent} onOpen={(path) => open(path)} onClose={() => setPalette(null)} />}

            {menu && (
                <ContextMenu
                    menu={menu}
                    onClose={() => setMenu(null)}
                    items={[
                        menu.entry && !menu.entry.directory && { icon: 'file-pen', label: 'Open', run: () => open(menu.entry!.path) },
                        permissions.create && { icon: 'file-plus', label: 'New file', run: () => setPrompt({ kind: 'file', directory: menu.directory }) },
                        permissions.create && { icon: 'folder-plus', label: 'New folder', run: () => setPrompt({ kind: 'folder', directory: menu.directory }) },
                        menu.entry && permissions.update && { icon: 'pencil', label: 'Rename', run: () => setPrompt({ kind: 'rename', directory: dirname(menu.entry!.path), entry: menu.entry! }) },
                        menu.entry && { icon: 'copy', label: 'Copy path', run: () => navigator.clipboard.writeText(menu.entry!.path) },
                        menu.entry && { icon: 'folder-tree', label: 'Show in the file list', run: () => onRevealInFiles(dirname(menu.entry!.path)) },
                        menu.entry &&
                            permissions.remove && {
                                icon: 'trash-2',
                                label: getConfig().trash ? 'Move to trash' : 'Delete',
                                danger: true,
                                run: () => {
                                    const entry = menu.entry!;
                                    if (isProtected(entry.path)) return toast.error(`${entry.path} is protected.`);
                                    setDeleting(entry);
                                },
                            },
                    ]}
                />
            )}

            {prompt && (
                <Prompt
                    title={prompt.kind === 'file' ? 'New file' : prompt.kind === 'folder' ? 'New folder' : `Rename ${prompt.entry?.name}`}
                    label={`In ${prompt.directory}`}
                    initial={prompt.entry?.name ?? ''}
                    confirm={prompt.kind === 'rename' ? 'Rename' : 'Create'}
                    validate={validName}
                    onClose={() => setPrompt(null)}
                    onSubmit={async (name) => {
                        if (prompt.kind === 'folder') return actions.newFolder(prompt.directory, name);
                        if (prompt.kind === 'file') return open(await actions.newFile(prompt.directory, name));
                        const from = prompt.entry!.path;
                        const to = join(prompt.directory, name);
                        if (isProtected(from) || isProtected(to)) return toast.error(`${from} is protected.`);
                        await actions.move([{ from, to }]);
                        state.renamed(from, to);
                        documents.rename(from, to);
                    }}
                />
            )}

            {asking && (
                <Dialog open onClose={() => setClosing([])} title={`Save changes to ${basename(asking)}?`}>
                    <p className={'pfl:text-sm'}>
                        {basename(asking)} has changes that are not saved yet. If you close it without saving, they stay as a draft in this browser and come back the next time you open the file.
                    </p>
                    {closing.length > 1 && <p className={'pfl:mt-2 pfl:text-xs pfl:text-muted-foreground'}>{closing.length - 1} more unsaved {closing.length === 2 ? 'file' : 'files'} after this one.</p>}
                    <Dialog.Footer>
                        <Button.Text onClick={() => setClosing([])} disabled={closingBusy}>
                            Cancel
                        </Button.Text>
                        <Button
                            isSecondary
                            disabled={closingBusy}
                            onClick={() => {
                                discard(asking);
                                setClosing((current) => current.slice(1));
                            }}
                        >
                            Don&apos;t save
                        </Button>
                        <Button
                            isLoading={closingBusy}
                            onClick={async () => {
                                setClosingBusy(true);
                                await save(asking);
                                setClosingBusy(false);
                                // A save that failed or hit a conflict leaves the tab open.
                                if (state.dirty.has(asking)) return setClosing([]);
                                discard(asking);
                                setClosing((current) => current.slice(1));
                            }}
                        >
                            Save
                        </Button>
                    </Dialog.Footer>
                </Dialog>
            )}

            <Dialog.Confirm
                open={deleting !== null}
                onClose={() => setDeleting(null)}
                title={getConfig().trash ? `Move ${deleting?.name} to the trash?` : `Delete ${deleting?.name} for good?`}
                confirm={getConfig().trash ? 'Move to trash' : 'Delete'}
                onConfirmed={async () => {
                    const entry = deleting!;
                    setDeleting(null);
                    await actions.remove(dirname(entry.path), [entry.name]).catch(() => undefined);
                    if (state.tabs.some((tab) => tab.path === entry.path)) discard(entry.path);
                }}
            >
                {getConfig().trash ? `It can be restored from the trash for ${getConfig().trashDays} days.` : 'It cannot be restored.'}
            </Dialog.Confirm>

            {conflict && documents.get(conflict.path) && (
                <DiffView
                    path={conflict.path}
                    original={conflict.server}
                    modified={documents.get(conflict.path)!.model.getValue()}
                    theme={themeFor(settings.theme)}
                    changed={conflict.modified !== ''}
                    onClose={() => setConflict(null)}
                    onOverwrite={() => {
                        setConflict(null);
                        void save(conflict.path, true);
                    }}
                    onTakeServer={() => {
                        setConflict(null);
                        void documents.revert(conflict.path);
                    }}
                />
            )}
        </div>
    );
}

function ActivityButton({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
    return (
        <button
            type={'button'}
            title={label}
            aria-label={label}
            onClick={onClick}
            className={cn('pfl:flex pfl:size-9 pfl:items-center pfl:justify-center pfl:rounded-md pfl:cursor-pointer', active ? 'pfl:bg-primary/15 pfl:text-primary' : 'pfl:text-muted-foreground pfl:hover:bg-muted pfl:hover:text-foreground')}
        >
            <NamedIcon name={icon} size={19} />
        </button>
    );
}

function SmallButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
    return (
        <button type={'button'} title={label} aria-label={label} onClick={onClick} className={'pfl:flex pfl:size-6 pfl:items-center pfl:justify-center pfl:rounded pfl:cursor-pointer pfl:hover:bg-muted'}>
            <NamedIcon name={icon} size={14} />
        </button>
    );
}

/** Your copy beside the server's, before overwriting. */
function DiffView({ path, original, modified, theme, changed, onClose, onOverwrite, onTakeServer }: { path: string; original: string; modified: string; theme: string; changed: boolean; onClose: () => void; onOverwrite: () => void; onTakeServer: () => void }) {
    const host = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!host.current) return;
        const diff = monaco.editor.createDiffEditor(host.current, { automaticLayout: true, readOnly: true, theme, renderSideBySide: window.innerWidth > 900 });
        const left = monaco.editor.createModel(original, undefined);
        const right = monaco.editor.createModel(modified, undefined);
        diff.setModel({ original: left, modified: right });

        return () => {
            diff.dispose();
            left.dispose();
            right.dispose();
        };
    }, [original, modified, theme]);

    return (
        <div className={'pfl:fixed pfl:inset-0 pfl:z-50 pfl:flex pfl:items-center pfl:justify-center pfl:bg-black/50 pfl:p-4'} onMouseDown={onClose}>
            <div className={'pt-surface pt-overlay pfl:flex pfl:h-[85vh] pfl:w-[min(90rem,96vw)] pfl:flex-col pfl:overflow-hidden pfl:rounded-lg pfl:border pfl:border-border pfl:bg-card pfl:shadow-2xl'} onMouseDown={(event) => event.stopPropagation()}>
                <div className={'pfl:flex pfl:flex-wrap pfl:items-center pfl:gap-2 pfl:border-b pfl:border-border pfl:px-4 pfl:py-3'}>
                    <NamedIcon name={changed ? 'triangle-alert' : 'git-compare'} size={16} className={changed ? 'pfl:text-amber-400' : ''} />
                    <div className={'pfl:min-w-0 pfl:flex-1'}>
                        <p className={'pfl:font-semibold'}>{changed ? `${basename(path)} changed on the server` : `Compare ${basename(path)}`}</p>
                        <p className={'pfl:text-xs pfl:text-muted-foreground'}>Left: the file on the server now. Right: your version.</p>
                    </div>
                    <Button.Text onClick={onClose}>Cancel</Button.Text>
                    <Button isSecondary onClick={onTakeServer}>
                        Use the server&apos;s
                    </Button>
                    <Button.Danger onClick={onOverwrite}>Save mine over it</Button.Danger>
                </div>
                <div ref={host} className={'pfl:min-h-0 pfl:flex-1'} />
            </div>
        </div>
    );
}
