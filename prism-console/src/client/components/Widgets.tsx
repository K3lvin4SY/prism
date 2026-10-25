import { useState } from 'react';
import { Badge, Button, Dialog, bytesToString, cn, toast, useSendServerCommand, useServerPermission, useServerResources, type SdkServer } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import type { QuickCommand } from '../config';
import { useStore, type ServerConsoleStore, type StatsSample } from '../store';

const box = 'pt-surface pcn:rounded-lg pcn:border pcn:border-border pcn:bg-card';

function Sparkline({ values, max, className }: { values: number[]; max?: number; className?: string }) {
    if (values.length < 2) return <div className={className} />;
    const top = Math.max(max ?? 0, ...values, 1);
    const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${30 - (value / top) * 28}`).join(' ');

    return (
        <svg viewBox={'0 0 100 30'} preserveAspectRatio={'none'} className={className} aria-hidden>
            <polygon points={`0,30 ${points} 100,30`} className={'pcn:fill-primary/15'} />
            <polyline points={points} fill={'none'} className={'pcn:stroke-primary'} strokeWidth={1.5} vectorEffect={'non-scaling-stroke'} />
        </svg>
    );
}

function uptime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return days > 0 ? `${days}d ${hours}h` : `${hours}:${String(minutes).padStart(2, '0')}`;
}

/** Network bytes per second from the last two samples. */
function rate(samples: StatsSample[], key: 'rx' | 'tx'): number[] {
    const values: number[] = [];
    // Over five samples: the node updates its network counters less often than it sends stats,
    // so neighbouring readings alternate between zero and twice the real rate.
    const window = 5;
    for (let i = 1; i < samples.length; i++) {
        const from = samples[Math.max(0, i - window)];
        const seconds = Math.max(1, (samples[i].time - from.time) / 1000);
        values.push(Math.max(0, (samples[i][key] - from[key]) / seconds));
    }

    return values;
}

function useUsage(server: SdkServer, store: ServerConsoleStore) {
    useStore(store);
    const initial = useServerResources(server.attributes.uuid);
    const last = store.samples[store.samples.length - 1];
    const resources = initial.data?.attributes.resources;
    const limits = server.attributes.limits;

    return {
        state: store.state ?? initial.data?.attributes.current_state ?? 'offline',
        cpu: last?.cpu ?? resources?.cpu_absolute ?? 0,
        memory: last?.memory ?? resources?.memory_bytes ?? 0,
        disk: last?.disk ?? resources?.disk_bytes ?? 0,
        uptime: store.uptime || resources?.uptime || 0,
        rx: rate(store.samples, 'rx'),
        tx: rate(store.samples, 'tx'),
        limits: { cpu: limits.cpu, memory: limits.memory * 1048576, disk: limits.disk * 1048576 },
    };
}

/** CPU, memory, disk, network and uptime, in a row or a column. */
export function Tiles({ server, store, vertical, compact, sparklines = true }: { server: SdkServer; store: ServerConsoleStore; vertical?: boolean; compact?: boolean; sparklines?: boolean }) {
    const usage = useUsage(server, store);
    const offline = usage.state === 'offline';
    const network = usage.rx[usage.rx.length - 1] ?? 0;

    const tiles = [
        { icon: 'cpu', label: 'CPU', value: offline ? 'Offline' : `${usage.cpu.toFixed(1)}%`, limit: usage.limits.cpu ? `/ ${usage.limits.cpu}%` : null, fraction: usage.limits.cpu ? usage.cpu / usage.limits.cpu : null, spark: store.samples.map((sample) => sample.cpu) },
        { icon: 'memory-stick', label: 'Memory', value: offline ? 'Offline' : bytesToString(usage.memory), limit: usage.limits.memory ? `/ ${bytesToString(usage.limits.memory)}` : null, fraction: usage.limits.memory ? usage.memory / usage.limits.memory : null, spark: store.samples.map((sample) => sample.memory) },
        { icon: 'hard-drive', label: 'Disk', value: bytesToString(usage.disk), limit: usage.limits.disk ? `/ ${bytesToString(usage.limits.disk)}` : null, fraction: usage.limits.disk ? usage.disk / usage.limits.disk : null, spark: null },
        { icon: 'arrow-down-up', label: 'Network', value: `↓ ${bytesToString(network)}/s`, limit: `↑ ${bytesToString(usage.tx[usage.tx.length - 1] ?? 0)}/s`, fraction: null, spark: usage.rx },
        { icon: 'timer', label: 'Uptime', value: offline ? 'Offline' : uptime(usage.uptime), limit: null, fraction: null, spark: null },
    ];

    return (
        <div className={cn('pcn:grid pcn:gap-2', vertical ? 'pcn:grid-cols-1' : compact ? 'pcn:grid-cols-2 pcn:sm:grid-cols-5' : 'pcn:grid-cols-2 pcn:md:grid-cols-5')}>
            {tiles.map((tile) => (
                <div key={tile.label} className={cn(box, 'pcn:relative pcn:overflow-hidden', compact ? 'pcn:px-3 pcn:py-2' : 'pcn:p-3')}>
                    <div className={'pcn:flex pcn:items-center pcn:gap-1.5 pcn:text-xs pcn:uppercase pcn:tracking-wide pcn:text-muted-foreground'}>
                        <NamedIcon name={tile.icon} size={12} /> {tile.label}
                    </div>
                    <div className={cn('pcn:mt-1 pcn:font-semibold pcn:tabular-nums', compact ? 'pcn:text-base' : 'pcn:text-xl')}>{tile.value}</div>
                    {tile.limit && !compact && <div className={'pcn:text-xs pcn:text-muted-foreground'}>{tile.limit}</div>}
                    {tile.fraction !== null && (
                        <div className={'pcn:mt-2 pcn:h-1 pcn:overflow-hidden pcn:rounded-full pcn:bg-muted'}>
                            <div className={cn('pcn:h-full pcn:rounded-full', tile.fraction > 0.9 ? 'pcn:bg-red-500' : tile.fraction > 0.75 ? 'pcn:bg-amber-500' : 'pcn:bg-primary')} style={{ width: `${Math.min(100, tile.fraction * 100)}%` }} />
                        </div>
                    )}
                    {tile.spark && tile.fraction === null && sparklines && !compact && <Sparkline values={tile.spark} className={'pcn:pointer-events-none pcn:absolute pcn:bottom-0 pcn:right-0 pcn:h-8 pcn:w-1/2 pcn:opacity-60'} />}
                </div>
            ))}
        </div>
    );
}

/** Larger live charts of CPU, memory and network. */
export function Charts({ server, store, vertical }: { server: SdkServer; store: ServerConsoleStore; vertical?: boolean }) {
    const usage = useUsage(server, store);
    const charts = [
        { label: 'CPU load', value: `${usage.cpu.toFixed(1)}%`, values: store.samples.map((sample) => sample.cpu), max: usage.limits.cpu || undefined },
        { label: 'Memory', value: bytesToString(usage.memory), values: store.samples.map((sample) => sample.memory), max: usage.limits.memory || undefined },
        { label: 'Network in', value: `${bytesToString(usage.rx[usage.rx.length - 1] ?? 0)}/s`, values: usage.rx },
    ];

    return (
        <div className={cn('pcn:grid pcn:gap-3', vertical ? 'pcn:grid-cols-1' : 'pcn:md:grid-cols-3')}>
            {charts.map((chart) => (
                <div key={chart.label} className={cn(box, 'pcn:p-3')}>
                    <div className={'pcn:mb-2 pcn:flex pcn:items-baseline pcn:justify-between pcn:text-sm'}>
                        <span className={'pcn:font-semibold'}>{chart.label}</span>
                        <span className={'pcn:tabular-nums pcn:text-muted-foreground'}>{chart.value}</span>
                    </div>
                    {chart.values.length < 2 ? (
                        <div className={'pcn:flex pcn:h-20 pcn:items-center pcn:justify-center pcn:text-xs pcn:text-muted-foreground'}>Waiting for readings…</div>
                    ) : (
                        <Sparkline values={chart.values} max={chart.max} className={'pcn:h-20 pcn:w-full'} />
                    )}
                </div>
            ))}
        </div>
    );
}

const STATES: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
    running: { label: 'Running', tone: 'success' },
    starting: { label: 'Starting', tone: 'warning' },
    stopping: { label: 'Stopping', tone: 'warning' },
    offline: { label: 'Offline', tone: 'danger' },
};

export function Info({ server, store }: { server: SdkServer; store: ServerConsoleStore }) {
    const usage = useUsage(server, store);
    const allocation = (server.attributes.relationships?.allocations as { data?: { attributes: { ip: string; ip_alias: string | null; port: number; is_default: boolean } }[] } | undefined)?.data?.find(
        (entry) => entry.attributes.is_default
    )?.attributes;
    const state = STATES[usage.state] ?? { label: usage.state, tone: 'neutral' as const };

    return (
        <div className={cn(box, 'pcn:flex pcn:flex-col pcn:gap-2 pcn:p-3 pcn:text-sm')}>
            <div className={'pcn:flex pcn:items-center pcn:justify-between pcn:gap-2'}>
                <span className={'pcn:truncate pcn:font-semibold'}>{server.attributes.name}</span>
                <Badge size={'sm'} tone={state.tone}>
                    {state.label}
                </Badge>
            </div>
            <dl className={'pcn:grid pcn:grid-cols-[auto_1fr] pcn:gap-x-3 pcn:gap-y-1 pcn:text-xs'}>
                {allocation && (
                    <>
                        <dt className={'pcn:text-muted-foreground'}>Address</dt>
                        <dd className={'pcn:truncate pcn:font-mono'}>
                            {allocation.ip_alias ?? allocation.ip}:{allocation.port}
                        </dd>
                    </>
                )}
                <dt className={'pcn:text-muted-foreground'}>Node</dt>
                <dd className={'pcn:truncate'}>{server.attributes.node}</dd>
                <dt className={'pcn:text-muted-foreground'}>Image</dt>
                <dd className={'pcn:truncate pcn:font-mono'} title={server.attributes.docker_image}>
                    {server.attributes.docker_image.split('/').pop()}
                </dd>
            </dl>
        </div>
    );
}

/** Buttons that send a command, asking first when the button says so. */
export function QuickCommands({ server, commands, compact }: { server: SdkServer; commands: QuickCommand[]; compact?: boolean }) {
    const canSend = useServerPermission('control.console');
    const send = useSendServerCommand(server.attributes.uuid);
    const [confirming, setConfirming] = useState<QuickCommand | null>(null);
    const tags = server.attributes.egg_tags.map((tag) => tag.toLowerCase());
    const shown = commands.filter((command) => command.command && (command.tags.filter(Boolean).length === 0 || command.tags.some((tag) => tags.includes(tag.toLowerCase()))));

    if (!canSend || shown.length === 0) return null;

    const run = (command: QuickCommand) =>
        send
            .mutateAsync({ command: command.command })
            .then(() => toast.success(`Sent ${command.command}`))
            .catch(() => toast.error('The command could not be sent. Is the server running?'));

    return (
        <div className={cn(box, compact ? 'pcn:p-2' : 'pcn:p-3')}>
            {!compact && <p className={'pcn:mb-2 pcn:text-xs pcn:uppercase pcn:tracking-wide pcn:text-muted-foreground'}>Quick commands</p>}
            <div className={'pcn:flex pcn:flex-wrap pcn:gap-1.5'}>
                {shown.map((command, index) => (
                    <Button key={index} size={'small'} isSecondary onClick={() => (command.confirm ? setConfirming(command) : run(command))} title={command.command}>
                        {command.label || command.command}
                    </Button>
                ))}
            </div>
            <Dialog.Confirm
                open={confirming !== null}
                onClose={() => setConfirming(null)}
                title={`Run ${confirming?.label || confirming?.command}?`}
                confirm={'Run'}
                onConfirmed={() => {
                    if (confirming) run(confirming);
                    setConfirming(null);
                }}
            >
                This sends <code className={'pcn:font-mono'}>{confirming?.command}</code> to the server.
            </Dialog.Confirm>
        </div>
    );
}

/** Image pull progress as one card, with the speed and time left. */
export function PullCard({ store, floating }: { store: ServerConsoleStore; floating?: boolean }) {
    useStore(store);
    const progress = store.pullProgress;
    if (!progress) return null;

    const fraction = progress.total > 0 ? progress.current / progress.total : progress.layers > 0 ? progress.done / progress.layers : 0;
    const left = progress.speed > 0 && progress.total > progress.current ? Math.ceil((progress.total - progress.current) / progress.speed) : null;

    return (
        <div className={cn(box, 'pcn:flex pcn:flex-col pcn:gap-2 pcn:p-3 pcn:text-sm', floating && 'pcn:fixed pcn:bottom-4 pcn:right-4 pcn:z-40 pcn:w-80 pcn:shadow-2xl')}>
            <div className={'pcn:flex pcn:items-center pcn:gap-2'}>
                <NamedIcon name={progress.finished ? 'circle-check' : 'download'} size={16} className={progress.finished ? 'pcn:text-success' : 'pcn:text-primary'} />
                <span className={'pcn:flex-1 pcn:font-semibold'}>{progress.finished ? 'Image pulled' : 'Pulling the server image'}</span>
                <button type={'button'} onClick={() => store.dismissPull()} aria-label={'Hide'} className={'pcn:cursor-pointer pcn:text-muted-foreground pcn:hover:text-foreground'}>
                    <NamedIcon name={'x'} size={14} />
                </button>
            </div>
            {progress.image && <p className={'pcn:truncate pcn:font-mono pcn:text-xs pcn:text-muted-foreground'}>{progress.image}</p>}
            <div className={'pcn:h-1.5 pcn:overflow-hidden pcn:rounded-full pcn:bg-muted'}>
                <div className={'pcn:h-full pcn:rounded-full pcn:bg-primary pcn:transition-all'} style={{ width: `${Math.round((progress.finished ? 1 : fraction) * 100)}%` }} />
            </div>
            <p className={'pcn:text-xs pcn:text-muted-foreground'}>
                {progress.done}/{progress.layers} layers
                {progress.total > 0 && ` · ${bytesToString(progress.current)} of ${bytesToString(progress.total)}`}
                {!progress.finished && progress.speed > 0 && ` · ${bytesToString(progress.speed)}/s`}
                {!progress.finished && left !== null && ` · about ${left < 60 ? `${left}s` : `${Math.ceil(left / 60)} min`} left`}
            </p>
        </div>
    );
}
