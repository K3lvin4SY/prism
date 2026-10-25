import { useEffect, useState, type DragEvent, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { fileKeys, listFiles, type FileEntry } from '../api';
import { getConfig } from '../config';
import { fileIcon, isEditable, join, matchesAny } from '../lib/paths';

interface Props {
    server: string;
    active: string | null;
    dirty: Set<string>;
    showHidden: boolean;
    onOpen: (path: string, preview: boolean) => void;
    onMove: (from: string, toDirectory: string) => void;
    onContext: (event: MouseEvent, entry: FileEntry | null, directory: string) => void;
}

/** The workbench's file tree. Folders load when they are first opened. */
export default function Explorer(props: Props) {
    const [open, setOpen] = useState<Set<string>>(() => new Set(['/']));

    // Opening a file deep in the tree opens its folders too.
    useEffect(() => {
        if (!props.active) return;
        const parts = props.active.split('/').slice(1, -1);
        setOpen((current) => {
            const next = new Set(current);
            parts.forEach((_, index) => next.add('/' + parts.slice(0, index + 1).join('/')));

            return next;
        });
    }, [props.active]);

    const toggle = (path: string) =>
        setOpen((current) => {
            const next = new Set(current);
            next.has(path) ? next.delete(path) : next.add(path);

            return next;
        });

    return (
        <div className={'pfl:min-h-0 pfl:flex-1 pfl:overflow-auto pfl:py-1 pfl:text-[13px]'} onContextMenu={(event) => props.onContext(event, null, '/')}>
            <Folder {...props} path={'/'} depth={0} open={open} toggle={toggle} />
        </div>
    );
}

function Folder({ path, depth, open, toggle, ...props }: Props & { path: string; depth: number; open: Set<string>; toggle: (path: string) => void }) {
    const files = useQuery({ queryKey: fileKeys.list(props.server, path), queryFn: () => listFiles(props.server, path), staleTime: 15_000 });
    const config = getConfig();

    if (files.isLoading) {
        return (
            <div style={{ paddingLeft: depth * 12 + 20 }} className={'pfl:py-1'}>
                <Spinner size={'small'} />
            </div>
        );
    }

    const entries = (files.data ?? []).filter((entry) => entry.name !== '.prism-trash' && (props.showHidden || !matchesAny(entry.path, config.hidden, false)));

    return (
        <>
            {entries.map((entry) => (
                <Node key={entry.path} entry={entry} depth={depth} open={open} toggle={toggle} {...props} />
            ))}
            {entries.length === 0 && (
                <div style={{ paddingLeft: depth * 12 + 20 }} className={'pfl:py-0.5 pfl:italic pfl:text-muted-foreground'}>
                    Empty
                </div>
            )}
        </>
    );
}

function Node({ entry, depth, open, toggle, ...props }: Props & { entry: FileEntry; depth: number; open: Set<string>; toggle: (path: string) => void }) {
    const [over, setOver] = useState(false);
    const expanded = open.has(entry.path);
    const icon = fileIcon(entry.name, entry.directory);
    const editable = !entry.directory && isEditable(entry.name, entry.mimetype);

    const drop = (event: DragEvent) => {
        event.preventDefault();
        setOver(false);
        const from = event.dataTransfer.getData('application/x-prism-path');
        if (from && entry.directory && from !== entry.path && !entry.path.startsWith(from + '/')) props.onMove(from, entry.path);
    };

    return (
        <>
            <div
                role={'treeitem'}
                aria-expanded={entry.directory ? expanded : undefined}
                draggable
                onDragStart={(event) => event.dataTransfer.setData('application/x-prism-path', entry.path)}
                onDragOver={(event) => {
                    if (!entry.directory) return;
                    event.preventDefault();
                    setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={drop}
                onClick={() => (entry.directory ? toggle(entry.path) : editable && props.onOpen(entry.path, true))}
                onDoubleClick={() => !entry.directory && editable && props.onOpen(entry.path, false)}
                onContextMenu={(event) => {
                    event.stopPropagation();
                    props.onContext(event, entry, entry.directory ? entry.path : entry.path.slice(0, entry.path.lastIndexOf('/')) || '/');
                }}
                title={entry.path}
                style={{ paddingLeft: depth * 12 + 6 }}
                className={cn(
                    'pfl:flex pfl:cursor-pointer pfl:select-none pfl:items-center pfl:gap-1 pfl:py-[3px] pfl:pr-2',
                    props.active === entry.path ? 'pfl:bg-primary/25' : 'pfl:hover:bg-muted/60',
                    over && 'pfl:bg-primary/15 pfl:outline pfl:outline-1 pfl:outline-primary',
                    !entry.directory && !editable && 'pfl:opacity-60'
                )}
            >
                <NamedIcon name={entry.directory ? (expanded ? 'chevron-down' : 'chevron-right') : 'dot'} size={14} className={cn('pfl:shrink-0', !entry.directory && 'pfl:invisible')} />
                <NamedIcon name={entry.directory && expanded ? 'folder-open' : icon.icon} size={15} className={cn('pfl:shrink-0', icon.color)} />
                <span className={'pfl:min-w-0 pfl:flex-1 pfl:truncate'}>{entry.name}</span>
                {props.dirty.has(entry.path) && <span className={'pfl:size-2 pfl:shrink-0 pfl:rounded-full pfl:bg-foreground/70'} />}
            </div>
            {entry.directory && expanded && <Folder {...props} path={entry.path} depth={depth + 1} open={open} toggle={toggle} />}
        </>
    );
}

export { join };
