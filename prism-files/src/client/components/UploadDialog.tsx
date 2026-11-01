import { useRef, useState, type DragEvent } from 'react';
import { Button, Dialog, Input, bytesToString, cn, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { pull } from '../api';
import { getConfig } from '../config';
import { readDrop, type UploadQueue } from '../lib/uploads';

type Picked = { file: File; relative?: string }[];

/**
 * Everything that brings files into a folder in one place: a link the node downloads, and a drop
 * area for files or whole folders, with buttons that open the computer's own file picker.
 */
export default function UploadDialog({ server, directory, queue, onClose }: { server: string; directory: string; queue: UploadQueue; onClose: () => void }) {
    const config = getConfig();
    const [url, setUrl] = useState('');
    const [pulling, setPulling] = useState(false);
    const [over, setOver] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const folderInput = useRef<HTMLInputElement>(null);
    const urlError = url.trim() !== '' && !/^https?:\/\/\S+$/.test(url.trim()) ? 'Enter an http or https link.' : null;

    const send = (picked: Picked) => {
        if (picked.length === 0) return;
        const tooBig = picked.find(({ file }) => file.size > config.maxUploadBytes);
        if (tooBig) return void toast.error(`${tooBig.file.name} is larger than the ${bytesToString(config.maxUploadBytes)} upload limit.`);
        queue.add(picked, directory);
        onClose();
    };

    const download = async () => {
        if (urlError || url.trim() === '' || pulling) return;
        setPulling(true);
        try {
            await pull(server, url.trim(), directory);
            toast.success('The download started. Refresh in a moment to see the file.');
            onClose();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setPulling(false);
        }
    };

    const onDrop = async (event: DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        send(await readDrop(event.dataTransfer));
    };

    return (
        <Dialog open onClose={onClose} title={'Upload'} description={`Into ${directory}`}>
            <div className={'pfl:flex pfl:flex-col pfl:gap-4'}>
                <label className={'pfl:flex pfl:flex-col pfl:gap-1.5 pfl:text-sm'}>
                    Download from a link
                    <div className={'pfl:flex pfl:gap-2'}>
                        <div className={'pfl:relative pfl:flex-1'}>
                            <NamedIcon name={'link'} size={14} className={'pfl:pointer-events-none pfl:absolute pfl:left-2.5 pfl:top-1/2 pfl:-translate-y-1/2 pfl:text-muted-foreground'} />
                            <Input value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && download()} placeholder={'https://example.com/file.jar'} $hasError={!!urlError} className={'pfl:pl-8'} />
                        </div>
                        <Button isSecondary onClick={download} isLoading={pulling} disabled={!!urlError || url.trim() === ''}>
                            Download
                        </Button>
                    </div>
                    {urlError ? <span className={'pfl:text-xs pfl:text-destructive'}>{urlError}</span> : <span className={'pfl:text-xs pfl:text-muted-foreground'}>The node downloads it straight into this folder.</span>}
                </label>

                <div
                    onDragOver={(event) => {
                        if (!event.dataTransfer.types.includes('Files')) return;
                        event.preventDefault();
                        event.stopPropagation();
                        setOver(true);
                    }}
                    onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setOver(false)}
                    onDrop={onDrop}
                    className={cn(
                        'pfl:flex pfl:flex-col pfl:items-center pfl:gap-3 pfl:rounded-lg pfl:border-2 pfl:border-dashed pfl:px-4 pfl:py-8 pfl:text-center pfl:transition-colors',
                        over ? 'pfl:border-primary pfl:bg-primary/10' : 'pfl:border-border pfl:bg-muted/20'
                    )}
                >
                    <span className={'pfl:flex pfl:size-11 pfl:items-center pfl:justify-center pfl:rounded-full pfl:bg-muted pfl:text-muted-foreground'}>
                        <NamedIcon name={'upload'} size={20} />
                    </span>
                    <div className={'pfl:flex pfl:flex-col pfl:gap-0.5'}>
                        <span className={'pfl:text-sm pfl:font-medium'}>Drop files or folders here</span>
                        <span className={'pfl:text-xs pfl:text-muted-foreground'}>Or pick from your computer</span>
                    </div>
                    <div className={'pfl:flex pfl:gap-2'}>
                        <Button isSecondary size={'small'} onClick={() => fileInput.current?.click()}>
                            <NamedIcon name={'file'} size={14} /> File
                        </Button>
                        <Button isSecondary size={'small'} onClick={() => folderInput.current?.click()}>
                            <NamedIcon name={'folder'} size={14} /> Folder
                        </Button>
                    </div>
                    <span className={'pfl:text-xs pfl:text-muted-foreground'}>Up to {bytesToString(config.maxUploadBytes)} per file</span>
                </div>
                <input ref={fileInput} type={'file'} multiple hidden onChange={(event) => (send([...(event.target.files ?? [])].map((file) => ({ file }))), (event.target.value = ''))} />
                <input
                    ref={folderInput}
                    type={'file'}
                    hidden
                    {...({ webkitdirectory: '' } as object)}
                    onChange={(event) => (send([...(event.target.files ?? [])].map((file) => ({ file, relative: file.webkitRelativePath || undefined }))), (event.target.value = ''))}
                />
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Close</Button.Text>
            </Dialog.Footer>
        </Dialog>
    );
}
