import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NamedIcon, Spinner, cn, httpErrorToHuman, useCurrentServerRequired } from '@pterodactyl/sdk';
import { api, keys } from '../api';
import { Check, bytes } from './ui';

/**
 * The server's files with tick boxes, each folder loaded when it is opened. `ticked` holds clean
 * relative paths; anything inside a ticked folder shows ticked too.
 */
export default function ServerTree({ ticked, onToggle }: { ticked: ReadonlySet<string>; onToggle: (path: string, directory: boolean, on: boolean) => void }) {
    return (
        <div className={'pbk:max-h-[26rem] pbk:min-h-48 pbk:overflow-auto pbk:rounded-md pbk:border pbk:border-border pbk:py-1'}>
            <Folder path={''} depth={0} ticked={ticked} inherited={false} onToggle={onToggle} />
        </div>
    );
}

function Folder({ path, depth, ticked, inherited, onToggle }: { path: string; depth: number; ticked: ReadonlySet<string>; inherited: boolean; onToggle: (path: string, directory: boolean, on: boolean) => void }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const listing = useQuery({ queryKey: keys.directory(identifier, path), queryFn: () => api.directory(identifier, path), staleTime: 30_000 });
    const [open, setOpen] = useState<Set<string>>(new Set());

    if (listing.isLoading) {
        return (
            <div style={{ paddingLeft: 12 + depth * 18 }} className={'pbk:py-1.5'}>
                <Spinner size={'small'} />
            </div>
        );
    }

    if (listing.isError) return <p className={'pbk:px-3 pbk:py-1.5 pbk:text-xs pbk:text-destructive'}>{httpErrorToHuman(listing.error)}</p>;
    if (!listing.data?.length) return <p style={{ paddingLeft: 12 + depth * 18 }} className={'pbk:py-1.5 pbk:text-xs pbk:text-muted-foreground'}>Empty</p>;

    return (
        <>
            {listing.data.map((entry) => {
                const child = path === '' ? entry.name : `${path}/${entry.name}`;
                const own = ticked.has(child);
                const isOpen = open.has(child);
                const some = !own && [...ticked].some((pick) => pick.startsWith(`${child}/`));

                return (
                    <div key={child}>
                        <div className={cn('pbk:flex pbk:items-center pbk:gap-2 pbk:py-1 pbk:pr-3 pbk:text-sm', (own || inherited) && 'pbk:bg-primary/5')} style={{ paddingLeft: 12 + depth * 18 }}>
                            <Check checked={own || inherited} partial={some} disabled={inherited} onChange={(on) => onToggle(child, !entry.file, on)} label={`Pick ${child}`} />
                            <button
                                type={'button'}
                                className={cn('pbk:flex pbk:min-w-0 pbk:flex-1 pbk:items-center pbk:gap-1.5 pbk:text-left', !entry.file && 'pbk:cursor-pointer')}
                                onClick={() =>
                                    !entry.file &&
                                    setOpen((current) => {
                                        const next = new Set(current);
                                        next.has(child) ? next.delete(child) : next.add(child);

                                        return next;
                                    })
                                }
                            >
                                {entry.file ? <span className={'pbk:w-[13px] pbk:shrink-0'} /> : <NamedIcon name={isOpen ? 'chevron-down' : 'chevron-right'} size={13} className={'pbk:shrink-0 pbk:text-muted-foreground'} />}
                                <NamedIcon name={entry.file ? 'file' : 'folder'} size={14} className={cn('pbk:shrink-0', entry.file ? 'pbk:text-muted-foreground' : 'pbk:text-primary')} />
                                <span className={'pbk:truncate'}>{entry.name}</span>
                            </button>
                            {entry.file && <span className={'pbk:shrink-0 pbk:text-xs pbk:text-muted-foreground'}>{bytes(entry.size)}</span>}
                        </div>
                        {!entry.file && isOpen && <Folder path={child} depth={depth + 1} ticked={ticked} inherited={own || inherited} onToggle={onToggle} />}
                    </div>
                );
            })}
        </>
    );
}
