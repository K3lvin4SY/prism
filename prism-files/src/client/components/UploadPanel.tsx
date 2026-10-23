import { NamedIcon, ProgressBar, bytesToString, cn } from '@pterodactyl/sdk';
import { useQueue, type UploadQueue } from '../lib/uploads';

/** The upload queue in the corner: progress, retry, cancel. */
export default function UploadPanel({ queue }: { queue: UploadQueue }) {
    const uploads = useQueue(queue);
    if (uploads.length === 0) return null;

    const active = uploads.filter((upload) => upload.status === 'uploading' || upload.status === 'queued');
    const total = uploads.reduce((sum, upload) => sum + upload.size, 0);
    const loaded = uploads.reduce((sum, upload) => sum + (upload.status === 'done' ? upload.size : upload.loaded), 0);

    return (
        <div className={'pfl:fixed pfl:bottom-4 pfl:right-4 pfl:z-40 pfl:w-[min(24rem,calc(100vw-2rem))] pfl:overflow-hidden pfl:rounded-lg pfl:border pfl:border-border pfl:bg-card pfl:shadow-2xl'}>
            <div className={'pfl:flex pfl:items-center pfl:gap-2 pfl:border-b pfl:border-border pfl:px-3 pfl:py-2 pfl:text-sm'}>
                <NamedIcon name={active.length ? 'upload' : 'circle-check'} size={15} className={active.length ? 'pfl:text-primary' : 'pfl:text-success'} />
                <span className={'pfl:flex-1 pfl:font-semibold'}>{active.length ? `Uploading ${active.length} of ${uploads.length}` : `${uploads.length} uploads finished`}</span>
                <span className={'pfl:text-xs pfl:text-muted-foreground'}>
                    {bytesToString(loaded)} / {bytesToString(total)}
                </span>
                {active.length === 0 && (
                    <button type={'button'} onClick={() => queue.clearFinished()} aria-label={'Close'} className={'pfl:cursor-pointer pfl:text-muted-foreground pfl:hover:text-foreground'}>
                        <NamedIcon name={'x'} size={14} />
                    </button>
                )}
            </div>
            <div className={'pfl:max-h-64 pfl:overflow-y-auto pfl:p-2'}>
                {uploads.map((upload) => (
                    <div key={upload.id} className={'pfl:flex pfl:flex-col pfl:gap-1 pfl:rounded-md pfl:px-2 pfl:py-1.5 pfl:text-xs'}>
                        <div className={'pfl:flex pfl:items-center pfl:gap-2'}>
                            <span className={cn('pfl:min-w-0 pfl:flex-1 pfl:truncate', upload.status === 'cancelled' && 'pfl:line-through pfl:opacity-60')} title={`${upload.directory}/${upload.name}`}>
                                {upload.name}
                            </span>
                            <span className={'pfl:text-muted-foreground'}>{bytesToString(upload.size)}</span>
                            {upload.status === 'failed' && (
                                <button type={'button'} onClick={() => queue.retry(upload.id)} className={'pfl:cursor-pointer pfl:text-primary pfl:hover:underline'}>
                                    Retry
                                </button>
                            )}
                            {(upload.status === 'uploading' || upload.status === 'queued') && (
                                <button type={'button'} onClick={() => queue.cancel(upload.id)} aria-label={'Cancel'} className={'pfl:cursor-pointer pfl:text-muted-foreground pfl:hover:text-destructive'}>
                                    <NamedIcon name={'x'} size={12} />
                                </button>
                            )}
                            {upload.status === 'done' && <NamedIcon name={'check'} size={12} className={'pfl:text-success'} />}
                        </div>
                        {upload.status === 'uploading' && <ProgressBar value={upload.size ? Math.round((upload.loaded / upload.size) * 100) : 0} />}
                        {upload.status === 'failed' && <span className={'pfl:text-destructive'}>{upload.error}</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}
