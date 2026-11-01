import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Checkbox, Spinner, httpErrorToHuman } from '@pterodactyl/sdk';
import { listFolder } from '../api';
import { NamedIcon } from '../icons';
import { addPath, coveredBy, crumbs } from '../lib/paths';

/**
 * The folders and files a link shares, picked in place: the server's folders on top, where a
 * checkbox shares a folder or file and a folder's name opens it, and what is shared as chips below
 * (below, so ticking never moves the list). A shared folder shares everything in it, so what it
 * covers shows ticked. Symlinks are not offered.
 */
export default function FileChooser({ server, paths, disabled, onChange }: { server: string; paths: string[]; disabled?: boolean; onChange: (paths: string[]) => void }) {
    const [directory, setDirectory] = useState(paths.length === 1 && paths[0] !== '/' ? paths[0].replace(/\/[^/]+$/, '') || '/' : '/');
    const query = useQuery({ queryKey: ['prism-share', server, 'folder', directory], queryFn: () => listFolder(server, directory) });

    const toggle = (path: string, on: boolean) => onChange(on ? addPath(paths, path) : paths.filter((shared) => shared !== path));
    const here = coveredBy(paths, directory);

    return (
        <div className={'psh:flex psh:flex-col psh:gap-2'}>
            <div className={'psh:overflow-hidden psh:rounded-lg psh:border psh:border-border psh:bg-background/40'}>
                <nav aria-label={'Folder'} className={'psh:flex psh:items-center psh:gap-0.5 psh:overflow-x-auto psh:border-b psh:border-border psh:px-2 psh:py-1.5 psh:font-mono psh:text-xs'}>
                    {crumbs(directory).map((crumb, index, all) => (
                        <span key={crumb.path} className={'psh:flex psh:shrink-0 psh:items-center psh:gap-0.5'}>
                            {index > 1 && <NamedIcon name={'chevron-right'} size={12} className={'psh:text-muted-foreground'} />}
                            <button
                                type={'button'}
                                onClick={() => setDirectory(crumb.path)}
                                className={'psh:cursor-pointer psh:rounded psh:px-1 psh:py-0.5 psh:hover:bg-muted ' + (index === all.length - 1 ? 'psh:text-foreground' : 'psh:text-muted-foreground')}
                            >
                                {crumb.name}
                            </button>
                        </span>
                    ))}
                </nav>

                <label className={'psh:flex psh:cursor-pointer psh:items-center psh:gap-2 psh:border-b psh:border-border psh:px-3 psh:py-2 psh:text-sm'}>
                    <Checkbox checked={here !== null} disabled={disabled || (here !== null && here !== directory)} onChange={(on) => toggle(directory, on)} />
                    <NamedIcon name={'folder-open'} size={14} className={'psh:text-primary'} />
                    <span className={'psh:min-w-0 psh:flex-1 psh:truncate'}>
                        Everything in <code>{directory}</code>
                    </span>
                    {here !== null && here !== directory && <span className={'psh:text-xs psh:text-muted-foreground'}>in {here}</span>}
                </label>
                {directory === '/' && <p className={'psh:border-b psh:border-border psh:px-3 psh:py-2 psh:text-xs psh:text-warning'}>Sharing everything shares the whole server, config files and their passwords too. Pick a folder inside it if you can.</p>}

                <div className={'psh:flex psh:max-h-80 psh:flex-col psh:overflow-y-auto psh:py-1'}>
                    {query.isLoading && (
                        <div className={'psh:flex psh:justify-center psh:py-4'}>
                            <Spinner size={'small'} />
                        </div>
                    )}
                    {query.isError && (
                        <div className={'psh:p-2'}>
                            <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>
                        </div>
                    )}
                    {query.data?.length === 0 && <p className={'psh:py-3 psh:text-center psh:text-xs psh:text-muted-foreground'}>This folder is empty.</p>}
                    {query.data?.map((entry) => {
                        const by = coveredBy(paths, entry.path);

                        return (
                            <div key={entry.path} className={'psh:flex psh:items-center psh:gap-2 psh:px-3 psh:py-1 psh:text-sm psh:hover:bg-muted/50'}>
                                <Checkbox aria-label={`Share ${entry.name}`} checked={by !== null} disabled={disabled || (by !== null && by !== entry.path)} onChange={(on) => toggle(entry.path, on)} />
                                {entry.directory ? (
                                    <button type={'button'} onClick={() => setDirectory(entry.path)} className={'psh:flex psh:min-w-0 psh:flex-1 psh:cursor-pointer psh:items-center psh:gap-2 psh:text-left'}>
                                        <NamedIcon name={'folder'} size={14} className={'psh:shrink-0 psh:text-primary'} />
                                        <span className={'psh:truncate'}>{entry.name}</span>
                                        <NamedIcon name={'chevron-right'} size={14} className={'psh:ml-auto psh:shrink-0 psh:text-muted-foreground'} />
                                    </button>
                                ) : (
                                    <button
                                        type={'button'}
                                        tabIndex={-1}
                                        disabled={disabled || (by !== null && by !== entry.path)}
                                        onClick={() => toggle(entry.path, by === null)}
                                        className={'psh:flex psh:min-w-0 psh:flex-1 psh:cursor-pointer psh:items-center psh:gap-2 psh:text-left psh:disabled:cursor-default'}
                                    >
                                        <NamedIcon name={'file'} size={14} className={'psh:shrink-0 psh:text-muted-foreground'} />
                                        <span className={'psh:truncate'}>{entry.name}</span>
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            {paths.length > 0 && (
                <div className={'psh:flex psh:max-h-28 psh:flex-wrap psh:gap-1.5 psh:overflow-y-auto'}>
                    {paths.map((path) => (
                        <span key={path} className={'psh:inline-flex psh:max-w-full psh:items-center psh:gap-1.5 psh:rounded-md psh:bg-primary/15 psh:py-0.5 psh:pr-1 psh:pl-2 psh:text-xs psh:text-primary'}>
                            <NamedIcon name={path === '/' || !/\.[^/]+$/.test(path) ? 'folder' : 'file'} size={12} />
                            <code className={'psh:truncate'}>{path}</code>
                            <button
                                type={'button'}
                                disabled={disabled}
                                aria-label={`Stop sharing ${path}`}
                                onClick={() => toggle(path, false)}
                                className={'psh:cursor-pointer psh:rounded psh:p-0.5 psh:hover:bg-primary/20 psh:disabled:cursor-default'}
                            >
                                <NamedIcon name={'x'} size={12} />
                            </button>
                        </span>
                    ))}
                    <span className={'psh:self-center psh:text-xs psh:text-muted-foreground'}>
                        {paths.length} shared
                    </span>
                </div>
            )}
        </div>
    );
}
