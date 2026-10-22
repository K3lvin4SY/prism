import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Dialog, Input, NamedIcon, Select, Spinner, Switch, TitledGreyBox, cn, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import {
    getProxy,
    proxyKeys,
    restartServers,
    unlink,
    updateEntry,
    updateProxySettings,
    type EntryChanges,
    type LinkedServer,
    type ProxyEntry,
    type ProxyOverview,
} from '../../api/proxy';
import LinkDialog from './LinkDialog';
import SoftwareIcon from './SoftwareIcon';

const TYPE_NAMES: Record<string, string> = { velocity: 'Velocity', bungee: 'BungeeCord', bungeecord: 'BungeeCord', waterfall: 'Waterfall' };
const MODE_TEXT: Record<string, string> = {
    modern: 'Modern forwarding',
    legacy: 'Legacy forwarding',
    none: 'Forwarding off',
};

/** A text field that saves when it loses focus or Enter is pressed, and only when changed. */
function SavingInput({ value, onSave, placeholder, mono, label }: { value: string; onSave: (value: string) => Promise<void>; placeholder?: string; mono?: boolean; label: string }) {
    const [draft, setDraft] = useState(value);
    const [saving, setSaving] = useState(false);

    useEffect(() => setDraft(value), [value]);

    const save = async () => {
        if (draft.trim() === value) return;
        setSaving(true);
        try {
            await onSave(draft.trim());
        } catch {
            setDraft(value);
        } finally {
            setSaving(false);
        }
    };

    return (
        <label className={'mcs:flex mcs:flex-col mcs:gap-1 mcs:min-w-0'}>
            <span className={'mcs:text-xs mcs:uppercase mcs:tracking-wide mcs:text-muted-foreground'}>{label}</span>
            <div className={'mcs:relative'}>
                <Input
                    value={draft}
                    placeholder={placeholder}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={save}
                    onKeyDown={(event) => event.key === 'Enter' && (event.target as HTMLInputElement).blur()}
                    className={cn('mcs:w-full', mono && 'mcs:font-mono mcs:text-sm')}
                />
                {saving && (
                    <span className={'mcs:absolute mcs:right-3 mcs:top-1/2 mcs:-translate-y-1/2'}>
                        <Spinner size={'small'} />
                    </span>
                )}
            </div>
        </label>
    );
}

/** One server on the proxy, with everything about the link that can be changed. */
function EntryCard({
    entry,
    server,
    proxyType,
    order,
    onChange,
    onUnlink,
    heading,
}: {
    entry: ProxyEntry;
    server: LinkedServer | null | undefined;
    proxyType: string;
    order: number;
    onChange: (changes: EntryChanges) => Promise<void>;
    onUnlink: () => void;
    heading?: React.ReactNode;
}) {
    const [fallback, setFallback] = useState(entry.fallback);
    useEffect(() => setFallback(entry.fallback), [entry.fallback]);

    const toggleFallback = async (checked: boolean) => {
        setFallback(checked);
        try {
            await onChange({ fallback: checked });
        } catch {
            setFallback(!checked);
        }
    };

    return (
        <div className={'mcs:relative mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:p-4 mcs:pl-5 mcs:flex mcs:flex-col mcs:gap-4'}>
            <span className={'mcs:absolute mcs:left-0 mcs:top-4 mcs:bottom-4 mcs:w-1 mcs:rounded-r mcs:bg-primary/70'} aria-hidden />
            {heading}
            <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-3'}>
                <SoftwareIcon src={server?.icon} className={'mcs:size-10'} />
                <div className={'mcs:min-w-0 mcs:flex-1'}>
                    <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-2'}>
                        <span className={'mcs:font-semibold mcs:truncate'}>{server?.name ?? entry.name}</span>
                        {fallback && order === 0 && (
                            <Badge size={'sm'} tone={'success'}>
                                Default
                            </Badge>
                        )}
                        {!server && (
                            <Badge size={'sm'} tone={'neutral'} title={'Added to the proxy by hand, not through MC Suite.'}>
                                External
                            </Badge>
                        )}
                    </div>
                    <p className={'mcs:text-xs mcs:text-muted-foreground'}>
                        {server ? `${server.software ?? 'Minecraft'}${server.version ? ` ${server.version}` : ''}` : 'Not a server you manage here'}
                    </p>
                </div>
                <Button.Danger size={'small'} isSecondary onClick={onUnlink}>
                    <NamedIcon name={'unlink'} size={14} /> Unlink
                </Button.Danger>
            </div>

            <div className={'mcs:grid mcs:gap-3 mcs:sm:grid-cols-2'}>
                <SavingInput label={'Name on the proxy'} value={entry.name} mono onSave={(name) => onChange({ name })} />
                <SavingInput label={'Address'} value={entry.address} mono onSave={(address) => onChange({ address })} />
                {proxyType === 'velocity' && (
                    <SavingInput label={'Forced host'} value={entry.forcedHost ?? ''} placeholder={'play.example.com'} mono onSave={(forcedHost) => onChange({ forcedHost: forcedHost || null })} />
                )}
                <div className={'mcs:flex mcs:flex-col mcs:justify-end mcs:gap-2'}>
                    <Switch
                        checked={fallback}
                        onChange={toggleFallback}
                        label={'Send players here on join'}
                        description={fallback ? `Number ${order + 1} in the join order.` : 'Players only reach it with /server or a forced host.'}
                    />
                    {proxyType !== 'velocity' && (
                        <Switch checked={entry.restricted} onChange={(restricted) => onChange({ restricted })} label={'Restricted'} description={'Only players with permission can join it.'} />
                    )}
                </div>
            </div>
        </div>
    );
}

function RestartBar({ server, targets, onDone }: { server: string; targets: LinkedServer[]; onDone: () => void }) {
    const [busy, setBusy] = useState(false);
    const restartable = targets.filter((target) => target.canRestart);

    return (
        <Alert type={'warning'} title={'Restart to apply'}>
            <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:justify-between mcs:gap-3'}>
                <span>{targets.map((target) => target.name).join(' and ')} need a restart before the link works.</span>
                {restartable.length > 0 && (
                    <Button
                        size={'small'}
                        isLoading={busy}
                        onClick={async () => {
                            setBusy(true);
                            try {
                                const restarted = await restartServers(server, restartable.map((target) => target.identifier));
                                toast.success(`Restarting ${restarted.join(' and ')}.`);
                                onDone();
                            } catch (error) {
                                toast.error(httpErrorToHuman(error));
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        <NamedIcon name={'refresh-cw'} size={14} /> Restart {restartable.length > 1 ? 'both' : restartable[0].name}
                    </Button>
                )}
            </div>
        </Alert>
    );
}

/**
 * Links Java servers to a Velocity, BungeeCord or Waterfall proxy, from either side. Both
 * servers' configs change together, so they stay in step.
 */
export default function ProxyPanel({ server }: { server: string }) {
    const queryClient = useQueryClient();
    const overview = useQuery({ queryKey: proxyKeys.overview(server), queryFn: () => getProxy(server) });
    const [linking, setLinking] = useState(false);
    const [restart, setRestart] = useState<LinkedServer[] | null>(null);
    const [removing, setRemoving] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const refresh = () => queryClient.invalidateQueries({ queryKey: ['mc-suite', server, 'proxy'] });

    if (overview.isLoading) return <Spinner centered />;
    if (overview.isError || !overview.data) return <Alert type={'danger'}>{httpErrorToHuman(overview.error)}</Alert>;
    const data: ProxyOverview = overview.data;

    const change = async (name: string, changes: EntryChanges) => {
        try {
            await updateEntry(server, name, changes);
            await refresh();
            toast.success('Saved. Restart the proxy to apply.');
        } catch (error) {
            toast.error(httpErrorToHuman(error));
            throw error;
        }
    };

    const remove = async () => {
        if (!removing) return;
        setBusy(true);
        try {
            await unlink(server, removing);
            toast.success(`${removing} was unlinked and its forwarding settings were reverted.`);
            await refresh();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
            setRemoving(null);
        }
    };

    const confirmUnlink = (
        <Dialog.Confirm open={removing !== null} onClose={() => setRemoving(null)} title={`Unlink ${removing ?? ''}?`} confirm={'Unlink'} pending={busy} onConfirmed={remove}>
            The server is removed from the proxy. Its forwarding settings are switched off and its own account check is switched back on, so it works on its own again after a restart.
        </Dialog.Confirm>
    );

    if (data.role === 'unsupported') {
        return (
            <TitledGreyBox title={'Proxy'}>
                <p className={'mcs:text-sm mcs:text-muted-foreground'}>
                    Player forwarding needs Paper, Purpur, Spigot, Folia or Fabric. Vanilla, Forge and NeoForge servers cannot sit behind a proxy here. Switch the software on the Versions tab.
                </p>
            </TitledGreyBox>
        );
    }

    if (data.role === 'backend') {
        const linked = data.link;

        return (
            <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                {restart && <RestartBar server={server} targets={restart} onDone={() => setRestart(null)} />}
                {linked ? (
                    <EntryCard
                        entry={linked}
                        server={{ ...linked.proxy, name: linked.proxy.name }}
                        proxyType={linked.type}
                        order={linked.position ?? 0}
                        onChange={(changes) => change(linked.name, changes)}
                        onUnlink={() => setRemoving(linked.name)}
                        heading={
                            <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-2 mcs:text-sm'}>
                                <NamedIcon name={'link'} size={16} className={'mcs:text-primary'} />
                                <span>
                                    Players join through <strong>{linked.proxy.name}</strong> at <span className={'mcs:font-mono'}>{linked.proxy.address}</span>.
                                </span>
                                <Badge size={'sm'} tone={'info'}>
                                    {MODE_TEXT[linked.mode]}
                                </Badge>
                            </div>
                        }
                    />
                ) : (
                    <div className={'mcs:flex mcs:flex-col mcs:items-center mcs:gap-3 mcs:rounded-lg mcs:border mcs:border-dashed mcs:border-border mcs:bg-card mcs:p-8 mcs:text-center'}>
                        <span className={'mcs:flex mcs:size-12 mcs:items-center mcs:justify-center mcs:rounded-full mcs:bg-primary/15 mcs:text-primary'}>
                            <NamedIcon name={'network'} size={22} />
                        </span>
                        <div>
                            <p className={'mcs:font-semibold'}>Not behind a proxy</p>
                            <p className={'mcs:text-sm mcs:text-muted-foreground mcs:max-w-md'}>
                                Link this server to a Velocity, BungeeCord or Waterfall proxy you manage. Both servers are set up for each other: addresses, forwarding and the shared secret.
                            </p>
                        </div>
                        <Button onClick={() => setLinking(true)}>
                            <NamedIcon name={'link'} size={14} /> Link to a proxy
                        </Button>
                    </div>
                )}
                {linking && (
                    <LinkDialog
                        server={server}
                        side={'backend'}
                        onClose={() => setLinking(false)}
                        onLinked={(targets) => {
                            setLinking(false);
                            setRestart(targets);
                            refresh();
                        }}
                    />
                )}
                {confirmUnlink}
            </div>
        );
    }

    // This server is the proxy.
    const typeName = TYPE_NAMES[data.type] ?? data.type;
    const ordered = [...data.entries].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
    const bindWrong = data.bind != null && data.port != null && data.bind !== data.port;

    const saveSettings = async (settings: Parameters<typeof updateProxySettings>[1]) => {
        try {
            const result = await updateProxySettings(server, settings);
            if (result.failed.length > 0) toast.error(result.failed.join(' '));
            else toast.success('Saved. Restart the proxy and its servers to apply.');
            await refresh();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        }
    };

    return (
        <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
            {restart && <RestartBar server={server} targets={restart} onDone={() => setRestart(null)} />}

            {!data.ready ? (
                <Alert type={'info'}>Start the proxy once so it writes its config. Then you can link servers here.</Alert>
            ) : (
                <>
                    <div className={'mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:p-4 mcs:flex mcs:flex-col mcs:gap-4'}>
                        <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-3'}>
                            <span className={'mcs:flex mcs:size-12 mcs:items-center mcs:justify-center mcs:rounded-full mcs:bg-primary/15 mcs:text-primary'}>
                                <NamedIcon name={'network'} size={22} />
                            </span>
                            <div className={'mcs:min-w-0 mcs:flex-1'}>
                                <p className={'mcs:text-lg mcs:font-semibold'}>{typeName} network</p>
                                <p className={'mcs:text-sm mcs:text-muted-foreground'}>
                                    Players connect to <span className={'mcs:font-mono'}>{data.address}</span> and are sent on to {data.entries.length === 1 ? 'one server' : `${data.entries.length} servers`}.
                                </p>
                            </div>
                            <Button onClick={() => setLinking(true)}>
                                <NamedIcon name={'plus'} size={14} /> Link a server
                            </Button>
                        </div>

                        <div className={'mcs:grid mcs:gap-4 mcs:sm:grid-cols-2'}>
                            <label className={'mcs:flex mcs:flex-col mcs:gap-1'}>
                                <span className={'mcs:text-xs mcs:uppercase mcs:tracking-wide mcs:text-muted-foreground'}>Player forwarding</span>
                                <Select
                                    value={data.mode === 'none' ? 'none' : data.mode}
                                    disabled={data.type !== 'velocity'}
                                    onChange={(value) => value !== 'none' && saveSettings({ mode: value as 'modern' | 'legacy' })}
                                    options={[
                                        ...(data.mode === 'none' ? [{ value: 'none', label: 'Off until a server is linked' }] : []),
                                        { value: 'modern', label: 'Modern (Velocity, 1.13+)' },
                                        { value: 'legacy', label: 'Legacy (BungeeCord style)' },
                                    ]}
                                />
                                <span className={'mcs:text-xs mcs:text-muted-foreground'}>Linked servers are switched along with it.</span>
                            </label>
                            <div className={'mcs:flex mcs:items-end'}>
                                <Switch
                                    checked={data.onlineMode ?? true}
                                    onChange={(onlineMode) => saveSettings({ onlineMode })}
                                    label={'Premium accounts only'}
                                    description={'The proxy checks every player against Mojang. The servers behind it trust the proxy.'}
                                />
                            </div>
                        </div>

                        {bindWrong && (
                            <Alert type={'warning'}>
                                <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:justify-between mcs:gap-3'}>
                                    <span>
                                        The proxy listens on port {data.bind}, but this server&apos;s allocation is port {data.port}, so players cannot reach it.
                                    </span>
                                    <Button size={'small'} onClick={() => saveSettings({ fixBind: true })}>
                                        Listen on {data.port}
                                    </Button>
                                </div>
                            </Alert>
                        )}
                        {data.examples && <p className={'mcs:text-xs mcs:text-muted-foreground'}>The example servers {typeName} came with are replaced when you link the first server.</p>}
                    </div>

                    {ordered.length === 0 || data.examples ? (
                        <div className={'mcs:rounded-lg mcs:border mcs:border-dashed mcs:border-border mcs:p-8 mcs:text-center mcs:text-sm mcs:text-muted-foreground'}>
                            No servers linked yet.
                        </div>
                    ) : (
                        <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
                            {ordered.map((entry) => (
                                <EntryCard
                                    key={entry.name}
                                    entry={entry}
                                    server={entry.server}
                                    proxyType={data.type}
                                    order={entry.position ?? 0}
                                    onChange={(changes) => change(entry.name, changes)}
                                    onUnlink={() => setRemoving(entry.name)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {linking && (
                <LinkDialog
                    server={server}
                    side={'proxy'}
                    onClose={() => setLinking(false)}
                    onLinked={(targets) => {
                        setLinking(false);
                        setRestart(targets);
                        refresh();
                    }}
                />
            )}
            {confirmUnlink}
        </div>
    );
}
