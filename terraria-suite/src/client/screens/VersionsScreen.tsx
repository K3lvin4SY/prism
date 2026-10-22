import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    Badge,
    Button,
    Checkbox,
    Dialog,
    NamedIcon,
    Select,
    ServerContentBlock,
    Spinner,
    cn,
    formatDate,
    httpErrorToHuman,
    toast,
    useCurrentServerRequired,
    useSetServerDockerImage,
} from '@pterodactyl/sdk';
import { KIND_NAMES } from '../api/client';
import { getVersions, imageDotnet, installRelease, opensWorld, versionKeys, type Release, type VersionsOverview } from '../api/versions';
import JobProgress from '../components/JobProgress';
import { useTerrariaInfo } from '../hooks/useTerrariaInfo';

const ICONS: Record<string, string> = { vanilla: 'trees', tshock: 'shield', tmodloader: 'package' };

export default function VersionsScreen() {
    const { identifier } = useTerrariaInfo();
    const queryClient = useQueryClient();
    const overview = useQuery({ queryKey: versionKeys.overview(identifier), queryFn: () => getVersions(identifier) });
    const [job, setJob] = useState<string | null>(null);
    const [channel, setChannel] = useState<'all' | 'stable' | 'preview'>('stable');
    const [selected, setSelected] = useState<Release | null>(null);

    const finished = useCallback(
        (status: 'completed' | 'failed') => {
            queryClient.invalidateQueries({ queryKey: ['terraria-suite', identifier] });
            if (status === 'completed') toast.success('The new version is installed.');
        },
        [queryClient, identifier]
    );

    const releases = useMemo(() => (overview.data?.releases ?? []).filter((release) => channel === 'all' || release.channel === channel), [overview.data, channel]);

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
    const kind = data.info.kind ?? 'vanilla';
    const activeJob = job ?? data.job;
    const installedId = (release: Release) =>
        kind === 'vanilla' ? release.terraria === data.info.version : release.id.replace(/^v/, '') === data.info.build?.replace(/^v/, '');
    const hasPreviews = data.releases.some((release) => release.channel === 'preview');

    return (
        <ServerContentBlock title={'Versions'}>
            <div className={'trs:flex trs:flex-col trs:gap-4'}>
                {activeJob && <JobProgress key={activeJob} job={activeJob} onFinished={finished} />}

                <div className={'trs:flex trs:flex-wrap trs:items-center trs:gap-4 trs:rounded-md trs:border trs:border-border trs:bg-card trs:p-4'}>
                    <span className={'trs:flex trs:size-12 trs:items-center trs:justify-center trs:rounded-lg trs:bg-primary/15 trs:text-primary'}>
                        <NamedIcon name={ICONS[kind]} size={22} />
                    </span>
                    <div className={'trs:min-w-0 trs:flex-1'}>
                        <p className={'trs:text-lg trs:font-semibold'}>
                            {KIND_NAMES[kind]} {kind === 'vanilla' ? (data.info.version ?? '') : (data.info.build ?? '')}
                        </p>
                        <p className={'trs:text-xs trs:text-muted-foreground'}>
                            {data.info.version ? `Terraria ${data.info.version}` : 'Terraria version not known yet'}
                            {data.world.version !== null && ` · world saved as version ${data.world.version}${data.world.terraria ? ` (${data.world.terraria})` : ''}`}
                        </p>
                    </div>
                    {hasPreviews && (
                        <div className={'trs:w-44'}>
                            <Select
                                value={channel}
                                onChange={(value) => setChannel(value as typeof channel)}
                                options={[
                                    { value: 'stable', label: 'Stable' },
                                    { value: 'preview', label: 'Preview' },
                                    { value: 'all', label: 'All builds' },
                                ]}
                            />
                        </div>
                    )}
                </div>

                <div className={'trs:grid trs:gap-2 trs:sm:grid-cols-2 trs:lg:grid-cols-3'}>
                    {releases.map((release) => {
                        const installed = installedId(release);
                        const opens = opensWorld(release, data.world.version);

                        return (
                            <button
                                key={release.id}
                                type={'button'}
                                onClick={() => setSelected(release)}
                                className={cn(
                                    'trs:flex trs:flex-col trs:gap-1 trs:rounded-md trs:border trs:bg-card trs:p-3 trs:text-left trs:cursor-pointer trs:hover:border-primary',
                                    installed ? 'trs:border-primary' : 'trs:border-border'
                                )}
                            >
                                <div className={'trs:flex trs:flex-wrap trs:items-center trs:gap-2'}>
                                    <span className={'trs:font-semibold'}>{release.name}</span>
                                    <Badge size={'sm'} tone={release.channel === 'stable' ? 'success' : 'warning'}>
                                        {release.channel === 'stable' ? 'Stable' : 'Preview'}
                                    </Badge>
                                    {installed && (
                                        <Badge size={'sm'} tone={'info'}>
                                            Installed
                                        </Badge>
                                    )}
                                    {!opens && (
                                        <Badge size={'sm'} tone={'danger'}>
                                            Older world format
                                        </Badge>
                                    )}
                                </div>
                                <span className={'trs:text-xs trs:text-muted-foreground'}>
                                    {release.terraria ? `Terraria ${release.terraria}` : ''}
                                    {release.dotnet ? ` · .NET ${release.dotnet}` : ''}
                                    {release.published ? ` · ${formatDate(release.published, 'MMM D, YYYY')}` : ''}
                                </span>
                            </button>
                        );
                    })}
                    {releases.length === 0 && <p className={'trs:text-sm trs:text-muted-foreground'}>No builds in this channel.</p>}
                </div>
            </div>

            {selected && (
                <InstallDialog
                    identifier={identifier}
                    overview={data}
                    release={selected}
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

function InstallDialog({
    identifier,
    overview,
    release,
    onClose,
    onStarted,
}: {
    identifier: string;
    overview: VersionsOverview;
    release: Release;
    onClose: () => void;
    onStarted: (job: string) => void;
}) {
    const server = useCurrentServerRequired();
    const setImage = useSetServerDockerImage(server.attributes.uuid);
    const [start, setStart] = useState(true);
    const [newWorld, setNewWorld] = useState(false);
    const [keepBackup, setKeepBackup] = useState(true);
    const [busy, setBusy] = useState(false);

    const worldBlocked = !opensWorld(release, overview.world.version);
    const currentDotnet = imageDotnet(overview.dockerImage);
    const dotnetMismatch = release.dotnet !== null && currentDotnet !== null && currentDotnet < release.dotnet;
    const matchingImage = Object.entries(overview.dockerImages).find(([, image]) => imageDotnet(image) === release.dotnet);

    const install = async () => {
        setBusy(true);
        try {
            if (dotnetMismatch && matchingImage && overview.canChangeImage) {
                await setImage.mutateAsync({ image: matchingImage[1] });
            }

            onStarted(await installRelease(identifier, release.id, { start, ...(worldBlocked ? { newWorld, keepBackup } : {}) }));
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} title={`Install ${release.name}`} description={release.notes ?? undefined}>
            <div className={'trs:flex trs:flex-col trs:gap-3'}>
                <p className={'trs:text-sm trs:text-muted-foreground'}>
                    The server stops and the new build is installed. Worlds, settings{overview.info.kind === 'tmodloader' ? ', mods' : ''}
                    {overview.info.kind === 'tshock' ? ', plugins and the TShock database' : ''} are kept.
                </p>
                {release.channel === 'preview' && <Alert type={'warning'}>This is a preview build. Mods and plugins made for stable builds may not work with it.</Alert>}
                {dotnetMismatch && (
                    <Alert type={matchingImage && overview.canChangeImage ? 'info' : 'danger'}>
                        {release.name} needs .NET {release.dotnet}, but the server image has .NET {currentDotnet}.{' '}
                        {matchingImage && overview.canChangeImage
                            ? `The image will be switched to ${matchingImage[0]}.`
                            : `Ask an administrator to add the ghcr.io/ptero-eggs/yolks:dotnet_${release.dotnet} image to the egg, or the server will not start.`}
                    </Alert>
                )}
                {worldBlocked && (
                    <Alert type={'danger'}>
                        <div className={'trs:flex trs:flex-col trs:gap-2'}>
                            <span>
                                The world was saved by a newer Terraria{overview.world.terraria ? ` (${overview.world.terraria})` : ''} than {release.name} can open. The server
                                would not start with it.
                            </span>
                            <label className={'trs:flex trs:items-center trs:gap-2'}>
                                <Checkbox checked={newWorld} onChange={setNewWorld} /> Start a new world with this build
                            </label>
                            <label className={cn('trs:flex trs:items-center trs:gap-2 trs:pl-6', !newWorld && 'trs:opacity-50')}>
                                <Checkbox checked={keepBackup} disabled={!newWorld} onChange={setKeepBackup} /> Keep a backup of the current world
                            </label>
                            <span className={'trs:pl-6 trs:text-xs trs:opacity-80'}>
                                {keepBackup
                                    ? 'Its files are renamed to <name>-backup-<date> next to the new world.'
                                    : 'The current world is deleted once the new build is installed. This cannot be undone.'}
                            </span>
                        </div>
                    </Alert>
                )}
                <label className={'trs:flex trs:items-center trs:gap-2 trs:text-sm'}>
                    <Checkbox checked={start} onChange={setStart} /> Start the server when done
                </label>
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button isLoading={busy} disabled={worldBlocked && !newWorld} onClick={install}>
                    Install
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
