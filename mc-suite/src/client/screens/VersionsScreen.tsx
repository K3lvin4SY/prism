import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    Badge,
    Button,
    Checkbox,
    Dialog,
    Input,
    Select,
    ServerContentBlock,
    Spinner,
    TitledGreyBox,
    cn,
    formatDate,
    httpErrorToHuman,
    toast,
    useCurrentServerRequired,
    useSetServerDockerImage,
} from '@pterodactyl/sdk';
import { keys } from '../api/client';
import {
    getBedrockVersions,
    getBuilds,
    getOverview,
    getVersions,
    imageJava,
    installBedrock,
    opensWorld,
    installBuild,
    type BuildSummary,
    type SoftwareType,
    type VersionSummary,
} from '../api/versions';
import JobProgress from '../components/JobProgress';
import { useMcInfo } from '../hooks/useMcInfo';
import { allowSnapshots } from '../config';

const GROUP_LABELS: Record<string, string> = {
    recommended: 'Recommended',
    established: 'Established',
    experimental: 'Experimental',
    miscellaneous: 'Miscellaneous',
    limbos: 'Limbos',
};

export default function VersionsScreen() {
    const { identifier, info } = useMcInfo();
    const queryClient = useQueryClient();
    const overview = useQuery({ queryKey: keys.versions(identifier), queryFn: () => getOverview(identifier) });
    const [job, setJob] = useState<string | null>(null);
    const activeJob = job ?? overview.data?.job ?? null;

    const finished = useCallback(
        (status: 'completed' | 'failed') => {
            queryClient.invalidateQueries({ queryKey: ['mc-suite', identifier] });
            if (status === 'completed') toast.success('The new version is installed.');
        },
        [queryClient, identifier]
    );

    if (overview.isLoading || !info) {
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

    return (
        <ServerContentBlock title={'Versions'}>
            <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                {activeJob && <JobProgress key={activeJob} job={activeJob} onFinished={finished} />}
                {info.edition === 'bedrock' ? (
                    <BedrockVersions identifier={identifier} current={info.version} busy={activeJob !== null && job !== null} onStarted={setJob} />
                ) : (
                    <JavaVersions identifier={identifier} overview={overview.data} onStarted={setJob} />
                )}
            </div>
        </ServerContentBlock>
    );
}

function findType(groups: Record<string, Record<string, SoftwareType>> | null, type: string | null): SoftwareType | null {
    if (!groups || !type) return null;
    for (const group of Object.values(groups)) {
        if (group[type]) return group[type];
    }

    return null;
}

function JavaVersions({ identifier, overview, onStarted }: { identifier: string; overview: NonNullable<Awaited<ReturnType<typeof getOverview>>>; onStarted: (job: string) => void }) {
    const info = overview.info;
    const [type, setType] = useState<string>(info.mcjarsType ?? 'PAPER');
    const [search, setSearch] = useState('');
    const [channel, setChannel] = useState<'all' | 'RELEASE' | 'SNAPSHOT'>(allowSnapshots() ? 'all' : 'RELEASE');
    const [selected, setSelected] = useState<VersionSummary | null>(null);
    const [preselect, setPreselect] = useState<number | null>(null);

    const versions = useQuery({ queryKey: keys.versionList(identifier, type), queryFn: () => getVersions(identifier, type), staleTime: 300_000 });
    const currentVersions = useQuery({
        queryKey: keys.versionList(identifier, info.mcjarsType ?? ''),
        queryFn: () => getVersions(identifier, info.mcjarsType!),
        enabled: info.mcjarsType !== null,
        staleTime: 300_000,
    });

    const currentType = findType(overview.types, info.mcjarsType);
    const selectedType = findType(overview.types, type);

    const filtered = useMemo(
        () =>
            (versions.data ?? []).filter(
                (version) => (channel === 'all' || version.type === channel) && version.id.toLowerCase().includes(search.trim().toLowerCase())
            ),
        [versions.data, channel, search]
    );

    return (
        <>
            <CurrentCard
                overview={overview}
                type={currentType}
                versions={currentVersions.data ?? []}
                onPick={(version, build) => {
                    // Upgrades go through the builds dialog so the Java check and image switch apply.
                    setType(info.mcjarsType ?? type);
                    setPreselect(build);
                    setSelected(version);
                }}
            />

            <div className={'mcs:grid mcs:gap-4 mcs:lg:grid-cols-[240px_1fr]'}>
                <TitledGreyBox title={'Software'}>
                    <div className={'mcs:flex mcs:flex-col mcs:gap-3 mcs:max-h-[640px] mcs:overflow-y-auto'}>
                        {Object.entries(overview.types ?? {}).map(([group, entries]) => (
                            <div key={group}>
                                <p className={'mcs:text-xs mcs:uppercase mcs:tracking-wide mcs:text-muted-foreground mcs:mb-1'}>{GROUP_LABELS[group] ?? group}</p>
                                {Object.entries(entries).map(([id, software]) => (
                                    <button
                                        key={id}
                                        type={'button'}
                                        onClick={() => setType(id)}
                                        className={cn(
                                            'mcs:flex mcs:w-full mcs:items-center mcs:gap-2 mcs:rounded mcs:px-2 mcs:py-1.5 mcs:text-sm mcs:cursor-pointer mcs:text-left',
                                            id === type ? 'mcs:bg-primary mcs:text-primary-foreground' : 'mcs:hover:bg-muted'
                                        )}
                                    >
                                        <img src={software.icon} alt={''} className={'mcs:size-5 mcs:rounded-sm'} loading={'lazy'} />
                                        <span className={'mcs:flex-1 mcs:truncate'}>{software.name}</span>
                                        <span className={'mcs:text-xs mcs:opacity-70'}>{software.builds}b</span>
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </TitledGreyBox>

                <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
                    {selectedType && (
                        <p className={'mcs:text-sm mcs:text-muted-foreground'}>
                            <strong className={'mcs:text-foreground'}>{selectedType.name}</strong>: {selectedType.description}
                        </p>
                    )}
                    <div className={'mcs:flex mcs:flex-wrap mcs:gap-2'}>
                        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={'Search versions…'} className={'mcs:flex-1 mcs:min-w-48'} />
                        <div className={'mcs:w-44'}>
                            <Select
                                value={channel}
                                onChange={(value) => setChannel(value as typeof channel)}
                                options={[
                                    { value: 'all', label: 'All versions' },
                                    { value: 'RELEASE', label: 'Stable' },
                                    { value: 'SNAPSHOT', label: 'Snapshots' },
                                ]}
                            />
                        </div>
                    </div>
                    {versions.isLoading ? (
                        <Spinner centered />
                    ) : versions.isError ? (
                        <Alert type={'danger'}>{httpErrorToHuman(versions.error)}</Alert>
                    ) : (
                        <div className={'mcs:grid mcs:gap-2 mcs:sm:grid-cols-2'}>
                            {filtered.map((version) => (
                                <button
                                    key={version.id}
                                    type={'button'}
                                    onClick={() => {
                                        setPreselect(null);
                                        setSelected(version);
                                    }}
                                    className={cn(
                                        'mcs:flex mcs:items-center mcs:gap-3 mcs:rounded-md mcs:border mcs:border-border mcs:bg-card mcs:p-3 mcs:text-left mcs:cursor-pointer mcs:hover:border-primary',
                                        info.mcjarsType === type && info.version === version.id && 'mcs:border-primary'
                                    )}
                                >
                                    {selectedType && <img src={selectedType.icon} alt={''} className={'mcs:size-9 mcs:rounded'} loading={'lazy'} />}
                                    <div className={'mcs:min-w-0 mcs:flex-1'}>
                                        <div className={'mcs:flex mcs:items-center mcs:gap-2'}>
                                            <span className={'mcs:font-semibold'}>{version.id}</span>
                                            <Badge size={'sm'} tone={version.type === 'RELEASE' ? 'success' : 'warning'}>
                                                {version.type === 'RELEASE' ? 'Stable' : 'Snapshot'}
                                            </Badge>
                                            {info.mcjarsType === type && info.version === version.id && (
                                                <Badge size={'sm'} tone={'info'}>
                                                    Installed
                                                </Badge>
                                            )}
                                        </div>
                                        <p className={'mcs:text-xs mcs:text-muted-foreground'}>
                                            {version.builds} builds{version.java ? ` · Java ${version.java}` : ''}
                                        </p>
                                    </div>
                                    {version.created && <span className={'mcs:text-xs mcs:text-muted-foreground'}>{formatDate(version.created, 'MMM D, YYYY')}</span>}
                                </button>
                            ))}
                            {filtered.length === 0 && <p className={'mcs:text-sm mcs:text-muted-foreground'}>No versions match.</p>}
                        </div>
                    )}
                </div>
            </div>

            {selected && (
                <BuildsDialog
                    identifier={identifier}
                    type={type}
                    typeName={selectedType?.name ?? type}
                    version={selected}
                    initialBuild={preselect}
                    overview={overview}
                    onClose={() => setSelected(null)}
                    onStarted={(started) => {
                        setSelected(null);
                        onStarted(started);
                    }}
                />
            )}
        </>
    );
}

function CurrentCard({
    overview,
    type,
    versions,
    onPick,
}: {
    overview: Awaited<ReturnType<typeof getOverview>>;
    type: SoftwareType | null;
    versions: VersionSummary[];
    onPick: (version: VersionSummary, build: number) => void;
}) {
    const info = overview.info;
    const current = versions.find((version) => version.id === info.version);
    const newestStable = versions.find((version) => version.type === 'RELEASE');
    // Pumpkin's Nightly and Canary are newer than any release: a release would be a step back.
    const rolling = info.mcjarsType === 'PUMPKIN' && (info.build === 'Nightly' || info.build === 'Canary' || info.build === 'nightly' || info.build === 'canary');
    const canUpdateBuild = !rolling && current && info.buildId && current.latest.id !== info.buildId;
    const canUpgrade = !rolling && newestStable && info.version && newestStable.id !== info.version && versions.indexOf(newestStable) < versions.findIndex((version) => version.id === info.version);


    return (
        <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-4 mcs:rounded-md mcs:border mcs:border-border mcs:bg-card mcs:p-4'}>
            {type ? <img src={type.icon} alt={''} className={'mcs:size-12 mcs:rounded'} /> : <div className={'mcs:size-12 mcs:rounded mcs:bg-muted'} />}
            <div className={'mcs:min-w-0 mcs:flex-1'}>
                <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-2'}>
                    <span className={'mcs:text-lg mcs:font-semibold'}>
                        {type?.name ?? info.software ?? 'Unknown'} {info.version ?? ''}
                    </span>
                    {info.build && <span className={'mcs:text-muted-foreground mcs:text-sm'}>({String(info.build).startsWith('#') ? info.build : `#${info.build}`})</span>}
                    {current && (
                        <Badge size={'sm'} tone={current.type === 'RELEASE' ? 'success' : 'warning'}>
                            {current.type === 'RELEASE' ? 'Stable' : 'Snapshot'}
                        </Badge>
                    )}
                </div>
                <p className={'mcs:text-xs mcs:text-muted-foreground mcs:mt-1'}>
                    {current?.java ? `Java ${current.java} · ` : ''}
                    <span className={'mcs:font-mono'}>{info.jarFile}</span>
                    {info.source !== 'record' && ' · detected from the server files'}
                </p>
            </div>
            <div className={'mcs:flex mcs:flex-wrap mcs:gap-2'}>
                {canUpdateBuild && current && (
                    <Button isSecondary onClick={() => onPick(current, current.latest.id)}>
                        Update build ({current.latest.name})
                    </Button>
                )}
                {canUpgrade && newestStable && (
                    <Button onClick={() => onPick(newestStable, newestStable.latest.id)}>
                        Upgrade to {newestStable.id} ({newestStable.latest.name})
                    </Button>
                )}
            </div>
        </div>
    );
}

function BuildsDialog({
    identifier,
    type,
    typeName,
    version,
    initialBuild,
    overview,
    onClose,
    onStarted,
}: {
    identifier: string;
    type: string;
    typeName: string;
    version: VersionSummary;
    initialBuild: number | null;
    overview: Awaited<ReturnType<typeof getOverview>>;
    onClose: () => void;
    onStarted: (job: string) => void;
}) {
    const server = useCurrentServerRequired();
    const builds = useQuery({ queryKey: keys.builds(identifier, type, version.id), queryFn: () => getBuilds(identifier, type, version.id), staleTime: 300_000 });
    const [build, setBuild] = useState<number | null>(initialBuild);
    const [start, setStart] = useState(true);
    const [newWorld, setNewWorld] = useState(false);
    const [busy, setBusy] = useState(false);
    const setImage = useSetServerDockerImage(server.attributes.uuid);
    const info = overview.info;

    const currentJava = imageJava(overview.dockerImage);
    const javaMismatch = version.java !== null && currentJava !== null && currentJava < version.java;
    const matchingImage = Object.entries(overview.dockerImages).find(([, image]) => imageJava(image) === version.java);
    const switchingSoftware = info.mcjarsType !== null && info.mcjarsType !== type;
    // The Pumpkin egg starts a binary, the Java eggs a jar: only the egg can cross between them.
    const wrongEgg = (type === 'PUMPKIN') !== overview.pumpkinEgg;
    const chosen: BuildSummary | undefined = builds.data?.find((entry) => entry.id === build) ?? builds.data?.[0];
    const worldBlocked = !!chosen && !opensWorld(chosen, overview.worldDataVersion);

    const install = async () => {
        if (!chosen) return;
        setBusy(true);
        try {
            if (javaMismatch && matchingImage && overview.canChangeImage) {
                await setImage.mutateAsync({ image: matchingImage[1] });
            }

            onStarted(await installBuild(identifier, chosen.id, start, type, worldBlocked ? { newWorld } : {}));
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} title={`${typeName} ${version.id}`} description={`${version.builds} builds${version.java ? ` · needs Java ${version.java}` : ''}`}>
            <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
                {wrongEgg && (
                    <Alert type={'danger'}>
                        {type === 'PUMPKIN'
                            ? 'Pumpkin is a native program, not a jar, so it needs the Pumpkin egg. Ask an administrator to change the egg.'
                            : 'This server uses the Pumpkin egg, which can only start Pumpkin. Ask an administrator to change the egg to run Java server software.'}
                    </Alert>
                )}
                {worldBlocked && chosen?.worldDataVersions && (
                    <Alert type={'danger'}>
                        <div className={'mcs:flex mcs:flex-col mcs:gap-2'}>
                            <span>
                                The world was saved by a newer Pumpkin (data version {overview.worldDataVersion}), and {chosen.name} only opens worlds up to {chosen.worldDataVersions[1]}. The
                                server would not start with it.
                            </span>
                            <label className={'mcs:flex mcs:items-center mcs:gap-2'}>
                                <Checkbox checked={newWorld} onChange={setNewWorld} /> Start a new world. The current one is kept as a backup folder next to it.
                            </label>
                        </div>
                    </Alert>
                )}
                {type === 'PUMPKIN' && !wrongEgg && info.software === 'pumpkin' && chosen && info.build !== chosen.name && !chosen.worldDataVersions && (
                    <Alert type={'warning'}>
                        Pumpkin refuses to open a world saved by a newer build. Going from Nightly or Canary back to a release, or to an older release, can leave the world
                        unloadable until you switch back.
                    </Alert>
                )}
                {switchingSoftware && !wrongEgg && (
                    <Alert type={'warning'}>
                        This replaces the server software. Plugins and mods made for the old software may stop working, and worlds cannot be moved back to an older Minecraft version.
                    </Alert>
                )}
                {javaMismatch && (
                    <Alert type={'warning'}>
                        This version needs Java {version.java}, but the server uses Java {currentJava}.{' '}
                        {matchingImage && overview.canChangeImage ? `The Docker image will be switched to ${matchingImage[0]}.` : 'Change the Docker image in the Startup tab first.'}
                    </Alert>
                )}
                {builds.isLoading ? (
                    <Spinner centered />
                ) : builds.isError ? (
                    <Alert type={'danger'}>{httpErrorToHuman(builds.error)}</Alert>
                ) : (
                    <div className={'mcs:flex mcs:flex-col mcs:gap-1 mcs:max-h-80 mcs:overflow-y-auto'}>
                        {(builds.data ?? []).map((entry, index) => (
                            <label
                                key={entry.id}
                                className={cn(
                                    'mcs:flex mcs:items-start mcs:gap-3 mcs:rounded mcs:border mcs:p-2 mcs:cursor-pointer',
                                    (chosen?.id ?? null) === entry.id ? 'mcs:border-primary' : 'mcs:border-border'
                                )}
                            >
                                <input type={'radio'} name={'mcs-build'} checked={(chosen?.id ?? null) === entry.id} onChange={() => setBuild(entry.id)} className={'mcs:mt-1'} />
                                <div className={'mcs:min-w-0 mcs:flex-1'}>
                                    <div className={'mcs:flex mcs:items-center mcs:gap-2 mcs:text-sm'}>
                                        <span className={'mcs:font-medium'}>{entry.name ?? `#${entry.buildNumber}`}</span>
                                        {index === 0 && (
                                            <Badge size={'sm'} tone={'info'}>
                                                Latest
                                            </Badge>
                                        )}
                                        {entry.experimental && (
                                            <Badge size={'sm'} tone={'warning'}>
                                                Experimental
                                            </Badge>
                                        )}
                                        {!opensWorld(entry, overview.worldDataVersion) && (
                                            <Badge size={'sm'} tone={'danger'}>
                                                Older world format
                                            </Badge>
                                        )}
                                        {info.buildId === entry.id && (
                                            <Badge size={'sm'} tone={'success'}>
                                                Installed
                                            </Badge>
                                        )}
                                    </div>
                                    {entry.changes.length > 0 && <p className={'mcs:text-xs mcs:text-muted-foreground mcs:truncate'}>{entry.changes[0]}</p>}
                                </div>
                                {entry.created && <span className={'mcs:text-xs mcs:text-muted-foreground'}>{formatDate(entry.created, 'MMM D, YYYY')}</span>}
                            </label>
                        ))}
                    </div>
                )}
                <label className={'mcs:flex mcs:items-center mcs:gap-2 mcs:text-sm mcs:mt-3'}><Checkbox checked={start} onChange={setStart} /> Start the server when done</label>
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button isLoading={busy} disabled={!chosen || wrongEgg || (worldBlocked && !newWorld)} onClick={install}>
                    Install {chosen?.name ?? ''}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}

function BedrockVersions({ identifier, current, busy, onStarted }: { identifier: string; current: string | null; busy: boolean; onStarted: (job: string) => void }) {
    const versions = useQuery({ queryKey: keys.versionList(identifier, 'BEDROCK'), queryFn: () => getBedrockVersions(identifier), staleTime: 600_000 });
    const [preview, setPreview] = useState(false);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string | null>(null);
    const [start, setStart] = useState(true);
    const [installing, setInstalling] = useState(false);

    if (versions.isLoading) return <Spinner centered />;
    if (versions.isError || !versions.data) return <Alert type={'danger'}>{httpErrorToHuman(versions.error)}</Alert>;

    const data = versions.data;
    const list = (preview ? data.preview : data.versions).filter((version) => version.includes(search.trim()));
    const latest = preview ? data.latestPreview : data.stable;

    const install = async () => {
        if (!selected) return;
        setInstalling(true);
        try {
            onStarted(await installBedrock(identifier, selected, preview, start));
            setSelected(null);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setInstalling(false);
        }
    };

    return (
        <>
            <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-4 mcs:rounded-md mcs:border mcs:border-border mcs:bg-card mcs:p-4'}>
                <div className={'mcs:flex-1'}>
                    <p className={'mcs:text-lg mcs:font-semibold'}>Bedrock Dedicated Server {current ?? ''}</p>
                    <p className={'mcs:text-xs mcs:text-muted-foreground'}>Worlds, server.properties, allowlist.json and permissions.json are kept when you switch versions.</p>
                </div>
                {data.stable && current !== data.stable && (
                    <Button disabled={busy} onClick={() => { setPreview(false); setSelected(data.stable); }}>
                        Upgrade to {data.stable}
                    </Button>
                )}
            </div>
            <div className={'mcs:flex mcs:flex-wrap mcs:gap-2'}>
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={'Search versions…'} className={'mcs:flex-1 mcs:min-w-48'} />
                <div className={'mcs:w-44'}>
                    <Select
                        value={preview ? 'preview' : 'stable'}
                        onChange={(value) => setPreview(value === 'preview')}
                        options={[
                            { value: 'stable', label: 'Stable' },
                            { value: 'preview', label: 'Preview' },
                        ]}
                    />
                </div>
            </div>
            <div className={'mcs:grid mcs:gap-2 mcs:sm:grid-cols-3'}>
                {list.slice(0, 120).map((version) => (
                    <button
                        key={version}
                        type={'button'}
                        onClick={() => setSelected(version)}
                        className={cn(
                            'mcs:flex mcs:items-center mcs:justify-between mcs:rounded-md mcs:border mcs:bg-card mcs:p-3 mcs:cursor-pointer mcs:hover:border-primary',
                            version === current ? 'mcs:border-primary' : 'mcs:border-border'
                        )}
                    >
                        <span className={'mcs:font-semibold'}>{version}</span>
                        {version === latest && (
                            <Badge size={'sm'} tone={preview ? 'warning' : 'success'}>
                                Latest
                            </Badge>
                        )}
                        {version === current && (
                            <Badge size={'sm'} tone={'info'}>
                                Installed
                            </Badge>
                        )}
                    </button>
                ))}
            </div>
            {selected && (
                <Dialog open onClose={() => setSelected(null)} title={`Install Bedrock ${selected}`} description={'The server stops, the new version is downloaded and your settings and worlds are kept.'}>
                    <label className={'mcs:flex mcs:items-center mcs:gap-2 mcs:text-sm mcs:mt-3'}><Checkbox checked={start} onChange={setStart} /> Start the server when done</label>
                    <Dialog.Footer>
                        <Button.Text onClick={() => setSelected(null)}>Cancel</Button.Text>
                        <Button isLoading={installing} onClick={install}>
                            Install
                        </Button>
                    </Dialog.Footer>
                </Dialog>
            )}
        </>
    );
}
