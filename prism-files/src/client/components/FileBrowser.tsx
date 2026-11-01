import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Dialog, Input, Spinner, bytesToString, cn, fromNow, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { chmod, compress, copyFile, decompress, downloadUrl, fileKeys, listFiles, type FileEntry } from '../api';
import { useFileActions, useFilePermissions, useIsProtected, validName } from '../actions';
import { getConfig } from '../config';
import { basename, dirname, fileIcon, isArchive, isEditable, join, matchesAny, previewKind } from '../lib/paths';
import { readDrop, type UploadQueue } from '../lib/uploads';
import ContextMenu from './ContextMenu';
import { ChmodDialog, PreviewDialog } from './Dialogs';
import Prompt from './Prompt';
import UploadDialog from './UploadDialog';

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
    | { kind: 'newFile' | 'newFolder' | 'upload' }
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
    const [newMenu, setNewMenu] = useState<{ x: number; y: number } | null>(null);

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
                    <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={'Filter this folder'} className={'pfl:h-9 pfl:w-48 pfl:pl-8'} />
                </div>
                {/* How the folder is shown: one group of same-sized icon buttons. */}
                <div className={'prism-switch pfl:flex pfl:h-9 pfl:items-center pfl:gap-0.5 pfl:rounded-md pfl:border pfl:border-border pfl:p-0.5'}>
                    {(['list', 'grid'] as const).map((value) => (
                        <ToolButton key={value} label={value === 'list' ? 'List view' : 'Grid view'} active={view === value} onClick={() => onView(value)}>
                            <NamedIcon name={value === 'list' ? 'list' : 'layout-grid'} size={15} />
                        </ToolButton>
                    ))}
                    <span className={'pfl:mx-0.5 pfl:h-4 pfl:w-px pfl:bg-border'} />
                    <ToolButton label={showHidden ? 'Hide hidden files' : 'Show hidden files'} active={showHidden} onClick={() => onShowHidden(!showHidden)}>
                        <NamedIcon name={showHidden ? 'eye' : 'eye-off'} size={15} />
                    </ToolButton>
                    <ToolButton label={'Refresh'} onClick={() => actions.refresh(directory)}>
                        <NamedIcon name={'refresh-cw'} size={15} className={files.isFetching ? 'pfl:animate-spin' : ''} />
                    </ToolButton>
                </div>
                {permissions.create && (
                    <>
                        <Button
                            isSecondary
                            className={'pfl:h-9'}
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                                const rect = event.currentTarget.getBoundingClientRect();
                                setNewMenu(newMenu ? null : { x: rect.left, y: rect.bottom + 4 });
                            }}
                            aria-haspopup={'menu'}
                            aria-expanded={!!newMenu}
                        >
                            <NamedIcon name={'plus'} size={15} /> New <NamedIcon name={'chevron-down'} size={13} className={'pfl:text-muted-foreground'} />
                        </Button>
                        <Button className={'pfl:h-9'} onClick={() => setDialog({ kind: 'upload' })}>
                            <NamedIcon name={'upload'} size={15} /> Upload
                        </Button>
                    </>
                )}
            </div>
            {newMenu && (
                <ContextMenu
                    menu={newMenu}
                    onClose={() => setNewMenu(null)}
                    items={[
                        { icon: 'file-plus', label: 'File', run: () => setDialog({ kind: 'newFile' }) },
                        { icon: 'folder-plus', label: 'Folder', run: () => setDialog({ kind: 'newFolder' }) },
                    ]}
                />
            )}

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
                    <div className={'pfl:grid pfl:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] pfl:gap-3 pfl:p-3'}>
                        {entries.map((entry) => {
                            const icon = fileIcon(entry.name, entry.directory);
                            const isSelected = selected.has(entry.name);

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
                                    className={cn(
                                        'pfl:group pfl:relative pfl:flex pfl:flex-col pfl:gap-2 pfl:rounded-xl pfl:border pfl:p-2 pfl:text-left pfl:cursor-pointer',
                                        isSelected ? 'pfl:border-primary pfl:bg-primary/10' : 'pfl:border-border/70 pfl:hover:border-border pfl:hover:bg-muted/30'
                                    )}
                                >
                                    <span className={'pfl:flex pfl:aspect-[4/3] pfl:w-full pfl:items-center pfl:justify-center pfl:overflow-hidden pfl:rounded-lg pfl:bg-muted/50'}>
                                        <Thumbnail server={server} entry={entry} fallback={<NamedIcon name={icon.icon} size={30} className={icon.color} />} />
                                    </span>
                                    {/* The check only toggles this card, as the list's checkbox does. */}
                                    <span
                                        role={'checkbox'}
                                        aria-checked={isSelected}
                                        aria-label={`Select ${entry.name}`}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setSelected((current) => new Set(isSelected ? [...current].filter((name) => name !== entry.name) : [...current, entry.name]));
                                            setAnchor(entry.name);
                                        }}
                                        onDoubleClick={(event) => event.stopPropagation()}
                                        className={cn(
                                            'pfl:absolute pfl:left-3.5 pfl:top-3.5 pfl:flex pfl:size-5 pfl:items-center pfl:justify-center pfl:rounded-[min(calc(var(--radius)*0.4),0.375rem)] pfl:border pfl:shadow-sm',
                                            isSelected ? 'pfl:border-primary pfl:bg-primary pfl:text-primary-foreground' : 'pfl:border-border pfl:bg-card/80 pfl:opacity-0 pfl:group-hover:opacity-100'
                                        )}
                                    >
                                        {isSelected && <NamedIcon name={'check'} size={13} />}
                                    </span>
                                    <span className={'pfl:flex pfl:min-w-0 pfl:flex-col pfl:px-0.5'}>
                                        <span className={'pfl:flex pfl:min-w-0 pfl:items-center pfl:gap-1 pfl:text-xs'}>
                                            <span className={'pfl:truncate'}>{entry.name}</span>
                                            {isProtected(entry.path) && <NamedIcon name={'lock'} size={11} className={'pfl:shrink-0 pfl:text-amber-400'} />}
                                            {entry.symlink && <NamedIcon name={'link'} size={11} className={'pfl:shrink-0 pfl:text-muted-foreground'} />}
                                        </span>
                                        <span className={'pfl:text-[10px] pfl:text-muted-foreground'}>{entry.directory ? fromNow(entry.modified) : bytesToString(entry.size)}</span>
                                    </span>
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
                <div className={'pt-surface pt-overlay pfl:sticky pfl:bottom-4 pfl:z-20 pfl:mx-auto pfl:flex pfl:flex-wrap pfl:items-center pfl:gap-2 pfl:rounded-xl pfl:border pfl:border-border pfl:bg-card pfl:px-4 pfl:py-2 pfl:shadow-2xl'}>
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
            {dialog?.kind === 'upload' && <UploadDialog server={server} directory={directory} queue={queue} onClose={() => setDialog(null)} />}
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

/** A square icon button in the toolbar's view group; `active` marks a view or toggle that is on. */
function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type={'button'}
            title={label}
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            className={cn('prism-switch-item pfl:flex pfl:size-7 pfl:items-center pfl:justify-center pfl:rounded pfl:cursor-pointer pfl:transition-colors', active ? 'pfl:bg-muted pfl:text-foreground' : 'pfl:text-muted-foreground pfl:hover:bg-muted/60 pfl:hover:text-foreground')}
        >
            {children}
        </button>
    );
}

/** Images up to this size get a picture in the grid; larger ones keep their icon. */
const THUMBNAIL_BYTES = 8 * 1024 * 1024;

/**
 * An image file's own picture for its grid card, asked for once the card scrolls into view, so a
 * folder of hundreds of images does not ask the node for every one at once. Anything else, or an
 * image that fails to load, shows the fallback icon.
 */
function Thumbnail({ server, entry, fallback }: { server: string; entry: FileEntry; fallback: ReactNode }) {
    const wanted = !entry.directory && previewKind(entry.name, entry.mimetype) === 'image' && entry.size > 0 && entry.size <= THUMBNAIL_BYTES;
    const holder = useRef<HTMLSpanElement>(null);
    const [visible, setVisible] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!wanted || visible || !holder.current) return;
        const observer = new IntersectionObserver(([item]) => item?.isIntersecting && setVisible(true), { rootMargin: '200px' });
        observer.observe(holder.current);

        return () => observer.disconnect();
    }, [wanted, visible]);

    const url = useQuery({
        queryKey: ['prism-files', server, 'thumbnail', entry.path, entry.modified],
        queryFn: () => downloadUrl(server, entry.path),
        enabled: wanted && visible,
        staleTime: Infinity,
        gcTime: 0,
        retry: false,
    });

    if (!wanted || failed) return <>{fallback}</>;

    return (
        <span ref={holder} className={'pfl:flex pfl:size-full pfl:items-center pfl:justify-center'}>
            {url.data ? (
                <img src={url.data} alt={''} draggable={false} onError={() => setFailed(true)} className={'pfl:size-full pfl:object-cover'} style={{ imageRendering: entry.size < 20_000 ? 'pixelated' : 'auto' }} />
            ) : (
                fallback
            )}
        </span>
    );
}

export { basename, dirname };
