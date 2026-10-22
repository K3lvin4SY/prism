import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Dialog, NamedIcon, Spinner, Switch, TitledGreyBox, http, httpErrorToHuman, toast } from '@pterodactyl/sdk';
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
    const key = ['mc-suite', server, 'crossplay'];
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
