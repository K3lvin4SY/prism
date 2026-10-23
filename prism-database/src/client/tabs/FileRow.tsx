import { Badge, Button, ProgressBar, bytesToString, fromNow, httpErrorToHuman, toast, useCurrentServerRequired } from '@pterodactyl/sdk';
import { api, type DatabaseFile, type PrismDatabase } from '../api';

const STATUS: Record<DatabaseFile['status'], { label: string; tone: 'success' | 'danger' | 'info' | 'neutral' }> = {
    done: { label: 'Done', tone: 'success' },
    failed: { label: 'Failed', tone: 'danger' },
    running: { label: 'Running', tone: 'info' },
    pending: { label: 'Queued', tone: 'neutral' },
};

const TYPES: Record<DatabaseFile['type'], string> = { backup: 'Backup', export: 'Export', import: 'Import', restore: 'Restore' };

/** One backup, import or export, with its progress and actions. */
export default function FileRow({ database, file, actions }: { database: PrismDatabase; file: DatabaseFile; actions?: React.ReactNode }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const status = STATUS[file.status];
    const working = file.status === 'running' || file.status === 'pending';

    return (
        <div className={'pdb:flex pdb:flex-wrap pdb:items-center pdb:gap-3 pdb:border-b pdb:border-border/50 pdb:px-4 pdb:py-2.5 pdb:last:border-b-0'}>
            <Badge size={'sm'} tone={status.tone}>
                {status.label}
            </Badge>
            <div className={'pdb:min-w-0 pdb:flex-1 pdb:basis-56'}>
                <p className={'pdb:truncate pdb:text-sm'}>
                    <span className={'pdb:font-medium'}>{TYPES[file.type]}</span>
                    {file.label && <span className={'pdb:text-muted-foreground'}> · {file.label}</span>}
                    {file.locked && <span className={'pdb:text-amber-400'}> · Locked</span>}
                </p>
                <p className={'pdb:truncate pdb:text-xs pdb:text-muted-foreground'} title={file.message ?? undefined}>
                    {fromNow(file.createdAt)}
                    {file.size > 0 && ` · ${bytesToString(file.size)}`}
                    {file.message && ` · ${file.message}`}
                </p>
                {working && file.progress !== null && (
                    <div className={'pdb:mt-1 pdb:max-w-sm'}>
                        <ProgressBar value={Math.round(file.progress * 100)} />
                    </div>
                )}
            </div>
            {file.downloadable && (
                <Button
                    size={'small'}
                    isSecondary
                    onClick={() => api.download(identifier, database.id, file).catch((error) => toast.error(httpErrorToHuman(error)))}
                >
                    Download
                </Button>
            )}
            {actions}
        </div>
    );
}
