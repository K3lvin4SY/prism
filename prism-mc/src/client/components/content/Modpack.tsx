import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Dialog, Spinner, formatDate, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { getModpack, installModpack, type ProjectVersion } from '../../api/content';
import { useMcInfo } from '../../hooks/useMcInfo';
import JobProgress from '../JobProgress';
import { ProjectIcon } from './ProjectCard';

export const modpackKey = (server: string) => ['prism-mc', server, 'modpacks', 'current'] as const;

/** The modpack Prism MC installed on this server, and the install in progress, if any. */
export function CurrentModpack() {
    const { identifier } = useMcInfo();
    const queryClient = useQueryClient();
    const current = useQuery({ queryKey: modpackKey(identifier), queryFn: () => getModpack(identifier) });

    if (current.isLoading) return <Spinner centered />;
    if (current.isError || !current.data) return <Alert type={'danger'}>{httpErrorToHuman(current.error)}</Alert>;

    const { modpack, job } = current.data;

    return (
        <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
            {job && <JobProgress key={job} job={job} onFinished={() => queryClient.invalidateQueries({ queryKey: ['prism-mc', identifier] })} />}
            {modpack ? (
                <div className={'pt-surface mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-4 mcs:rounded-md mcs:border mcs:border-border mcs:bg-card mcs:p-4'}>
                    <ProjectIcon src={modpack.icon} className={'mcs:size-14 mcs:shrink-0'} />
                    <div className={'mcs:min-w-0 mcs:flex-1'}>
                        <p className={'mcs:text-lg mcs:font-semibold'}>
                            {modpack.title} <span className={'mcs:text-sm mcs:text-muted-foreground'}>{modpack.versionNumber}</span>
                        </p>
                        <p className={'mcs:text-xs mcs:text-muted-foreground'}>
                            Minecraft {modpack.minecraft}
                            {modpack.loader && ` · ${modpack.loader.type.toLowerCase()} ${modpack.loader.version ?? ''}`} · {modpack.files} files · installed{' '}
                            {formatDate(modpack.installed, 'MMM D, YYYY')}
                        </p>
                    </div>
                    {modpack.url && (
                        <a href={modpack.url} target={'_blank'} rel={'noreferrer'} className={'mcs:text-sm mcs:underline'}>
                            View on Modrinth
                        </a>
                    )}
                </div>
            ) : (
                !job && <p className={'mcs:text-sm mcs:text-muted-foreground mcs:py-8 mcs:text-center'}>No modpack was installed with Prism MC yet. Pick one under Browse.</p>
            )}
        </div>
    );
}

export function ModpackInstallConfirm({ version, title, onCancel, onDone }: { version: ProjectVersion; title: string; onCancel: () => void; onDone: () => void }) {
    const { identifier } = useMcInfo();
    const queryClient = useQueryClient();
    const current = useQuery({ queryKey: modpackKey(identifier), queryFn: () => getModpack(identifier) });
    const [clean, setClean] = useState(true);
    const [start, setStart] = useState(true);
    const [busy, setBusy] = useState(false);

    const run = async () => {
        setBusy(true);
        try {
            await installModpack(identifier, version.id, clean, start);
            toast.success('The modpack install has started.');
            await queryClient.invalidateQueries({ queryKey: modpackKey(identifier) });
            onDone();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    const folders = current.data?.clean ?? ['mods', 'config'];

    return (
        <Dialog open onClose={onCancel} title={`Install ${title} ${version.number}`}>
            <div className={'mcs:flex mcs:flex-col mcs:gap-3 mcs:text-sm'}>
                <p>
                    The server stops, the pack's mods and configs are downloaded, and the server software is switched to {version.loaders.join(' or ')} for Minecraft{' '}
                    {version.gameVersions.join(', ')}.
                </p>
                <label className={'mcs:flex mcs:items-start mcs:gap-2'}>
                    <Checkbox checked={clean} onChange={setClean} className={'mcs:mt-0.5'} />
                    <span>
                        Clean install: delete {folders.map((folder) => `${folder}/`).join(', ')} first.
                        <span className={'mcs:block mcs:text-xs mcs:text-muted-foreground'}>Recommended. Worlds and server.properties are kept either way.</span>
                    </span>
                </label>
                {!clean && <Alert type={'warning'}>Mods already on the server stay, and may clash with the pack's own.</Alert>}
                <label className={'mcs:flex mcs:items-center mcs:gap-2'}>
                    <Checkbox checked={start} onChange={setStart} /> Start the server when done
                </label>
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onCancel}>Cancel</Button.Text>
                <Button color={clean ? 'red' : undefined} isLoading={busy} onClick={run}>
                    {clean ? 'Delete and install' : 'Install'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
