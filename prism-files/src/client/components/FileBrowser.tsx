import { useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Dialog, Input, Spinner, bytesToString, cn, fromNow, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { chmod, compress, copyFile, decompress, downloadUrl, fileKeys, listFiles, pull, type FileEntry } from '../api';
import { useFileActions, useFilePermissions, useIsProtected, validName } from '../actions';
import { getConfig } from '../config';
import { basename, dirname, fileIcon, isArchive, isEditable, join, matchesAny, previewKind } from '../lib/paths';
import { readDrop, type UploadQueue } from '../lib/uploads';
import ContextMenu from './ContextMenu';
import { ChmodDialog, PreviewDialog } from './Dialogs';
import Prompt from './Prompt';

type Sort = 'name' | 'size' | 'modified';

interface Props {
    server: string;
    directory: string;
    onNavigate: (directory: string) => void;
    onEdit: (path: string) => void;
    queue: UploadQueue;
    view: 'list' | 'grid';
    onView: (view: 'list' | 'grid') => void;
    showHidden: boolean;
    onShowHidden: (show: boolean) => void;
}

type Dialogs =
    | { kind: 'newFile' | 'newFolder' | 'pull' }
    | { kind: 'rename'; entry: FileEntry }
    | { kind: 'move'; entries: FileEntry[] }
    | { kind: 'chmod'; entries: FileEntry[] }
    | { kind: 'delete'; entries: FileEntry[] }
    | { kind: 'preview'; entry: FileEntry }
    | null;

export default function FileBrowser({ server, directory, onNavigate, onEdit, queue, view, onView, showHidden, onShowHidden }: Props) {
    const config = getConfig();
    const permissions = useFilePermissions();
    const actions = useFileActions(server);
    const isProtected = useIsProtected();
    const files = useQuery({ queryKey: fileKeys.list(server, directory), queryFn: () => listFiles(server, directory) });
    const [filter, setFilter] = useState('');
    const [sort, setSort] = useState<{ by: Sort; desc: boolean }>({ by: 'name', desc: false });
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [anchor, setAnchor] = useState<string | null>(null);
    const [dialog, setDialog] = useState<Dialogs>(null);
    const [menu, setMenu] = useState<{ x: number; y: number; entry: FileEntry } | null>(null);
    const [dropping, setDropping] = useState(false);
    const [busy, setBusy] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const folderInput = useRef<HTMLInputElement>(null);

    const entries = useMemo(() => {
        const term = filter.trim().toLowerCase();
        const list = (files.data ?? []).filter(
            (entry) => entry.name !== '.prism-trash' && (showHidden || (!matchesAny(entry.path, config.hidden, false) && !(entry.name.startsWith('.') && false))) && (term === '' || entry.name.toLowerCase().includes(term))
        );
        const direction = sort.desc ? -1 : 1;

        return list.sort((a, b) => {
            if (a.directory !== b.directory) return a.directory ? -1 : 1;
            if (sort.by === 'size') return (a.size - b.size) * direction;
            if (sort.by === 'modified') return (Date.parse(a.modified) - Date.parse(b.modified)) * direction;

            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) * direction;
        });
    }, [files.data, filter, sort, showHidden, config.hidden]);

    const chosen = entries.filter((entry) => selected.has(entry.name));

    const select = (entry: FileEntry, event: MouseEvent) => {
        const next = new Set(event.ctrlKey || event.metaKey ? selected : []);
        if (event.shiftKey && anchor) {
            const from = entries.findIndex((item) => item.name === anchor);
            const to = entries.findIndex((item) => item.name === entry.name);
            entries.slice(Math.min(from, to), Math.max(from, to) + 1).forEach((item) => next.add(item.name));
        } else if (next.has(entry.name) && (event.ctrlKey || event.metaKey)) {
            next.delete(entry.name);
        } else {
            next.add(entry.name);
        }
        setSelected(next);
        setAnchor(entry.name);
    };

    const openEntry = (entry: FileEntry) => {
        if (entry.directory) {
            setSelected(new Set());
            onNavigate(entry.path);
        } else if (isEditable(entry.name, entry.mimetype) && permissions.readContent) {
            onEdit(entry.path);
        } else if (previewKind(entry.name, entry.mimetype)) {
            setDialog({ kind: 'preview', entry });
        } else {
            void download(entry);
        }
    };

    const download = async (entry: FileEntry) => {
        try {
            window.location.href = await downloadUrl(server, entry.path);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        }
    };

    const run = async (label: string, action: () => Promise<unknown>) => {
        setBusy(true);
        try {
            await action();
            toast.success(label);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
            setSelected(new Set());
            void actions.refresh(directory);
        }
    };

    const blocked = (items: FileEntry[]) => {
        const hit = items.find((entry) => isProtected(entry.path));
        if (hit) toast.error(`${hit.path} is protected, so it cannot be changed here.`);

        return !!hit;
    };

    const onDrop = async (event: DragEvent) => {
        event.preventDefault();
        setDropping(false);
        if (!permissions.create) return;
        const dropped = await readDrop(event.dataTransfer);
        const tooBig = dropped.find(({ file }) => file.size > config.maxUploadBytes);
        if (tooBig) return toast.error(`${tooBig.file.name} is larger than the ${bytesToString(config.maxUploadBytes)} upload limit.`);
        queue.add(dropped, directory);
    };

    const crumbs = directory.split('/').filter(Boolean);
    const sortButton = (by: Sort, label: string, className?: string) => (
        <button type={'button'} onClick={() => setSort({ by, desc: sort.by === by ? !sort.desc : false })} className={cn('pfl:flex pfl:items-center pfl:gap-1 pfl:cursor-pointer pfl:hover:text-foreground', className)}>
            {label}
            {sort.by === by && <NamedIcon name={sort.desc ? 'arrow-down' : 'arrow-up'} size={11} />}
        </button>
    );

    return (
        <div
            className={cn('pfl:relative pfl:flex pfl:flex-col pfl:gap-3', dropping && 'pfl:outline-2 pfl:outline-dashed pfl:outline-primary pfl:rounded-lg')}
            onDragOver={(event) => {
                if (!event.dataTransfer.types.includes('Files')) return;
                event.preventDefault();
                setDropping(true);
            }}
            onDragLeave={(event) => event.currentTarget === event.target && setDropping(false)}
            onDrop={onDrop}
        >
            {/* Toolbar */}
            <div className={'pfl:flex pfl:flex-wrap pfl:items-center pfl:gap-2'}>
                <nav className={'pfl:flex pfl:min-w-0 pfl:flex-1 pfl:flex-wrap pfl:items-center pfl:gap-1 pfl:text-sm'} aria-label={'Folder'}>
                    <button type={'button'} onClick={() => onNavigate('/')} className={'pfl:flex pfl:items-center pfl:rounded pfl:p-1 pfl:cursor-pointer pfl:hover:bg-muted'} aria-label={'Server root'}>
                        <NamedIcon name={'house'} size={15} />
                    </button>
                    {crumbs.map((part, index) => (
                        <span key={index} className={'pfl:flex pfl:items-center pfl:gap-1'}>
                            <NamedIcon name={'chevron-right'} size={12} className={'pfl:text-muted-foreground'} />
                            <button type={'button'} onClick={() => onNavigate('/' + crumbs.slice(0, index + 1).join('/'))} className={'pfl:rounded pfl:px-1 pfl:cursor-pointer pfl:hover:bg-muted'}>
                                {part}
                            </button>
                        </span>
                    ))}
                </nav>
                <div className={'pfl:relative'}>
                    <NamedIcon name={'search'} size={14} className={'pfl:pointer-events-none pfl:absolute pfl:left-2.5 pfl:top-1/2 pfl:-translate-y-1/2 pfl:text-muted-foreground'} />
                    <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={'Filter this folder'} className={'pfl:w-48 pfl:pl-8'} />
                </div>
                <div className={'prism-switch pfl:flex pfl:rounded-md pfl:border pfl:border-border pfl:p-0.5'}>
                    {(['list', 'grid'] as const).map((value) => (
                        <button key={value} type={'button'} onClick={() => onView(value)} aria-label={value === 'list' ? 'List' : 'Grid'} className={cn('prism-switch-item pfl:flex pfl:size-7 pfl:items-center pfl:justify-center pfl:rounded pfl:cursor-pointer', view === value ? 'pfl:bg-muted pfl:text-foreground' : 'pfl:text-muted-foreground')}>
                            <NamedIcon name={value === 'list' ? 'list' : 'layout-grid'} size={15} />
                        </button>
                    ))}
                </div>
                <button type={'button'} title={showHidden ? 'Hide hidden files' : 'Show hidden files'} onClick={() => onShowHidden(!showHidden)} className={cn('pfl:flex pfl:size-8 pfl:items-center pfl:justify-center pfl:rounded-md pfl:cursor-pointer pfl:hover:bg-muted', showHidden ? 'pfl:text-foreground' : 'pfl:text-muted-foreground')}>
                    <NamedIcon name={showHidden ? 'eye' : 'eye-off'} size={15} />
                </button>
                <button type={'button'} title={'Refresh'} onClick={() => actions.refresh(directory)} className={'pfl:flex pfl:size-8 pfl:items-center pfl:justify-center pfl:rounded-md pfl:text-muted-foreground pfl:cursor-pointer pfl:hover:bg-muted'}>
                    <NamedIcon name={'refresh-cw'} size={15} className={files.isFetching ? 'pfl:animate-spin' : ''} />
                </button>
                {permissions.create && (
                    <>
                        <Button isSecondary size={'small'} onClick={() => setDialog({ kind: 'newFile' })}>
                            <NamedIcon name={'file-plus'} size={14} /> New file
                        </Button>
                        <Button isSecondary size={'small'} onClick={() => setDialog({ kind: 'newFolder' })} aria-label={'New folder'}>
                            <NamedIcon name={'folder-plus'} size={14} />
                        </Button>
                        <Button isSecondary size={'small'} onClick={() => setDialog({ kind: 'pull' })} aria-label={'Download from a URL'} title={'Download from a URL'}>
                            <NamedIcon name={'link'} size={14} />
                        </Button>
                        <Button size={'small'} onClick={() => input.current?.click()}>
                            <NamedIcon name={'upload'} size={14} /> Upload
                        </Button>
                        <Button isSecondary size={'small'} onClick={() => folderInput.current?.click()} aria-label={'Upload a folder'} title={'Upload a folder'}>
                            <NamedIcon name={'folder-up'} size={14} />
                        </Button>
                        <input ref={input} type={'file'} multiple hidden onChange={(event) => (queue.add([...(event.target.files ?? [])].map((file) => ({ file })), directory), (event.target.value = ''))} />
                        <input
                            ref={folderInput}
                            type={'file'}
                            hidden
                            {...({ webkitdirectory: '' } as object)}
                            onChange={(event) => (queue.add([...(event.target.files ?? [])].map((file) => ({ file, relative: file.webkitRelativePath || undefined })), directory), (event.target.value = ''))}
                        />
                    </>
                )}
            </div>

            {files.isError && <Alert type={'danger'}>{httpErrorToHuman(files.error)}</Alert>}

            {/* Listing */}
            <div className={'pt-surface pfl:overflow-hidden pfl:rounded-lg pfl:border pfl:border-border pfl:bg-card'}>
                {view === 'list' && (
                    <div className={'pfl:grid pfl:grid-cols-[2rem_minmax(0,1fr)_6rem_9rem_2rem] pfl:items-center pfl:gap-2 pfl:border-b pfl:border-border pfl:px-3 pfl:py-2 pfl:text-xs pfl:uppercase pfl:tracking-wide pfl:text-muted-foreground'}>
                        <Checkbox checked={entries.length > 0 && chosen.length === entries.length} onChange={(checked) => setSelected(new Set(checked ? entries.map((entry) => entry.name) : []))} />
                        {sortButton('name', 'Name')}
                        {sortButton('size', 'Size', 'pfl:justify-end')}
                        {sortButton('modified', 'Modified', 'pfl:hidden pfl:sm:flex')}
                        <span />
                    </div>
                )}
                {files.isLoading ? (
                    <div className={'pfl:py-10'}>
                        <Spinner centered />
                    </div>
                ) : entries.length === 0 ? (
                    <p className={'pfl:py-10 pfl:text-center pfl:text-sm pfl:text-muted-foreground'}>{filter ? 'Nothing here matches.' : 'This folder is empty. Drop files here to upload them.'}</p>
                ) : view === 'list' ? (
                    <div className={'pfl:divide-y pfl:divide-border/60'}>
                        {entries.map((entry) => {
                            const icon = fileIcon(entry.name, entry.directory);
                            const isSelected = selected.has(entry.name);

                            return (
                                <div
                                    key={entry.path}
                                    onClick={(event) => select(entry, event)}
                                    onDoubleClick={() => openEntry(entry)}
                                    onContextMenu={(event) => {
                                        event.preventDefault();
                                        if (!selected.has(entry.name)) setSelected(new Set([entry.name]));
                                        setMenu({ x: event.clientX, y: event.clientY, entry });
                                    }}
                                    className={cn('pfl:grid pfl:cursor-pointer pfl:select-none pfl:grid-cols-[2rem_minmax(0,1fr)_6rem_9rem_2rem] pfl:items-center pfl:gap-2 pfl:px-3 pfl:py-1.5 pfl:text-sm', isSelected ? 'pfl:bg-primary/15' : 'pfl:hover:bg-muted/50')}
                                >
                                    {/* The checkbox only toggles; quick clicks on it never reach the row's double-click. */}
                                    <span className={'pfl:-my-1.5 pfl:flex pfl:self-stretch pfl:items-center'} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
                                        <Checkbox checked={isSelected} onChange={(checked) => setSelected((current) => new Set(checked ? [...current, entry.name] : [...current].filter((name) => name !== entry.name)))} />
                                    </span>
                                    <div className={'pfl:flex pfl:min-w-0 pfl:items-center pfl:gap-2'}>
                                        {/* Only the icon and the name open the entry; the rest of the cell selects the row. */}
                                        <button
                                            type={'button'}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                if (event.ctrlKey || event.metaKey || event.shiftKey) select(entry, event);
                                                else openEntry(entry);
                                            }}
                                            onDoubleClick={(event) => event.stopPropagation()}
                                            className={'pfl:inline-flex pfl:min-w-0 pfl:max-w-full pfl:items-center pfl:gap-2 pfl:text-left pfl:cursor-pointer'}
                                        >
                                            <NamedIcon name={icon.icon} size={17} className={cn('pfl:shrink-0', icon.color)} />
                                            <span className={'pfl:truncate pfl:hover:underline'}>{entry.name}</span>
                                        </button>
                                        {isProtected(entry.path) && <NamedIcon name={'lock'} size={12} className={'pfl:shrink-0 pfl:text-amber-400'} />}
                                        {entry.symlink && <NamedIcon name={'link'} size={12} className={'pfl:shrink-0 pfl:text-muted-foreground'} />}
                                    </div>
                                    <span className={'pfl:text-right pfl:text-xs pfl:text-muted-foreground pfl:tabular-nums'}>{entry.directory ? '—' : bytesToString(entry.size)}</span>
                                    <span className={'pfl:hidden pfl:text-xs pfl:text-muted-foreground pfl:sm:block'} title={new Date(entry.modified).toLocaleString()}>
                                        {fromNow(entry.modified)}
                                    </span>
                                    <button
                                        type={'button'}
                                        onDoubleClick={(event) => event.stopPropagation()}
                                        aria-label={`Actions for ${entry.name}`}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setSelected(new Set([entry.name]));
                                            setMenu({ x: event.clientX, y: event.clientY, entry });
                                        }}
                                        className={'pfl:flex pfl:size-7 pfl:items-center pfl:justify-center pfl:rounded pfl:text-muted-foreground pfl:cursor-pointer pfl:hover:bg-muted'}
                                    >
                                        <NamedIcon name={'ellipsis'} size={15} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className={'pfl:grid pfl:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] pfl:gap-2 pfl:p-3'}>
                        {entries.map((entry) => {
                            const icon = fileIcon(entry.name, entry.directory);

                            return (
                                <button
                                    key={entry.path}
                                    type={'button'}
                                    onClick={(event) => select(entry, event)}
                                    onDoubleClick={() => openEntry(entry)}
                                    onContextMenu={(event) => {
                                        event.preventDefault();
                                        if (!selected.has(entry.name)) setSelected(new Set([entry.name]));
                                        setMenu({ x: event.clientX, y: event.clientY, entry });
                                    }}
                                    title={entry.name}
                                    className={cn('pfl:flex pfl:flex-col pfl:items-center pfl:gap-1.5 pfl:rounded-lg pfl:border pfl:p-3 pfl:text-center pfl:cursor-pointer', selected.has(entry.name) ? 'pfl:border-primary pfl:bg-primary/15' : 'pfl:border-transparent pfl:hover:bg-muted/50')}
                                >
                                    <span className={'pfl:flex pfl:size-12 pfl:items-center pfl:justify-center pfl:rounded-lg pfl:bg-muted/50'}>
                                        <NamedIcon name={icon.icon} size={26} className={icon.color} />
                                    </span>
                                    <span className={'pfl:line-clamp-2 pfl:w-full pfl:break-all pfl:text-xs'}>{entry.name}</span>
                                    <span className={'pfl:text-[10px] pfl:text-muted-foreground'}>{entry.directory ? fromNow(entry.modified) : bytesToString(entry.size)}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
            <p className={'pfl:text-xs pfl:text-muted-foreground'}>
                {entries.length} items{chosen.length > 0 && ` · ${chosen.length} selected`} · drop files or folders here to upload
            </p>

            {/* Bulk actions */}
            {chosen.length > 0 && (
                <div className={'pt-surface pt-overlay pfl:sticky pfl:bottom-4 pfl:z-20 pfl:mx-auto pfl:flex pfl:flex-wrap pfl:items-center pfl:gap-2 pfl:rounded-full pfl:border pfl:border-border pfl:bg-card pfl:px-4 pfl:py-2 pfl:shadow-2xl'}>
                    <span className={'pfl:text-sm pfl:font-medium'}>{chosen.length} selected</span>
                    {permissions.update && (
                        <Button size={'small'} isSecondary disabled={busy} onClick={() => !blocked(chosen) && setDialog({ kind: 'move', entries: chosen })}>
                            <NamedIcon name={'folder-input'} size={14} /> Move
                        </Button>
                    )}
                    {permissions.archive && (
                        <Button size={'small'} isSecondary disabled={busy} onClick={() => run('Archive created.', () => compress(server, directory, chosen.map((entry) => entry.name)))}>
                            <NamedIcon name={'file-archive'} size={14} /> Archive
                        </Button>
                    )}
                    {permissions.update && (
                        <Button size={'small'} isSecondary disabled={busy} onClick={() => !blocked(chosen) && setDialog({ kind: 'chmod', entries: chosen })}>
                            <NamedIcon name={'shield'} size={14} /> Chmod
                        </Button>
                    )}
                    {chosen.length === 1 && !chosen[0].directory && (
                        <Button size={'small'} isSecondary onClick={() => download(chosen[0])}>
                            <NamedIcon name={'download'} size={14} /> Download
                        </Button>
                    )}
                    {permissions.remove && (
                        <Button.Danger size={'small'} disabled={busy} onClick={() => !blocked(chosen) && setDialog({ kind: 'delete', entries: chosen })}>
                            <NamedIcon name={'trash-2'} size={14} /> {config.trash ? 'Trash' : 'Delete'}
                        </Button.Danger>
                    )}
                    <Button.Text size={'small'} onClick={() => setSelected(new Set())}>
                        Clear
                    </Button.Text>
                </div>
            )}

            {menu && (
                <ContextMenu
                    menu={menu}
                    onClose={() => setMenu(null)}
                    items={[
                        { icon: menu.entry.directory ? 'folder-open' : isEditable(menu.entry.name, menu.entry.mimetype) ? 'file-pen' : 'eye', label: menu.entry.directory ? 'Open' : isEditable(menu.entry.name, menu.entry.mimetype) ? 'Edit' : 'Preview', run: () => openEntry(menu.entry) },
                        !menu.entry.directory && previewKind(menu.entry.name, menu.entry.mimetype) && { icon: 'eye', label: 'Quick look', run: () => setDialog({ kind: 'preview', entry: menu.entry }) },
                        permissions.update && { icon: 'pencil', label: 'Rename', run: () => !blocked([menu.entry]) && setDialog({ kind: 'rename', entry: menu.entry }) },
                        permissions.update && { icon: 'folder-input', label: 'Move', run: () => !blocked([menu.entry]) && setDialog({ kind: 'move', entries: [menu.entry] }) },
                        permissions.create && !menu.entry.directory && { icon: 'copy', label: 'Make a copy', run: () => run('Copy made.', () => copyFile(server, menu.entry.path)) },
                        permissions.archive && { icon: 'file-archive', label: 'Archive', run: () => run('Archive created.', () => compress(server, directory, [menu.entry.name])) },
                        permissions.create && permissions.update && isArchive(menu.entry.name) && { icon: 'package-open', label: 'Extract here', run: () => run(`${menu.entry.name} extracted.`, () => decompress(server, directory, menu.entry.name)) },
                        permissions.update && { icon: 'shield', label: 'Permissions', run: () => setDialog({ kind: 'chmod', entries: [menu.entry] }) },
                        !menu.entry.directory && { icon: 'download', label: 'Download', run: () => download(menu.entry) },
                        { icon: 'clipboard', label: 'Copy path', run: () => navigator.clipboard.writeText(menu.entry.path) },
                        permissions.remove && { icon: 'trash-2', label: config.trash ? 'Move to trash' : 'Delete', danger: true, run: () => !blocked([menu.entry]) && setDialog({ kind: 'delete', entries: chosen.length > 1 && selected.has(menu.entry.name) ? chosen : [menu.entry] }) },
                    ]}
                />
            )}

            {dialog?.kind === 'newFile' && (
                <Prompt title={'New file'} label={`In ${directory}`} confirm={'Create'} validate={validName} onClose={() => setDialog(null)} onSubmit={async (name) => onEdit(await actions.newFile(directory, name))} />
            )}
            {dialog?.kind === 'newFolder' && <Prompt title={'New folder'} label={`In ${directory}`} confirm={'Create'} validate={validName} onClose={() => setDialog(null)} onSubmit={(name) => actions.newFolder(directory, name)} />}
            {dialog?.kind === 'pull' && (
                <Prompt
                    title={'Download from a URL'}
                    label={'The node downloads the file straight into this folder.'}
                    confirm={'Download'}
                    validate={(value) => (/^https?:\/\/\S+$/.test(value.trim()) ? null : 'Enter an http or https link.')}
                    onClose={() => setDialog(null)}
                    onSubmit={async (url) => {
                        await pull(server, url, directory).catch((error) => {
                            toast.error(httpErrorToHuman(error));
                            throw error;
                        });
                        toast.success('The download started. Refresh in a moment to see the file.');
                    }}
                />
            )}
            {dialog?.kind === 'rename' && (
                <Prompt
                    title={`Rename ${dialog.entry.name}`}
                    label={'New name'}
                    initial={dialog.entry.name}
                    confirm={'Rename'}
                    validate={validName}
                    onClose={() => setDialog(null)}
                    onSubmit={async (name) => {
                        const to = join(directory, name);
                        if (isProtected(to)) return void toast.error(`${to} is protected.`);
                        await actions.move([{ from: dialog.entry.path, to }]);
                        setSelected(new Set());
                    }}
                />
            )}
            {dialog?.kind === 'move' && (
                <Prompt
                    title={`Move ${dialog.entries.length === 1 ? dialog.entries[0].name : `${dialog.entries.length} items`}`}
                    label={'To the folder'}
                    initial={directory}
                    confirm={'Move'}
                    validate={(value) => (value.trim().startsWith('/') ? null : 'Start the folder with /, such as /plugins.')}
                    onClose={() => setDialog(null)}
                    onSubmit={async (target) => {
                        const moves = dialog.entries.map((entry) => ({ from: entry.path, to: join(target, entry.name) }));
                        if (moves.some((move) => isProtected(move.to))) return void toast.error('That folder is protected.');
                        await actions.move(moves);
                        setSelected(new Set());
                    }}
                />
            )}
            {dialog?.kind === 'chmod' && (
                <ChmodDialog
                    entries={dialog.entries}
                    onClose={() => setDialog(null)}
                    onSubmit={(mode) => run('Permissions changed.', () => chmod(server, directory, dialog.entries.map((entry) => ({ file: entry.name, mode }))))}
                />
            )}
            {dialog?.kind === 'delete' && (
                <Dialog.Confirm
                    open
                    onClose={() => setDialog(null)}
                    title={config.trash ? 'Move to the trash?' : 'Delete for good?'}
                    confirm={config.trash ? 'Move to trash' : 'Delete'}
                    onConfirmed={async () => {
                        const names = dialog.entries.map((entry) => entry.name);
                        setDialog(null);
                        await actions.remove(directory, names).catch(() => undefined);
                        setSelected(new Set());
                    }}
                >
                    {dialog.entries.length === 1 ? dialog.entries[0].name : `${dialog.entries.length} items`}{' '}
                    {config.trash ? `can be restored from the trash for ${config.trashDays} days.` : 'will be deleted and cannot be restored.'}
                </Dialog.Confirm>
            )}
            {dialog?.kind === 'preview' && (
                <PreviewDialog
                    server={server}
                    entry={dialog.entry}
                    onClose={() => setDialog(null)}
                    onEdit={
                        permissions.readContent && isEditable(dialog.entry.name, dialog.entry.mimetype)
                            ? () => {
                                  setDialog(null);
                                  onEdit(dialog.entry.path);
                              }
                            : undefined
                    }
                />
            )}
        </div>
    );
}

export { basename, dirname };
