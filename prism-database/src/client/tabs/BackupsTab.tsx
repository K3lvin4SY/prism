import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Dialog, Input, Spinner, Switch, bytesToString, fromNow, httpErrorToHuman, toast, useCurrentServerRequired, useServerPermission } from '@pterodactyl/sdk';
import { api, keys, type DatabaseFile, type PrismDatabase } from '../api';
import { Pills, Section } from '../components/ui';
import { getConfig } from '../config';
import FileRow from './FileRow';

const INTERVALS = [
    { value: 'hourly', label: 'Hourly', hours: 1 },
    { value: '6h', label: '6 h', hours: 6 },
    { value: '12h', label: '12 h', hours: 12 },
    { value: 'daily', label: 'Daily', hours: 24 },
    { value: 'weekly', label: 'Weekly', hours: 168 },
];

/** Back up now with a label, or on a schedule; lock, restore, download and delete. */
export default function BackupsTab({ database }: { database: PrismDatabase }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const config = getConfig();
    const canUpdate = useServerPermission('database.update');
    const canDelete = useServerPermission('database.delete');
    const files = useQuery({
        queryKey: keys.files(identifier, database.id),
        queryFn: () => api.files(identifier, database.id),
        refetchInterval: (query) => (query.state.data && [...query.state.data.backups, ...query.state.data.transfers].some((file) => file.status === 'running' || file.status === 'pending') ? 2000 : false),
    });
    const [label, setLabel] = useState('');
    const [busy, setBusy] = useState(false);
    const [schedule, setSchedule] = useState<{ enabled: boolean; interval: string; keep: number } | null>(null);
    const [restoring, setRestoring] = useState<DatabaseFile | null>(null);
    const [deleting, setDeleting] = useState<DatabaseFile | null>(null);
    const fastest = INTERVALS.find((interval) => interval.value === config.backupFastest)?.hours ?? 1;

    useEffect(() => {
        if (files.data && !schedule) setSchedule(files.data.schedule);
    }, [files.data, schedule]);

    const act = async (action: () => Promise<unknown>, done: string) => {
        setBusy(true);
        try {
            await action();
            toast.success(done);
            await files.refetch();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    const saveSchedule = (next: { enabled: boolean; interval: string; keep: number }) => {
        setSchedule(next);
        void api.schedule(identifier, database.id, next).then(
            () => files.refetch(),
            (error) => toast.error(httpErrorToHuman(error))
        );
    };

    if (files.isLoading) return <Spinner centered />;
    if (files.isError || !files.data) return <Alert type={'danger'}>{httpErrorToHuman(files.error)}</Alert>;

    const backups = files.data.backups;
    const restore = files.data.transfers.find((file) => file.type === 'restore' && (file.status === 'running' || file.status === 'pending'));

    return (
        <div className={'pdb:flex pdb:flex-col pdb:gap-4'}>
            {restore && <FileRow database={database} file={restore} />}
            <div className={'pdb:grid pdb:gap-4 pdb:lg:grid-cols-2'}>
                <Section title={'Back up now'}>
                    <div className={'pdb:flex pdb:flex-col pdb:gap-3'}>
                        <label className={'pdb:flex pdb:flex-col pdb:gap-1 pdb:text-xs pdb:uppercase pdb:tracking-wide pdb:text-muted-foreground'}>
                            Label (optional)
                            <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={'Before the 1.21 update'} className={'pdb:normal-case pdb:tracking-normal'} />
                        </label>
                        <div className={'pdb:flex pdb:items-center pdb:gap-2'}>
                            <p className={'pdb:flex-1 pdb:text-xs pdb:text-muted-foreground'}>
                                {backups.length} backups · {bytesToString(files.data.storage)} kept on the panel
                            </p>
                            <Button disabled={!canUpdate} isLoading={busy} onClick={() => act(() => api.backup(identifier, database.id, label).then(() => setLabel('')), 'Backing up.')}>
                                Back up
                            </Button>
                        </div>
                    </div>
                </Section>

                <Section title={'Automatic backups'} actions={schedule && <Switch checked={schedule.enabled} disabled={!canUpdate} onChange={(enabled) => saveSchedule({ ...schedule, enabled })} aria-label={'Automatic backups'} />}>
                    {schedule && (
                        <div className={'pdb:flex pdb:flex-col pdb:gap-3'}>
                            <span className={'pdb:text-xs pdb:uppercase pdb:tracking-wide pdb:text-muted-foreground'}>Every</span>
                            <Pills size={'sm'} value={schedule.interval} onChange={(interval) => saveSchedule({ ...schedule, interval })} options={INTERVALS.map((interval) => ({ value: interval.value, label: interval.label, disabled: interval.hours < fastest || !canUpdate }))} />
                            <label className={'pdb:flex pdb:flex-col pdb:gap-1 pdb:text-sm'}>
                                <span>Keep the newest {schedule.keep}</span>
                                <input type={'range'} min={1} max={config.backupMaxKeep} value={schedule.keep} disabled={!canUpdate} onChange={(event) => setSchedule({ ...schedule, keep: Number(event.target.value) })} onMouseUp={() => saveSchedule(schedule)} onTouchEnd={() => saveSchedule(schedule)} style={{ accentColor: 'var(--color-primary)' }} />
                            </label>
                            <p className={'pdb:text-xs pdb:text-muted-foreground'}>
                                Older automatic and manual backups are removed. Locked backups are always kept.
                                {schedule.enabled && files.data.schedule.nextAt && ` Next backup ${fromNow(files.data.schedule.nextAt)}.`}
                                {!schedule.enabled && ' Turn it on to back up on a schedule.'}
                            </p>
                        </div>
                    )}
                </Section>
            </div>

            <Section title={'Backups'}>
                {backups.length === 0 ? (
                    <p className={'pdb:text-sm pdb:text-muted-foreground'}>No backups yet.</p>
                ) : (
                    <div className={'pdb:-mx-4 pdb:-my-4'}>
                        {backups.map((backup) => (
                            <FileRow
                                key={backup.id}
                                database={database}
                                file={backup}
                                actions={
                                    backup.status === 'done' &&
                                    canUpdate && (
                                        <>
                                            <Button size={'small'} isSecondary onClick={() => act(() => api.lock(identifier, database.id, backup.id, !backup.locked), backup.locked ? 'Unlocked.' : 'Locked.')}>
                                                {backup.locked ? 'Unlock' : 'Lock'}
                                            </Button>
                                            <Button.Danger size={'small'} onClick={() => setRestoring(backup)}>
                                                Restore
                                            </Button.Danger>
                                            {canDelete && (
                                                <Button.Danger size={'small'} isSecondary disabled={backup.locked} onClick={() => setDeleting(backup)}>
                                                    Delete
                                                </Button.Danger>
                                            )}
                                        </>
                                    )
                                }
                            />
                        ))}
                    </div>
                )}
            </Section>

            <Dialog.Confirm
                open={restoring !== null}
                onClose={() => setRestoring(null)}
                title={'Restore this backup?'}
                confirm={'Restore'}
                onConfirmed={() => {
                    const backup = restoring!;
                    setRestoring(null);
                    void act(() => api.restore(identifier, database.id, backup.id), 'Restoring.');
                }}
            >
                Every table in {database.name} is replaced with the backup from {restoring && fromNow(restoring.createdAt)}. Stop plugins using the database first.
            </Dialog.Confirm>
            <Dialog.Confirm
                open={deleting !== null}
                onClose={() => setDeleting(null)}
                title={'Delete this backup?'}
                confirm={'Delete'}
                onConfirmed={() => {
                    const backup = deleting!;
                    setDeleting(null);
                    void act(() => api.deleteFile(identifier, database.id, backup.id), 'Backup deleted.');
                }}
            >
                The backup is deleted for good.
            </Dialog.Confirm>
        </div>
    );
}
