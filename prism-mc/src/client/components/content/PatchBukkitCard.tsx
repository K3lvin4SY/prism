import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Spinner, httpErrorToHuman, toast, useCurrentServerRequired, useSetServerDockerImage } from '@pterodactyl/sdk';
import { NamedIcon } from '../../icons';
import { getPatchBukkit, installPatchBukkit, patchBukkitKey } from '../../api/patchbukkit';
import JobProgress from '../JobProgress';

const SUGGESTED_IMAGE = 'ghcr.io/pterodactyl/yolks:java_25';

/**
 * Pumpkin runs Bukkit plugins through PatchBukkit, which embeds a JVM. This card installs or
 * updates it and makes sure the server's image has Java to run it.
 */
export default function PatchBukkitCard({ server }: { server: string }) {
    const queryClient = useQueryClient();
    const current = useCurrentServerRequired();
    const setImage = useSetServerDockerImage(current.attributes.uuid);
    const status = useQuery({ queryKey: patchBukkitKey(server), queryFn: () => getPatchBukkit(server) });
    const [job, setJob] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const finished = useCallback(
        (result: 'completed' | 'failed') => {
            setJob(null);
            queryClient.invalidateQueries({ queryKey: patchBukkitKey(server) });
            if (result === 'completed') toast.success('PatchBukkit is installed. Restart the server to load it.');
        },
        [queryClient, server]
    );

    if (status.isLoading) return <Spinner centered />;
    if (status.isError || !status.data) return <Alert type={'danger'}>{httpErrorToHuman(status.error)}</Alert>;

    const data = status.data;
    const runningJob = job ?? data.job;
    const javaOk = (data.java.version ?? 0) >= data.java.needed;
    const javaImage = Object.entries(data.java.images)[0];
    const outdated = data.installed && data.available && data.record && data.record.tag !== data.available.tag;
    // Installing again also reinstalls Pumpkin as its glibc build when the egg allows it.
    const needsGlibc = !!data.installed && !data.glibc;

    const install = async () => {
        setBusy(true);
        try {
            setJob(await installPatchBukkit(server));
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    const switchImage = async () => {
        if (!javaImage) return;
        setBusy(true);
        try {
            await setImage.mutateAsync({ image: javaImage[1] });
            toast.success(`The server now uses ${javaImage[0]}. Restart it to apply.`);
            await queryClient.invalidateQueries({ queryKey: patchBukkitKey(server) });
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={'pt-surface mcs:flex mcs:flex-col mcs:gap-3 mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:p-4'}>
            <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-3'}>
                <span className={'mcs:flex mcs:size-11 mcs:items-center mcs:justify-center mcs:rounded-full mcs:bg-primary/15 mcs:text-primary'}>
                    <NamedIcon name={'puzzle'} size={20} />
                </span>
                <div className={'mcs:min-w-0 mcs:flex-1'}>
                    <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-2'}>
                        <span className={'mcs:font-semibold'}>PatchBukkit</span>
                        {data.installed ? (
                            <Badge size={'sm'} tone={'success'}>
                                {data.record ? data.record.name : 'Installed'}
                            </Badge>
                        ) : (
                            <Badge size={'sm'} tone={'warning'}>
                                Not installed
                            </Badge>
                        )}
                    </div>
                    <p className={'mcs:text-sm mcs:text-muted-foreground'}>
                        Runs Paper, Spigot and Bukkit plugins on Pumpkin. Plugins installed here go to <span className={'mcs:font-mono'}>{data.folder}/</span>.
                    </p>
                </div>
                {(!data.installed || outdated || (needsGlibc && data.canSwitchBuild)) && data.available && (
                    <Button isLoading={busy && !!runningJob} disabled={busy || !!runningJob} onClick={install}>
                        <NamedIcon name={'download'} size={14} /> {!data.installed ? `Install ${data.available.name}` : outdated ? `Update to ${data.available.name}` : 'Repair'}
                    </Button>
                )}
            </div>

            {runningJob && <JobProgress key={runningJob} job={runningJob} onFinished={finished} />}

            {!data.installed && data.canSwitchBuild && (
                <p className={'mcs:text-xs mcs:text-muted-foreground'}>
                    Pumpkin is reinstalled as its glibc build along the way: the musl build the egg uses by default cannot load native plugins. The world and settings stay.
                </p>
            )}

            {data.rolling && (
                <Alert type={'warning'}>
                    Pumpkin runs a Nightly or Canary build, and PatchBukkit is built for Pumpkin releases. A mismatch can crash Pumpkin at start. Pick a release on the Versions tab
                    to use plugins safely.
                </Alert>
            )}

            {needsGlibc && (
                <Alert type={'warning'}>
                    {data.canSwitchBuild
                        ? 'Pumpkin is still its musl build, which cannot load PatchBukkit. Repair reinstalls it as the glibc build; the world and settings stay.'
                        : 'Pumpkin is its musl build, which cannot load PatchBukkit, and an administrator set the egg download URL by hand. Ask them to use the pumpkin-X64-Linux build.'}
                </Alert>
            )}

            {!javaOk && (
                <Alert type={'warning'}>
                    <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:justify-between mcs:gap-3'}>
                        <span>
                            PatchBukkit starts Java {data.java.needed} inside the server, but the image <span className={'mcs:font-mono'}>{data.java.image}</span> has no Java.{' '}
                            {javaImage
                                ? data.java.canChange
                                    ? ''
                                    : `Ask an administrator to switch it to ${javaImage[0]}.`
                                : `Ask an administrator to add ${SUGGESTED_IMAGE} to the egg's images and pick it in the Startup tab.`}
                        </span>
                        {javaImage && data.java.canChange && (
                            <Button size={'small'} disabled={busy} onClick={switchImage}>
                                Use {javaImage[0]}
                            </Button>
                        )}
                    </div>
                </Alert>
            )}
        </div>
    );
}
