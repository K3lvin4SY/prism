import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Dialog, Spinner, httpErrorToHuman } from '@pterodactyl/sdk';
import { listFolder } from '../api';
import { NamedIcon } from '../icons';

/** Picks a folder or a file of the server to share. Symlinks are not offered. */
export default function FolderPicker({ server, onPick, onClose }: { server: string; onPick: (path: string) => void; onClose: () => void }) {
    const [directory, setDirectory] = useState('/');
    const query = useQuery({ queryKey: ['prism-share', server, 'folder', directory], queryFn: () => listFolder(server, directory) });
    const up = directory === '/' ? null : directory.replace(/\/[^/]+$/, '') || '/';

    return (
        <Dialog open onClose={onClose} title={'Pick a folder or file'} description={'Everything inside a shared folder can be downloaded.'}>
            <div className={'psh:flex psh:flex-col psh:gap-2'}>
                <div className={'psh:flex psh:items-center psh:gap-2 psh:text-sm'}>
                    {up !== null && (
                        <Button.Text size={'small'} aria-label={'Up a folder'} onClick={() => setDirectory(up)}>
                            <NamedIcon name={'chevron-left'} size={14} />
                        </Button.Text>
                    )}
                    <code className={'psh:min-w-0 psh:flex-1 psh:truncate'}>{directory}</code>
                    <Button size={'small'} onClick={() => onPick(directory)}>
                        Share this folder
                    </Button>
                </div>

                {directory === '/' && <p className={'psh:text-xs psh:text-warning'}>Sharing this folder shares the whole server, config files and their passwords too. Pick a folder inside it if you can.</p>}

                {query.isLoading && (
                    <div className={'psh:flex psh:justify-center psh:py-6'}>
                        <Spinner />
                    </div>
                )}
                {query.isError && <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>}
                <div className={'psh:flex psh:max-h-80 psh:flex-col psh:overflow-y-auto'}>
                    {query.data?.length === 0 && <p className={'psh:py-4 psh:text-center psh:text-sm psh:text-muted-foreground'}>This folder is empty.</p>}
                    {query.data?.map((entry) => (
                        <button
                            key={entry.path}
                            type={'button'}
                            onClick={() => (entry.directory ? setDirectory(entry.path) : onPick(entry.path))}
                            className={'psh:flex psh:cursor-pointer psh:items-center psh:gap-2 psh:rounded psh:px-2 psh:py-1.5 psh:text-left psh:text-sm psh:hover:bg-muted'}
                        >
                            <NamedIcon name={entry.directory ? 'folder' : 'file'} size={14} />
                            <span className={'psh:min-w-0 psh:flex-1 psh:truncate'}>{entry.name}</span>
                            {!entry.directory && <span className={'psh:text-xs psh:text-muted-foreground'}>Share file</span>}
                        </button>
                    ))}
                </div>
            </div>
        </Dialog>
    );
}
