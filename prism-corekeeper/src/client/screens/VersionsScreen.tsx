import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Checkbox, Dialog, ServerContentBlock, Spinner, cn, formatDate, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { branchName, getVersions, installBranch, isOlder, type Branch, type VersionsOverview } from '../api/versions';
import JobProgress from '../components/JobProgress';
import { useCoreKeeperInfo } from '../hooks/useCoreKeeperInfo';
import { NamedIcon } from '../icons';

export default function VersionsScreen() {
    const { identifier } = useCoreKeeperInfo();
    const queryClient = useQueryClient();
    const overview = useQuery({ queryKey: keys.versions(identifier), queryFn: () => getVersions(identifier) });
    const [job, setJob] = useState<string | null>(null);
    const [selected, setSelected] = useState<Branch | null>(null);

    const finished = useCallback(
        (status: 'completed' | 'failed') => {
            void queryClient.invalidateQueries({ queryKey: ['prism-corekeeper', identifier] });
            if (status === 'completed') toast.success('Done. The server switches build as it starts; the console shows how it goes.');
        },
        [queryClient, identifier]
    );

    if (overview.isLoading) {
        return (
            <ServerContentBlock title={'Versions'}>
                <Spinner centered />
            </ServerContentBlock>
        );
    }

    if (overview.isError || !overview.data) {
        return (
            <ServerContentBlock title={'Versions'}>
                <Alert type={'danger'}>{httpErrorToHuman(overview.error)}</Alert>
            </ServerContentBlock>
        );
    }

    const data = overview.data;
    const activeJob = job ?? data.job;
    const installed = data.installed.branch;
    const waiting = data.chosen !== null && data.chosen !== installed;

    return (
        <ServerContentBlock title={'Versions'}>
            <div className={'cks:flex cks:flex-col cks:gap-4'}>
                {activeJob && <JobProgress key={activeJob} job={activeJob} onFinished={finished} />}
                {data.hookMissing && <Alert type={'warning'}>The startup command no longer runs Prism's start step, so a build change will not happen. Choose the build again to put it back.</Alert>}

                <div className={'pt-surface cks:flex cks:flex-wrap cks:items-center cks:gap-4 cks:rounded-md cks:border cks:border-border cks:bg-card cks:p-4'}>
                    <span className={'cks:flex cks:size-12 cks:items-center cks:justify-center cks:rounded-lg cks:bg-primary/15 cks:text-primary'}>
                        <NamedIcon name={'pickaxe'} size={22} />
                    </span>
                    <div className={'cks:min-w-0 cks:flex-1'}>
                        <p className={'cks:text-lg cks:font-semibold'}>
                            Core Keeper {data.installed.version ?? ''} {installed !== 'public' && <span className={'cks:text-muted-foreground'}>(legacy {installed})</span>}
                        </p>
                        <p className={'cks:text-xs cks:text-muted-foreground'}>
                            {data.installed.build ? `Steam build ${data.installed.build}` : 'Build not known yet'}
                            {' · '}
                            {data.autoUpdate ? 'updates itself on start' : 'automatic updates are off'}
                        </p>
                    </div>
                    {data.update && (
                        <Button onClick={() => setSelected(data.branches.find((branch) => branch.id === 'public') ?? null)}>
                            <NamedIcon name={'arrow-up'} size={16} className={'cks:mr-1'} /> Update now
                        </Button>
                    )}
                </div>

                {waiting && <Alert type={'info'}>The server switches to {branchName({ id: data.chosen! })} the next time it starts.</Alert>}

                <div className={'cks:grid cks:gap-2 cks:sm:grid-cols-2 cks:lg:grid-cols-3'}>
                    {data.branches.map((branch) => {
                        const current = branch.id === installed;

                        return (
                            <button
                                key={branch.id}
                                type={'button'}
                                onClick={() => setSelected(branch)}
                                className={cn(
                                    'pt-surface cks:flex cks:flex-col cks:gap-1 cks:rounded-md cks:border cks:bg-card cks:p-3 cks:text-left cks:cursor-pointer cks:hover:border-primary',
                                    current ? 'cks:border-primary' : 'cks:border-border'
                                )}
                            >
                                <div className={'cks:flex cks:flex-wrap cks:items-center cks:gap-2'}>
                                    <span className={'cks:font-semibold'}>{branchName(branch)}</span>
                                    <Badge size={'sm'} tone={branch.id === 'public' ? 'success' : 'neutral'}>
                                        {branch.id === 'public' ? 'Current' : 'Legacy'}
                                    </Badge>
                                    {current && (
                                        <Badge size={'sm'} tone={'info'}>
                                            Installed
                                        </Badge>
                                    )}
                                    {data.chosen === branch.id && !current && (
                                        <Badge size={'sm'} tone={'warning'}>
                                            Next start
                                        </Badge>
                                    )}
                                </div>
                                <span className={'cks:text-xs cks:text-muted-foreground'}>
                                    {branch.description ?? 'The newest Core Keeper build'}
                                    {branch.build ? ` · build ${branch.build}` : ''}
                                    {branch.updated ? ` · ${formatDate(new Date(branch.updated * 1000).toISOString(), 'MMM D, YYYY')}` : ''}
                                </span>
                            </button>
                        );
                    })}
                </div>
                <p className={'cks:text-xs cks:text-muted-foreground'}>Players need the same build as the server. Older builds are the ones Pugstorm keeps on Steam.</p>
            </div>

            {selected && (
                <InstallDialog
                    identifier={identifier}
                    overview={data}
                    branch={selected}
                    onClose={() => setSelected(null)}
                    onStarted={(started) => {
                        setSelected(null);
                        setJob(started);
                    }}
                />
            )}
        </ServerContentBlock>
    );
}

function InstallDialog({ identifier, overview, branch, onClose, onStarted }: { identifier: string; overview: VersionsOverview; branch: Branch; onClose: () => void; onStarted: (job: string) => void }) {
    const older = isOlder(branch.id, overview.installed.branch);
    const [backup, setBackup] = useState(older);
    const [start, setStart] = useState(true);
    const [busy, setBusy] = useState(false);

    const go = async () => {
        setBusy(true);
        try {
            onStarted(await installBranch(identifier, branch.id, { backup, start }));
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} title={branch.id === 'public' ? 'Install the latest build?' : `Install Core Keeper ${branch.id}?`}>
            <div className={'cks:flex cks:flex-col cks:gap-3 cks:text-sm'}>
                <p>
                    The server stops, and downloads {branchName(branch).toLowerCase() === 'latest' ? 'the latest build' : `the ${branch.id} build`} from Steam as it starts again. That can take a few minutes; the console shows how it goes.
                </p>
                {branch.id !== 'public' && <p className={'cks:text-muted-foreground'}>Automatic updates on start are turned off, or they would put the latest build back. Choosing Latest turns them on again.</p>}
                {older && <Alert type={'warning'}>A world saved by a newer build may not open in an older one. Keep a backup of the worlds.</Alert>}
                <label className={'cks:flex cks:items-center cks:gap-2'}>
                    <Checkbox checked={backup} onChange={setBackup} /> Back up the worlds first
                </label>
                {!overview.running && (
                    <label className={'cks:flex cks:items-center cks:gap-2'}>
                        <Checkbox checked={start} onChange={setStart} /> Start the server to install it now
                    </label>
                )}
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button isLoading={busy} onClick={() => void go()}>
                    Install
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
