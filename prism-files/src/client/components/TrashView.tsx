import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Dialog, Input, bytesToString, cn, fromNow, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { emptyTrash, fileKeys, ignoreTrash, purgeTrash, restoreTrash, type TrashItem } from '../api';
import { useFilePermissions } from '../actions';
import { getConfig } from '../config';
import { dirname, fileIcon } from '../lib/paths';

/** Deleted files: restore them where they were, delete them for good, or empty the trash. */
export default function TrashView({ server, items, ignored }: { server: string; items: TrashItem[]; ignored: boolean }) {
    const queryClient = useQueryClient();
    const permissions = useFilePermissions();
    const config = getConfig();
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const [conflicts, setConflicts] = useState<{ ids: string[]; paths: string[] } | null>(null);
    const [confirmEmpty, setConfirmEmpty] = useState(false);

    const refresh = (paths: string[] = []) =>
        Promise.all([
            queryClient.invalidateQueries({ queryKey: fileKeys.state(server) }),
            ...[...new Set(paths.map(dirname))].map((directory) => queryClient.invalidateQueries({ queryKey: fileKeys.list(server, directory) })),
        ]);

    const run = async (action: () => Promise<unknown>) => {
        setBusy(true);
        try {
            await action();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    const restore = (ids: string[], conflict: 'skip' | 'replace' | 'rename') =>
        run(async () => {
            const result = await restoreTrash(server, ids, conflict);
            setSelected(new Set());
            await refresh(result.restored);
            if (result.conflicts.length > 0) {
                setConflicts({ ids: items.filter((item) => result.conflicts.includes(item.path)).map((item) => item.id), paths: result.conflicts });
            } else {
                setConflicts(null);
                toast.success(result.restored.length === 1 ? `Restored ${result.restored[0]}.` : `Restored ${result.restored.length} items.`);
            }
        });

    const term = query.trim().toLowerCase();
    const shown = items.filter((item) => term === '' || item.path.toLowerCase().includes(term) || item.by?.toLowerCase().includes(term));
    const total = items.reduce((sum, item) => sum + item.size, 0);
    const expires = (item: TrashItem) => {
        const days = Math.ceil((Date.parse(item.deletedAt) + config.trashDays * 86400000 - Date.now()) / 86400000);

        return days <= 0 ? 'today' : days === 1 ? 'in 1 day' : `in ${days} days`;
    };

    return (
        <div className={'pfl:flex pfl:flex-col pfl:gap-3'}>
            <div className={'pfl:flex pfl:flex-wrap pfl:items-center pfl:gap-2'}>
                <p className={'pfl:flex-1 pfl:text-sm pfl:text-muted-foreground'}>
                    <strong className={'pfl:text-foreground'}>{bytesToString(total)}</strong> in {items.length} items · deleted for good after {config.trashDays} days
                </p>
                <div className={'pfl:relative'}>
                    <NamedIcon name={'search'} size={14} className={'pfl:pointer-events-none pfl:absolute pfl:left-2.5 pfl:top-1/2 pfl:-translate-y-1/2 pfl:text-muted-foreground'} />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={'Search the trash'} className={'pfl:w-52 pfl:pl-8'} />
                </div>
                {permissions.update && (
                    <Button size={'small'} isSecondary disabled={ignored || busy} onClick={() => run(async () => (await ignoreTrash(server), await refresh(), toast.success('Backups now leave the trash out.')))} title={'Adds .prism-trash to .pteroignore'}>
                        <NamedIcon name={ignored ? 'shield-check' : 'shield'} size={14} /> {ignored ? 'Skipped in backups' : 'Skip in backups'}
                    </Button>
                )}
                {permissions.remove && (
                    <Button.Danger size={'small'} isSecondary disabled={items.length === 0 || busy} onClick={() => setConfirmEmpty(true)}>
                        <NamedIcon name={'trash-2'} size={14} /> Empty trash
                    </Button.Danger>
                )}
            </div>

            <div className={'pfl:overflow-hidden pfl:rounded-lg pfl:border pfl:border-border pfl:bg-card'}>
                <div className={'pfl:grid pfl:grid-cols-[2rem_minmax(0,1fr)_5rem_7rem_6rem_7.5rem] pfl:items-center pfl:gap-2 pfl:border-b pfl:border-border pfl:px-3 pfl:py-2 pfl:text-xs pfl:uppercase pfl:tracking-wide pfl:text-muted-foreground'}>
                    <Checkbox checked={shown.length > 0 && shown.every((item) => selected.has(item.id))} onChange={(checked) => setSelected(new Set(checked ? shown.map((item) => item.id) : []))} />
                    <span>Original location</span>
                    <span className={'pfl:text-right'}>Size</span>
                    <span className={'pfl:hidden pfl:sm:block'}>Deleted</span>
                    <span className={'pfl:hidden pfl:sm:block'}>Expires</span>
                    <span />
                </div>
                {shown.length === 0 ? (
                    <p className={'pfl:py-10 pfl:text-center pfl:text-sm pfl:text-muted-foreground'}>{items.length ? 'Nothing in the trash matches.' : 'The trash is empty.'}</p>
                ) : (
                    shown.map((item) => {
                        const icon = fileIcon(item.name, item.directory);

                        return (
                            <div key={item.id} className={cn('pfl:grid pfl:grid-cols-[2rem_minmax(0,1fr)_5rem_7rem_6rem_7.5rem] pfl:items-center pfl:gap-2 pfl:border-b pfl:border-border/50 pfl:px-3 pfl:py-1.5 pfl:text-sm', selected.has(item.id) && 'pfl:bg-primary/10')}>
                                <Checkbox checked={selected.has(item.id)} onChange={(checked) => setSelected((current) => new Set(checked ? [...current, item.id] : [...current].filter((id) => id !== item.id)))} />
                                <span className={'pfl:flex pfl:min-w-0 pfl:items-center pfl:gap-2'}>
                                    <NamedIcon name={icon.icon} size={15} className={cn('pfl:shrink-0', icon.colour)} />
                                    <span className={'pfl:truncate pfl:font-mono pfl:text-xs'} title={item.path}>
                                        {item.path}
                                    </span>
                                    {item.by && <span className={'pfl:shrink-0 pfl:rounded pfl:bg-muted pfl:px-1.5 pfl:text-[10px] pfl:text-muted-foreground'}>{item.by}</span>}
                                </span>
                                <span className={'pfl:text-right pfl:text-xs pfl:text-muted-foreground'}>{item.directory ? '—' : bytesToString(item.size)}</span>
                                <span className={'pfl:hidden pfl:text-xs pfl:text-muted-foreground pfl:sm:block'}>{fromNow(item.deletedAt)}</span>
                                <span className={'pfl:hidden pfl:items-center pfl:gap-1 pfl:text-xs pfl:text-muted-foreground pfl:sm:flex'}>
                                    <NamedIcon name={'clock'} size={11} /> {expires(item)}
                                </span>
                                <span className={'pfl:flex pfl:justify-end pfl:gap-1'}>
                                    {permissions.create && (
                                        <Button size={'xsmall'} isSecondary disabled={busy} onClick={() => restore([item.id], 'skip')}>
                                            <NamedIcon name={'rotate-ccw'} size={12} /> Restore
                                        </Button>
                                    )}
                                    {permissions.remove && (
                                        <button
                                            type={'button'}
                                            disabled={busy}
                                            onClick={() => run(async () => (await purgeTrash(server, [item.id]), await refresh()))}
                                            aria-label={`Delete ${item.name} for good`}
                                            title={'Delete for good'}
                                            className={'pfl:flex pfl:size-6 pfl:items-center pfl:justify-center pfl:rounded pfl:text-muted-foreground pfl:cursor-pointer pfl:hover:bg-muted pfl:hover:text-destructive'}
                                        >
                                            <NamedIcon name={'x'} size={13} />
                                        </button>
                                    )}
                                </span>
                            </div>
                        );
                    })
                )}
            </div>

            {selected.size > 0 && (
                <div className={'pfl:sticky pfl:bottom-4 pfl:mx-auto pfl:flex pfl:items-center pfl:gap-2 pfl:rounded-full pfl:border pfl:border-border pfl:bg-card pfl:px-4 pfl:py-2 pfl:shadow-2xl'}>
                    <span className={'pfl:text-sm'}>{selected.size} selected</span>
                    {permissions.create && (
                        <Button size={'small'} disabled={busy} onClick={() => restore([...selected], 'skip')}>
                            Restore
                        </Button>
                    )}
                    {permissions.remove && (
                        <Button.Danger size={'small'} disabled={busy} onClick={() => run(async () => (await purgeTrash(server, [...selected]), setSelected(new Set()), await refresh()))}>
                            Delete for good
                        </Button.Danger>
                    )}
                </div>
            )}

            {conflicts && (
                <Dialog open onClose={() => setConflicts(null)} title={'Something is already there'}>
                    <p className={'pfl:text-sm'}>These could not be restored because a file or folder with the same name is in the way:</p>
                    <ul className={'pfl:my-2 pfl:max-h-40 pfl:overflow-y-auto pfl:font-mono pfl:text-xs'}>
                        {conflicts.paths.map((path) => (
                            <li key={path}>{path}</li>
                        ))}
                    </ul>
                    <Alert type={'info'}>Keep both restores beside it with &quot;(restored)&quot; in the name. Replace deletes what is there now.</Alert>
                    <Dialog.Footer>
                        <Button.Text onClick={() => setConflicts(null)}>Leave them</Button.Text>
                        <Button isSecondary onClick={() => restore(conflicts.ids, 'rename')}>
                            Keep both
                        </Button>
                        <Button.Danger onClick={() => restore(conflicts.ids, 'replace')}>Replace</Button.Danger>
                    </Dialog.Footer>
                </Dialog>
            )}

            <Dialog.Confirm
                open={confirmEmpty}
                onClose={() => setConfirmEmpty(false)}
                title={'Empty the trash?'}
                confirm={'Empty trash'}
                onConfirmed={() => run(async () => (setConfirmEmpty(false), await emptyTrash(server), await refresh(), toast.success('The trash is empty.')))}
            >
                {items.length} items ({bytesToString(total)}) are deleted for good.
            </Dialog.Confirm>
        </div>
    );
}
