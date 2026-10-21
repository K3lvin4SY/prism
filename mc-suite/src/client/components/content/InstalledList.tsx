import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Dialog, Input, Spinner, Switch, bytesToString, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { checkUpdates, contentKeys, getInstalled, identify, install, remove, setEnabled, type ContentKind, type InstalledFile } from '../../api/content';
import { useMcInfo } from '../../hooks/useMcInfo';
import JobProgress from '../JobProgress';
import { ProjectIcon } from './ProjectCard';

export default function InstalledList({ kind }: { kind: ContentKind }) {
    const { identifier } = useMcInfo();
    const queryClient = useQueryClient();
    const [filter, setFilter] = useState('');
    const [removing, setRemoving] = useState<InstalledFile | null>(null);
    const key = contentKeys.installed(identifier, kind);

    const installed = useQuery({
        queryKey: key,
        queryFn: () => getInstalled(identifier, kind),
        refetchInterval: (query) => (query.state.data?.files.some((file) => file.downloading) || query.state.data?.job ? 3000 : false),
    });
    const updates = useQuery({ queryKey: contentKeys.updates(identifier, kind), queryFn: () => checkUpdates(identifier, kind), enabled: false, staleTime: 300_000 });

    const refresh = () => queryClient.invalidateQueries({ queryKey: key });
    const fail = (error: unknown) => toast.error(httpErrorToHuman(error));

    const toggle = useMutation({ mutationFn: (file: InstalledFile) => setEnabled(identifier, kind, file.file, !file.enabled), onSuccess: refresh, onError: fail });
    const destroy = useMutation({
        mutationFn: (file: InstalledFile) => remove(identifier, kind, file.file),
        onSuccess: () => {
            setRemoving(null);
            refresh();
        },
        onError: fail,
    });
    const update = useMutation({
        mutationFn: (version: string) => install(identifier, kind, version, []),
        onSuccess: () => {
            toast.success('Downloading the update. Restart the server to load it.');
            refresh();
            updates.refetch();
        },
        onError: fail,
    });
    const identifyFiles = useMutation({
        mutationFn: () => identify(identifier, kind),
        onSuccess: (result) => {
            toast.success(result.identified > 0 ? `Recognised ${result.identified} of ${result.checked} files.` : 'No more files were recognised.');
            refresh();
        },
        onError: fail,
    });

    if (installed.isLoading) return <Spinner centered />;
    if (installed.isError || !installed.data) return <Alert type={'danger'}>{httpErrorToHuman(installed.error)}</Alert>;

    const term = filter.trim().toLowerCase();
    const files = installed.data.files.filter((file) => term === '' || file.file.toLowerCase().includes(term) || file.record?.title.toLowerCase().includes(term));
    const unknown = installed.data.files.filter((file) => !file.record).length;
    const updateCount = Object.keys(updates.data ?? {}).length;

    return (
        <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
            {installed.data.job && <JobProgress job={installed.data.job} onFinished={refresh} />}
            <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-2'}>
                <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={`Filter ${installed.data.files.length} ${kind}…`} className={'mcs:flex-1 mcs:min-w-48'} />
                <Button isSecondary isLoading={updates.isFetching} onClick={() => updates.refetch()}>
                    Check for updates
                </Button>
                {unknown > 0 && (
                    <Button isSecondary isLoading={identifyFiles.isPending} onClick={() => identifyFiles.mutate()}>
                        Recognise {unknown} files
                    </Button>
                )}
            </div>
            {updates.isError && <Alert type={'danger'}>{httpErrorToHuman(updates.error)}</Alert>}
            {updates.isSuccess && <p className={'mcs:text-sm mcs:text-muted-foreground'}>{updateCount === 0 ? 'Everything is up to date.' : `${updateCount} updates available.`}</p>}

            {files.length === 0 ? (
                <p className={'mcs:text-sm mcs:text-muted-foreground mcs:py-8 mcs:text-center'}>No {kind} installed.</p>
            ) : (
                <div className={'mcs:flex mcs:flex-col mcs:gap-2'}>
                    {files.map((file) => {
                        const available = updates.data?.[file.file];

                        return (
                            <div key={file.file} className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-3 mcs:rounded-md mcs:border mcs:border-border mcs:bg-card mcs:p-3'}>
                                <ProjectIcon src={file.record?.icon} className={'mcs:size-10 mcs:shrink-0'} />
                                <div className={'mcs:min-w-0 mcs:flex-1 mcs:basis-48'}>
                                    <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-2'}>
                                        <span className={'mcs:font-medium mcs:truncate'}>{file.record?.title ?? file.file}</span>
                                        {file.record?.versionNumber && <span className={'mcs:text-xs mcs:text-muted-foreground'}>{file.record.versionNumber}</span>}
                                        {file.downloading && (
                                            <Badge size={'sm'} tone={'info'}>
                                                Downloading
                                            </Badge>
                                        )}
                                        {!file.enabled && (
                                            <Badge size={'sm'} tone={'neutral'}>
                                                Disabled
                                            </Badge>
                                        )}
                                    </div>
                                    <p className={'mcs:text-xs mcs:text-muted-foreground mcs:truncate mcs:font-mono'}>
                                        {file.file}
                                        {file.size > 0 && ` · ${bytesToString(file.size)}`}
                                    </p>
                                </div>
                                {available && (
                                    <Button size={'small'} isLoading={update.isPending && update.variables === available.id} onClick={() => update.mutate(available.id)}>
                                        Update to {available.number}
                                    </Button>
                                )}
                                <Switch checked={file.enabled} disabled={file.downloading || toggle.isPending} onChange={() => toggle.mutate(file)} aria-label={file.enabled ? 'Disable' : 'Enable'} />
                                <Button.Danger size={'small'} isSecondary disabled={file.downloading} onClick={() => setRemoving(file)}>
                                    Remove
                                </Button.Danger>
                            </div>
                        );
                    })}
                </div>
            )}

            <Dialog.Confirm
                open={removing !== null}
                onClose={() => setRemoving(null)}
                title={`Remove ${removing?.record?.title ?? removing?.file ?? ''}?`}
                confirm={'Remove'}
                pending={destroy.isPending}
                onConfirmed={() => removing && destroy.mutate(removing)}
            >
                The file {removing?.file} is deleted from the {kind} folder. Its config folder is kept.
            </Dialog.Confirm>
        </div>
    );
}
