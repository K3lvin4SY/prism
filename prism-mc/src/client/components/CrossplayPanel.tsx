import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Dialog, Spinner, Switch, TitledGreyBox, http, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { base } from '../api/client';
import JobProgress from './JobProgress';

interface CrossplayStatus {
    supported: boolean;
    software: string | null;
    /** Pumpkin speaks Bedrock itself: no Geyser, just a switch. */
    native?: boolean;
    enabled?: boolean;
    geyser?: string | null;
    floodgate?: string | null;
    configured?: boolean;
    port?: number | null;
    job?: string | null;
}

interface Component {
    name: string;
    installed: string | null;
    latest: string;
    upToDate: boolean;
}

function Row({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
    return (
        <div className={'mcs:flex mcs:items-center mcs:gap-3 mcs:py-2'}>
            <NamedIcon name={ok ? 'circle-check' : 'circle-dot'} size={18} className={ok ? 'mcs:text-success' : 'mcs:text-muted-foreground'} />
            <span className={'mcs:text-sm mcs:font-medium'}>{label}</span>
            <span className={'mcs:ml-auto mcs:text-xs mcs:text-muted-foreground mcs:font-mono mcs:truncate'}>{detail}</span>
        </div>
    );
}

/**
 * One switch that lets Bedrock players join a Java server: Geyser and Floodgate are downloaded,
 * checked against their published checksums and set up on the server's own port.
 */
export default function CrossplayPanel({ server }: { server: string }) {
    const queryClient = useQueryClient();
    const key = ['prism-mc', server, 'crossplay'];
    const status = useQuery({ queryKey: key, queryFn: async () => (await http.get<CrossplayStatus>(`${base(server)}/crossplay`)).data });
    const [job, setJob] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmOff, setConfirmOff] = useState(false);

    if (status.isLoading) return <Spinner centered />;
    if (status.isError || !status.data) return <Alert type={'danger'}>{httpErrorToHuman(status.error)}</Alert>;

    const data = status.data;
    if (!data.supported) {
        return (
            <TitledGreyBox title={'Crossplay'}>
                <p className={'mcs:text-sm mcs:text-muted-foreground'}>
                    Geyser runs on Paper, Purpur, Spigot, Fabric, NeoForge, Velocity and BungeeCord. Switch the server software on the Versions tab to let Bedrock players join.
                </p>
            </TitledGreyBox>
        );
    }

    if (data.native) {
        return <NativeCrossplay server={server} enabled={!!data.enabled} port={data.port ?? null} onChanged={() => queryClient.invalidateQueries({ queryKey: key })} />;
    }

    const enabled = !!data.geyser;
    const runningJob = job ?? data.job ?? null;

    const enable = async () => {
        setBusy(true);
        try {
            setJob((await http.post<{ job: string }>(`${base(server)}/crossplay`)).data.job);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    const disable = async () => {
        setBusy(true);
        try {
            await http.delete(`${base(server)}/crossplay`);
            toast.success('Geyser and Floodgate were removed. Restart the server to finish.');
            await queryClient.invalidateQueries({ queryKey: key });
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
            setConfirmOff(false);
        }
    };

    return (
        <TitledGreyBox title={'Crossplay'}>
            <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                <div className={'mcs:flex mcs:items-start mcs:gap-3'}>
                    <Switch
                        checked={enabled}
                        disabled={busy || runningJob !== null}
                        onChange={(checked) => (checked ? enable() : setConfirmOff(true))}
                        label={'Let Bedrock players join'}
                        description={`Phones, consoles and Windows players connect to the same address${data.port ? ` and port ${data.port}` : ''}. No extra allocation is needed.`}
                    />
                    {busy && <Spinner size={'small'} />}
                </div>

                {runningJob && (
                    <JobProgress
                        key={runningJob}
                        job={runningJob}
                        onFinished={() => {
                            setJob(null);
                            queryClient.invalidateQueries({ queryKey: key });
                        }}
                    />
                )}

                {enabled && (
                    <div className={'mcs:divide-y mcs:divide-border mcs:rounded-md mcs:border mcs:border-border mcs:px-3'}>
                        <Row ok={!!data.geyser} label={'Geyser'} detail={data.geyser ?? 'Not installed'} />
                        <Row ok={!!data.floodgate} label={'Floodgate'} detail={data.floodgate ?? 'Not installed'} />
                        <Row ok={!!data.configured} label={'Same port as Java'} detail={data.configured ? `UDP ${data.port}` : 'Applies after the first start'} />
                    </div>
                )}

                {enabled && !runningJob && <Updates server={server} onJob={setJob} />}

                <p className={'mcs:text-xs mcs:text-muted-foreground'}>
                    Turning this on stops the server, downloads Geyser and Floodgate and checks them against their published checksums, turns off signed chat (Bedrock players
                    cannot sign messages), starts the server once so Geyser writes its config, points it at this server's port and restarts.
                </p>
            </div>

            <Dialog.Confirm open={confirmOff} onClose={() => setConfirmOff(false)} title={'Turn off crossplay?'} confirm={'Remove Geyser and Floodgate'} pending={busy} onConfirmed={disable}>
                The Geyser and Floodgate files are deleted; their config folders are kept. Bedrock players can no longer join after the next restart.
            </Dialog.Confirm>
        </TitledGreyBox>
    );
}

/**
 * Checks Geyser and Floodgate against their newest builds for this server and, when one is
 * behind, updates it: the jars are swapped while the server is stopped and it starts again.
 */
function Updates({ server, onJob }: { server: string; onJob: (job: string) => void }) {
    const [components, setComponents] = useState<Component[] | null>(null);
    const [checking, setChecking] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const outdated = (components ?? []).filter((component) => component.installed && !component.upToDate);

    const check = async () => {
        setChecking(true);
        try {
            setComponents((await http.get<{ components: Component[] }>(`${base(server)}/crossplay/updates`)).data.components);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setChecking(false);
        }
    };

    const update = async () => {
        setUpdating(true);
        try {
            onJob((await http.post<{ job: string }>(`${base(server)}/crossplay/update`)).data.job);
            setComponents(null);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setUpdating(false);
            setConfirm(false);
        }
    };

    return (
        <div className={'mcs:flex mcs:flex-col mcs:gap-2'}>
            {components && (
                <div className={'mcs:divide-y mcs:divide-border mcs:rounded-md mcs:border mcs:border-border mcs:px-3'}>
                    {components.map((component) => (
                        <div key={component.name} className={'mcs:flex mcs:items-center mcs:gap-3 mcs:py-2'}>
                            <NamedIcon
                                name={!component.installed ? 'circle-dot' : component.upToDate ? 'circle-check' : 'download'}
                                size={18}
                                className={!component.installed ? 'mcs:text-muted-foreground' : component.upToDate ? 'mcs:text-success' : 'mcs:text-warning'}
                            />
                            <span className={'mcs:text-sm mcs:font-medium'}>{component.name}</span>
                            <span className={'mcs:ml-auto mcs:truncate mcs:text-xs mcs:text-muted-foreground'}>
                                {!component.installed ? 'Not installed' : component.upToDate ? `Up to date · ${component.latest}` : `Update to ${component.latest}`}
                            </span>
                        </div>
                    ))}
                </div>
            )}
            <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-2'}>
                <Button size={'small'} isSecondary isLoading={checking} onClick={check}>
                    <NamedIcon name={'refresh-cw'} size={14} /> {components ? 'Check again' : 'Check for updates'}
                </Button>
                {outdated.length > 0 && (
                    <Button size={'small'} isLoading={updating} onClick={() => setConfirm(true)}>
                        <NamedIcon name={'download'} size={14} /> Update {outdated.map((component) => component.name).join(' and ')}
                    </Button>
                )}
                {components && outdated.length === 0 && <span className={'mcs:text-xs mcs:text-muted-foreground'}>Nothing to update.</span>}
            </div>

            <Dialog.Confirm open={confirm} onClose={() => setConfirm(false)} title={`Update ${outdated.map((component) => component.name).join(' and ')}?`} confirm={'Update'} pending={updating} onConfirmed={update}>
                The server stops while the new {outdated.length === 1 ? 'jar is' : 'jars are'} downloaded and checked against the published checksum, then starts again if it was running.
                If anything goes wrong, the current {outdated.length === 1 ? 'jar is' : 'jars are'} put back.
            </Dialog.Confirm>
        </div>
    );
}

/** Pumpkin's own Bedrock support, switched on in pumpkin.toml and the egg's variables. */
function NativeCrossplay({ server, enabled, port, onChanged }: { server: string; enabled: boolean; port: number | null; onChanged: () => void }) {
    const [busy, setBusy] = useState(false);

    const toggle = async (checked: boolean) => {
        setBusy(true);
        try {
            await (checked ? http.post(`${base(server)}/crossplay`) : http.delete(`${base(server)}/crossplay`));
            toast.success(checked ? 'Bedrock is switched on. Restart the server to apply.' : 'Bedrock is switched off. Restart the server to apply.');
            onChanged();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <TitledGreyBox title={'Crossplay'}>
            <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                <div className={'mcs:flex mcs:items-start mcs:gap-3'}>
                    <Switch
                        checked={enabled}
                        disabled={busy}
                        onChange={toggle}
                        label={'Let Bedrock players join'}
                        description={`Phones, consoles and Windows players connect to the same address${port ? ` and port ${port}` : ''}, over UDP.`}
                    />
                    {busy && <Spinner size={'small'} />}
                </div>
                <div className={'mcs:divide-y mcs:divide-border mcs:rounded-md mcs:border mcs:border-border mcs:px-3'}>
                    <Row ok label={'Built into Pumpkin'} detail={'No Geyser or Floodgate needed'} />
                    <Row ok={enabled} label={'Same port as Java'} detail={enabled && port ? `UDP ${port}` : 'Off'} />
                </div>
            </div>
        </TitledGreyBox>
    );
}
