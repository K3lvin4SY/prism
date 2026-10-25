import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Dialog, Input, Spinner, Switch, httpErrorToHuman, toast, useCurrentServerRequired } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { api, keys, type Job, type State } from '../api';
import EntryTree from '../components/EntryTree';
import { Progress, Section, bytes, copy, duration } from '../components/ui';
import { getConfig } from '../config';
import { buildTree, index, toggle, totals } from '../selection';
import type { Model } from '../views/BackupsView';

type Backup = Model['backups'][number];

const active = (job: Job | null | undefined): job is Job => !!job && (job.status === 'pending' || job.status === 'running');

export default function BackupDetail({ model, backup, state, onBack }: { model: Model; backup: Backup; state: State; onBack: () => void }) {
    const config = getConfig();
    const profile = state.meta[backup.uuid] ?? null;
    const took = duration(backup.createdAt, backup.completedAt);

    return (
        <div className={'pbk:flex pbk:flex-col pbk:gap-4'}>
            <div className={'pbk:flex pbk:flex-wrap pbk:items-center pbk:gap-3'}>
                <Button isSecondary size={'small'} onClick={onBack}>
                    <NamedIcon name={'arrow-left'} size={14} /> All backups
                </Button>
                <h2 className={'pbk:min-w-0 pbk:flex-1 pbk:truncate pbk:text-lg pbk:font-semibold'}>{backup.name}</h2>
                {backup.locked && (
                    <span className={'pbk:flex pbk:items-center pbk:gap-1 pbk:text-sm pbk:text-muted-foreground'}>
                        <NamedIcon name={'lock'} size={14} /> Locked
                    </span>
                )}
                {model.permissions.download && backup.successful && (
                    <Button isSecondary size={'small'} onClick={() => void model.actions.download(backup.uuid)}>
                        <NamedIcon name={'download'} size={14} /> Download
                    </Button>
                )}
            </div>

            <div className={'pbk:grid pbk:gap-3 pbk:sm:grid-cols-2 pbk:lg:grid-cols-4'}>
                <Fact label={'Size'} value={bytes(backup.bytes)} />
                <Fact label={'Made'} value={new Date(backup.createdAt).toLocaleString()} detail={took ? `took ${took}` : undefined} />
                <Fact label={'Profile'} value={profile ?? 'None'} detail={profile ? undefined : '.pteroignore or the panel\'s own'} />
                <Fact label={'Checksum'} value={backup.checksum ? <button type={'button'} className={'pbk:max-w-full pbk:cursor-pointer pbk:truncate pbk:font-mono pbk:text-sm'} title={'Copy'} onClick={() => copy(backup.checksum!, 'Checksum copied')}>{backup.checksum}</button> : 'None'} />
            </div>

            {model.permissions.restore && <RestoreAll model={model} backup={backup} />}
            {config.browse && model.permissions.download && <Browse model={model} backup={backup} />}
        </div>
    );
}

function Fact({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
    return (
        <div className={'pt-surface pbk:min-w-0 pbk:rounded-lg pbk:border pbk:border-border pbk:bg-card pbk:p-4'}>
            <p className={'pbk:text-xs pbk:uppercase pbk:tracking-wide pbk:text-muted-foreground'}>{label}</p>
            <div className={'pbk:mt-1 pbk:truncate pbk:font-semibold'}>{value}</div>
            {detail && <p className={'pbk:truncate pbk:text-xs pbk:text-muted-foreground'}>{detail}</p>}
        </div>
    );
}

function RestoreAll({ model, backup }: { model: Model; backup: Backup }) {
    const [truncate, setTruncate] = useState(false);
    const [asking, setAsking] = useState(false);

    return (
        <Section title={'Restore everything'}>
            <div className={'pbk:flex pbk:flex-wrap pbk:items-center pbk:gap-4'}>
                <div className={'pbk:min-w-64 pbk:flex-1'}>
                    <p className={'pbk:text-sm'}>Puts every file in this backup back on the server. The server is stopped first, and stays stopped until you start it.</p>
                    <div className={'pbk:mt-3'}>
                        <Switch checked={truncate} onChange={setTruncate} label={'Delete all files first'} description={'Files made since the backup are removed, so the server is exactly as it was.'} />
                    </div>
                </div>
                <Button.Danger disabled={!backup.successful} onClick={() => setAsking(true)}>
                    <NamedIcon name={'rotate-ccw'} size={14} /> Restore backup
                </Button.Danger>
            </div>
            {asking && (
                <Dialog.Confirm
                    open
                    title={`Restore ${backup.name}?`}
                    confirm={'Restore'}
                    pending={model.pending.restore}
                    onClose={() => setAsking(false)}
                    onConfirmed={async () => {
                        await model.actions.restore(backup.uuid, truncate);
                        setAsking(false);
                    }}
                >
                    The server stops, and its files are replaced with the backup&apos;s{truncate ? ' after every file on it is deleted' : ''}. This cannot be undone.
                </Dialog.Confirm>
            )}
        </Section>
    );
}

function Browse({ model, backup }: { model: Model; backup: Backup }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const queryClient = useQueryClient();
    const config = getConfig();
    const [opening, setOpening] = useState(false);
    const browse = useQuery({
        queryKey: keys.browse(identifier, backup.uuid),
        queryFn: () => api.browse(identifier, backup.uuid),
        refetchInterval: (query) => (active(query.state.data?.job) ? 1500 : false),
    });
    const tooBig = backup.bytes > config.browseMaxBytes;

    const open = async () => {
        setOpening(true);
        try {
            await api.open(identifier, backup.uuid);
            await browse.refetch();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setOpening(false);
        }
    };

    const job = browse.data?.job;

    return (
        <Section title={'Browse and restore files'}>
            {browse.isLoading ? (
                <Spinner centered />
            ) : browse.isError ? (
                <Alert type={'danger'}>{httpErrorToHuman(browse.error)}</Alert>
            ) : browse.data?.ready ? (
                <Picker model={model} backup={backup} entries={browse.data.entries} onRestored={() => void queryClient.invalidateQueries({ queryKey: keys.state(identifier) })} />
            ) : active(job) ? (
                <Progress value={job.progress} label={job.message ?? 'Starting'} />
            ) : (
                <div className={'pbk:flex pbk:flex-wrap pbk:items-center pbk:gap-4'}>
                    <p className={'pbk:min-w-64 pbk:flex-1 pbk:text-sm pbk:text-muted-foreground'}>
                        {tooBig
                            ? `This backup is larger than the ${bytes(config.browseMaxBytes)} the administrator allows to browse.`
                            : 'The panel downloads the backup once and lists what is in it. Then you can pick files and folders to put back.'}
                    </p>
                    {browse.data?.job?.status === 'failed' && <Alert type={'danger'}>{browse.data.job.message}</Alert>}
                    <Button isLoading={opening} disabled={tooBig || !backup.successful} onClick={open}>
                        <NamedIcon name={'folder-open'} size={14} /> Open backup
                    </Button>
                </div>
            )}
        </Section>
    );
}

function Picker({ model, backup, entries, onRestored }: { model: Model; backup: Backup; entries: { p: string; s: number; d: boolean }[]; onRestored: () => void }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const config = getConfig();
    const root = useMemo(() => buildTree(entries), [entries]);
    const nodes = useMemo(() => index(root), [root]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState('');
    const [where, setWhere] = useState<'original' | 'folder'>('folder');
    const [folder, setFolder] = useState(() => {
        const made = new Date(backup.createdAt);
        const two = (value: number) => String(value).padStart(2, '0');

        return `restored/${made.getFullYear()}-${two(made.getMonth() + 1)}-${two(made.getDate())}-${two(made.getHours())}${two(made.getMinutes())}`;
    });
    const [asking, setAsking] = useState(false);
    const [job, setJob] = useState<Job | null>(null);
    const picked = totals(selected, nodes);
    const canRestore = config.fileRestore && model.permissions.restore;
    const tooMuch = picked.size > config.restoreMaxBytes;
    const finished = job && !active(job) ? (job as Job) : null;

    // Follows the restore until it finishes.
    const restored = useRef(onRestored);
    restored.current = onRestored;
    const following = active(job) ? job.id : null;
    useEffect(() => {
        if (following === null) return;
        const timer = window.setInterval(async () => {
            try {
                const next: Job = await api.job(identifier, following);
                setJob(next);
                if (next.status === 'done' || next.status === 'failed') {
                    window.clearInterval(timer);
                    next.status === 'done' ? toast.success(next.message ?? 'Restored.') : toast.error(next.message ?? 'The restore failed.');
                    if (next.status === 'done') setSelected(new Set());
                    restored.current();
                }
            } catch {
                // Tried again on the next tick.
            }
        }, 1500);

        return () => window.clearInterval(timer);
    }, [following, identifier]);

    const restore = async () => {
        try {
            setJob(await api.restoreFiles(identifier, backup.uuid, [...selected], where === 'folder' ? folder : ''));
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setAsking(false);
        }
    };

    return (
        <div className={'pbk:flex pbk:flex-col pbk:gap-3'}>
            <div className={'pbk:flex pbk:flex-wrap pbk:items-center pbk:gap-3'}>
                <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={'Filter by name'} className={'pbk:max-w-xs'} />
                <span className={'pbk:flex-1 pbk:text-sm pbk:text-muted-foreground'}>
                    {root.files.toLocaleString()} files · {bytes(root.size)}
                </span>
                {selected.size > 0 && (
                    <Button.Text size={'small'} onClick={() => setSelected(new Set())}>
                        Clear picks
                    </Button.Text>
                )}
            </div>

            <EntryTree root={root} selected={selected} filter={filter} disabled={!canRestore || active(job)} onToggle={(path, on) => setSelected((current) => toggle(current, nodes, path, on))} />

            {active(job) ? (
                <Progress value={job.progress} label={job.message} />
            ) : canRestore ? (
                <div className={'pbk:flex pbk:flex-col pbk:gap-3 pbk:rounded-lg pbk:bg-muted/40 pbk:p-3'}>
                    <div className={'pbk:flex pbk:flex-wrap pbk:items-center pbk:gap-x-5 pbk:gap-y-2 pbk:text-sm'}>
                        <span className={'pbk:font-medium'}>Put them</span>
                        <label className={'pbk:flex pbk:cursor-pointer pbk:items-center pbk:gap-2'}>
                            <input type={'radio'} checked={where === 'folder'} onChange={() => setWhere('folder')} style={{ accentColor: 'var(--primary)' }} /> into a folder
                        </label>
                        <label className={'pbk:flex pbk:cursor-pointer pbk:items-center pbk:gap-2'}>
                            <input type={'radio'} checked={where === 'original'} onChange={() => setWhere('original')} style={{ accentColor: 'var(--primary)' }} /> where they were, replacing what is there
                        </label>
                    </div>
                    {where === 'folder' && <Input value={folder} onChange={(event) => setFolder(event.target.value)} className={'pbk:max-w-md pbk:font-mono'} aria-label={'Folder'} />}
                    <div className={'pbk:flex pbk:flex-wrap pbk:items-center pbk:gap-3'}>
                        <span className={'pbk:flex-1 pbk:text-sm'}>
                            {selected.size === 0 ? 'Tick the files and folders to restore.' : `${picked.files.toLocaleString()} ${picked.files === 1 ? 'file' : 'files'} picked · ${bytes(picked.size)}`}
                            {tooMuch && <span className={'pbk:text-destructive'}> · more than the {bytes(config.restoreMaxBytes)} allowed in one go</span>}
                        </span>
                        <Button disabled={selected.size === 0 || picked.files === 0 || tooMuch || (where === 'folder' && folder.trim() === '')} onClick={() => (where === 'original' ? setAsking(true) : void restore())}>
                            <NamedIcon name={'rotate-ccw'} size={14} /> Restore {picked.files === 1 ? 'file' : 'files'}
                        </Button>
                    </div>
                </div>
            ) : null}

            {finished && <Alert type={finished.status === 'done' ? 'success' : 'danger'}>{finished.message}</Alert>}

            {asking && (
                <Dialog.Confirm open title={'Replace files on the server?'} confirm={'Restore'} onClose={() => setAsking(false)} onConfirmed={restore}>
                    {picked.files.toLocaleString()} {picked.files === 1 ? 'file goes' : 'files go'} back where {picked.files === 1 ? 'it was' : 'they were'}. Files on the server with the same names are replaced.
                </Dialog.Confirm>
            )}
        </div>
    );
}
