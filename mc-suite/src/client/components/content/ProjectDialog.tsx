import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Checkbox, Dialog, NamedIcon, Spinner, Switch, bytesToString, formatDate, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import {
    compactNumber,
    contentKeys,
    getDependencies,
    getProject,
    install,
    type BrowseKind,
    type ContentKind,
    type Dependency,
    type ProjectHit,
    type ProjectVersion,
} from '../../api/content';
import { useMcInfo } from '../../hooks/useMcInfo';
import { ModpackInstallConfirm } from './Modpack';
import { ProjectIcon } from './ProjectCard';

const TYPE_TONES = { release: 'success', beta: 'warning', alpha: 'danger' } as const;

interface Props {
    kind: BrowseKind;
    hit: Pick<ProjectHit, 'id' | 'title' | 'icon' | 'description' | 'author' | 'url'>;
    onClose: () => void;
    onInstalled?: () => void;
}

export default function ProjectDialog({ kind, hit, onClose, onInstalled }: Props) {
    const { identifier } = useMcInfo();
    const queryClient = useQueryClient();
    const [all, setAll] = useState(false);
    const [pending, setPending] = useState<ProjectVersion | null>(null);
    const project = useQuery({ queryKey: contentKeys.project(identifier, kind, hit.id, all), queryFn: () => getProject(identifier, kind, hit.id, all), staleTime: 120_000 });

    const done = () => {
        queryClient.invalidateQueries({ queryKey: ['mc-suite', identifier, kind] });
        onInstalled?.();
        onClose();
    };

    const data = project.data;
    const installedVersion = data?.installed?.version;

    return (
        <Dialog open onClose={onClose} title={hit.title} description={hit.author ? `by ${hit.author}` : undefined}>
            <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                <div className={'mcs:flex mcs:gap-3'}>
                    <ProjectIcon src={hit.icon} className={'mcs:size-16 mcs:shrink-0'} />
                    <div className={'mcs:min-w-0 mcs:flex-1'}>
                        <p className={'mcs:text-sm'}>{hit.description}</p>
                        {data && (
                            <div className={'mcs:flex mcs:flex-wrap mcs:gap-3 mcs:mt-2 mcs:text-xs mcs:text-muted-foreground'}>
                                <span>{compactNumber(data.project.downloads)} downloads</span>
                                <span>{compactNumber(data.project.follows)} followers</span>
                                {data.project.license && <span>{data.project.license}</span>}
                                <a href={data.project.url} target={'_blank'} rel={'noreferrer'} className={'mcs:inline-flex mcs:items-center mcs:gap-1 mcs:underline'}>
                                    Modrinth <NamedIcon name={'external-link'} size={12} />
                                </a>
                                {data.project.source && (
                                    <a href={data.project.source} target={'_blank'} rel={'noreferrer'} className={'mcs:underline'}>
                                        Source
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className={'mcs:flex mcs:items-center mcs:justify-between'}>
                    <span className={'mcs:text-sm mcs:font-medium'}>Versions</span>
                    <Switch checked={all} onChange={setAll} label={'Show every version'} />
                </div>

                {project.isLoading ? (
                    <Spinner centered />
                ) : project.isError || !data ? (
                    <Alert type={'danger'}>{httpErrorToHuman(project.error)}</Alert>
                ) : data.versions.length === 0 ? (
                    <Alert type={'info'}>No version is made for this server's software and Minecraft version. Turn on “Show every version” to see the rest.</Alert>
                ) : (
                    <div className={'mcs:flex mcs:flex-col mcs:gap-1 mcs:max-h-96 mcs:overflow-y-auto'}>
                        {data.versions.map((version) => {
                            const file = version.files.find((entry) => entry.primary) ?? version.files[0];

                            return (
                                <div key={version.id} className={'mcs:flex mcs:items-center mcs:gap-3 mcs:rounded mcs:border mcs:border-border mcs:p-2'}>
                                    <div className={'mcs:min-w-0 mcs:flex-1'}>
                                        <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-2 mcs:text-sm'}>
                                            <span className={'mcs:font-medium mcs:truncate'}>{version.number}</span>
                                            <Badge size={'sm'} tone={TYPE_TONES[version.type] ?? 'neutral'}>
                                                {version.type}
                                            </Badge>
                                            {installedVersion === version.id && (
                                                <Badge size={'sm'} tone={'info'}>
                                                    Installed
                                                </Badge>
                                            )}
                                        </div>
                                        <p className={'mcs:text-xs mcs:text-muted-foreground mcs:truncate'}>
                                            {version.loaders.join(', ')} · {summarizeVersions(version.gameVersions)}
                                            {version.published && ` · ${formatDate(version.published, 'MMM D, YYYY')}`}
                                            {file && ` · ${bytesToString(file.size)}`}
                                        </p>
                                    </div>
                                    <Button size={'small'} isSecondary={installedVersion === version.id} onClick={() => setPending(version)}>
                                        {installedVersion === version.id ? 'Reinstall' : data.installed ? 'Switch' : 'Install'}
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Close</Button.Text>
            </Dialog.Footer>

            {pending &&
                (kind === 'modpacks' ? (
                    <ModpackInstallConfirm version={pending} title={hit.title} onCancel={() => setPending(null)} onDone={done} />
                ) : (
                    <InstallConfirm kind={kind} version={pending} title={hit.title} onCancel={() => setPending(null)} onDone={done} />
                ))}
        </Dialog>
    );
}

/** "1.21.4, 1.21.3 and 5 more" */
function summarizeVersions(versions: string[]): string {
    const sorted = [...versions].reverse();
    if (sorted.length <= 3) return sorted.join(', ');

    return `${sorted.slice(0, 2).join(', ')} and ${sorted.length - 2} more`;
}

function InstallConfirm({ kind, version, title, onCancel, onDone }: { kind: ContentKind; version: ProjectVersion; title: string; onCancel: () => void; onDone: () => void }) {
    const { identifier } = useMcInfo();
    const dependencies = useQuery({ queryKey: contentKeys.dependencies(identifier, kind, version.id), queryFn: () => getDependencies(identifier, kind, version.id), staleTime: 120_000 });
    const [skipped, setSkipped] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [mismatch, setMismatch] = useState<string | null>(null);

    const installable = (dependencies.data ?? []).filter((dependency): dependency is Dependency & { version: NonNullable<Dependency['version']> } => dependency.version !== null);
    const missing = (dependencies.data ?? []).filter((dependency) => dependency.version === null);

    const run = async (force = false) => {
        setBusy(true);
        try {
            const result = await install(
                identifier,
                kind,
                version.id,
                installable.filter((dependency) => !skipped.includes(dependency.projectId)).map((dependency) => dependency.version.id),
                force
            );
            toast.success(result.job ? `Downloading ${result.files.length} files.` : `Downloading ${result.files.join(', ')}.`);
            onDone();
        } catch (error) {
            const message = httpErrorToHuman(error);
            if (!force && /is made for/.test(message)) {
                setMismatch(message);
            } else {
                toast.error(message);
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onCancel} title={`Install ${title} ${version.number}`}>
            <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
                {dependencies.isLoading ? (
                    <Spinner centered />
                ) : (
                    <>
                        {installable.length > 0 && (
                            <div className={'mcs:flex mcs:flex-col mcs:gap-2'}>
                                <p className={'mcs:text-sm'}>It needs these too:</p>
                                {installable.map((dependency) => (
                                    <label key={dependency.projectId} className={'mcs:flex mcs:items-center mcs:gap-2 mcs:text-sm'}>
                                        <Checkbox
                                            checked={!skipped.includes(dependency.projectId)}
                                            onChange={(checked) =>
                                                setSkipped((current) => (checked ? current.filter((id) => id !== dependency.projectId) : [...current, dependency.projectId]))
                                            }
                                        />
                                        <ProjectIcon src={dependency.project?.icon} className={'mcs:size-6'} />
                                        <span>{dependency.project?.title ?? dependency.projectId}</span>
                                        <span className={'mcs:text-muted-foreground'}>{dependency.version.number}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                        {missing.length > 0 && (
                            <Alert type={'warning'}>
                                {missing.length === 1 ? 'One required dependency has' : `${missing.length} required dependencies have`} no version for this server. It may not start
                                without {missing.length === 1 ? 'it' : 'them'}.
                            </Alert>
                        )}
                        {installable.length === 0 && missing.length === 0 && <p className={'mcs:text-sm'}>The file is downloaded straight into the {kind} folder.</p>}
                        {mismatch && <Alert type={'warning'}>{mismatch} Install it anyway?</Alert>}
                        <p className={'mcs:text-xs mcs:text-muted-foreground'}>Restart the server to load it.</p>
                    </>
                )}
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onCancel}>Cancel</Button.Text>
                <Button isLoading={busy} disabled={dependencies.isLoading} color={mismatch ? 'orange' : undefined} onClick={() => run(mismatch !== null)}>
                    {mismatch ? 'Install anyway' : 'Install'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
