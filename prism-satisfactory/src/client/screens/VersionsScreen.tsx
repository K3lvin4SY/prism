import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Checkbox, Dialog, ServerContentBlock, Spinner, cn, formatDate, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { branchName, getVersions, installBranch, type Branch, type VersionsOverview } from '../api/versions';
import JobProgress from '../components/JobProgress';
import { useSatisfactoryInfo } from '../hooks/useSatisfactoryInfo';
import { NamedIcon } from '../icons';

export default function VersionsScreen() {
    const { identifier } = useSatisfactoryInfo();
    const queryClient = useQueryClient();
    const overview = useQuery({ queryKey: keys.versions(identifier), queryFn: () => getVersions(identifier) });
    const [job, setJob] = useState<string | null>(null);
    const [selected, setSelected] = useState<Branch | null>(null);

    const finished = useCallback(
        (status: 'completed' | 'failed') => {
            void queryClient.invalidateQueries({ queryKey: ['prism-satisfactory', identifier] });
            if (status === 'completed') toast.success('Done. The server downloads the build as it starts; the console shows how it goes.');
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
    const waiting = data.chosen !== data.installed.branch;

    return (
        <ServerContentBlock title={'Versions'}>
            <div className={'sfy:flex sfy:flex-col sfy:gap-4'}>
                {activeJob && <JobProgress key={activeJob} job={activeJob} onFinished={finished} />}

                <div className={'pt-surface sfy:flex sfy:flex-wrap sfy:items-center sfy:gap-4 sfy:rounded-md sfy:border sfy:border-border sfy:bg-card sfy:p-4'}>
                    <span className={'sfy:flex sfy:size-12 sfy:items-center sfy:justify-center sfy:rounded-lg sfy:bg-primary/15 sfy:text-primary'}>
                        <NamedIcon name={'factory'} size={22} />
                    </span>
                    <div className={'sfy:min-w-0 sfy:flex-1'}>
                        <p className={'sfy:text-lg sfy:font-semibold'}>
                            Satisfactory {branchName(data.installed.branch).toLowerCase()} build {data.installed.changelist ? <span className={'sfy:text-muted-foreground'}>(CL {data.installed.changelist})</span> : null}
                        </p>
                        <p className={'sfy:text-xs sfy:text-muted-foreground'}>
                            {data.installed.build ? `Steam build ${data.installed.build}` : 'Build not known yet'}
                            {' · '}
                            {data.autoUpdate ? 'updates itself on start' : 'automatic updates are off'}
                        </p>
                    </div>
                    {data.update && (
                        <Button onClick={() => setSelected(data.branches.find((branch) => branch.id === data.chosen) ?? null)}>
                            <NamedIcon name={'arrow-up'} size={16} className={'sfy:mr-1'} /> Update now
                        </Button>
                    )}
                </div>

                {waiting && <Alert type={'info'}>The server switches to the {branchName(data.chosen).toLowerCase()} build the next time it starts.</Alert>}

                <div className={'sfy:grid sfy:gap-2 sfy:sm:grid-cols-2'}>
                    {data.branches.map((branch) => {
                        const current = branch.id === data.installed.branch;

                        return (
                            <button
                                key={branch.id}
                                type={'button'}
                                onClick={() => setSelected(branch)}
                                className={cn(
                                    'pt-surface sfy:flex sfy:flex-col sfy:gap-1 sfy:rounded-md sfy:border sfy:bg-card sfy:p-3 sfy:text-left sfy:cursor-pointer sfy:hover:border-primary',
                                    current ? 'sfy:border-primary' : 'sfy:border-border'
                                )}
                            >
                                <div className={'sfy:flex sfy:flex-wrap sfy:items-center sfy:gap-2'}>
                                    <span className={'sfy:font-semibold'}>{branchName(branch.id)}</span>
                                    <Badge size={'sm'} tone={branch.id === 'public' ? 'success' : 'warning'}>
                                        {branch.id === 'public' ? 'Stable' : 'Testing'}
                                    </Badge>
                                    {current && (
                                        <Badge size={'sm'} tone={'info'}>
                                            Installed
                                        </Badge>
                                    )}
                                </div>
                                <span className={'sfy:text-xs sfy:text-muted-foreground'}>
                                    {branch.description ?? (branch.id === 'public' ? 'The release everyone plays' : 'Coffee Stain’s next update, before it is released')}
                                    {branch.build ? ` · build ${branch.build}` : ''}
                                    {branch.updated ? ` · ${formatDate(new Date(branch.updated * 1000).toISOString(), 'MMM D, YYYY')}` : ''}
                                </span>
                            </button>
                        );
                    })}
                </div>
                <p className={'sfy:text-xs sfy:text-muted-foreground'}>Players need the same build as the server, on the same branch in Steam or Epic.</p>
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
    const [start, setStart] = useState(true);
    const [busy, setBusy] = useState(false);
    const leavingExperimental = overview.installed.branch === 'experimental' && branch.id === 'public';

    const go = async () => {
        setBusy(true);
        try {
            onStarted(await installBranch(identifier, branch.id, { start }));
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} title={`Install the ${branchName(branch.id).toLowerCase()} build?`}>
            <div className={'sfy:flex sfy:flex-col sfy:gap-3 sfy:text-sm'}>
                <p>The server stops, and downloads the {branchName(branch.id).toLowerCase()} build from Steam as it starts again. That can take a few minutes; the console shows how it goes.</p>
                {leavingExperimental && <Alert type={'warning'}>A game saved on the experimental build may not load on the public one until the public build catches up.</Alert>}
                {!overview.running && (
                    <label className={'sfy:flex sfy:items-center sfy:gap-2'}>
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
