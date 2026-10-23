import { Badge, ProgressBar, Spinner, bytesToString, cn } from '@pterodactyl/sdk';
import { Slot, type ServerStatMetric, type ViewProps } from '@pterodactyl/sdk/theme';
import { useSettings } from '../settings';

const percent = ({ value, limit }: ServerStatMetric) => (limit > 0 ? Math.min((value / limit) * 100, 100) : null);

const POWER: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; dot: string }> = {
    running: { label: 'Online', tone: 'success', dot: 'bg-success' },
    starting: { label: 'Starting', tone: 'warning', dot: 'bg-warning' },
    stopping: { label: 'Stopping', tone: 'warning', dot: 'bg-warning' },
    offline: { label: 'Offline', tone: 'danger', dot: 'bg-destructive' },
};

/** A server's name, address, status and usage, laid out for the card style. */
export default function ServerCard({ model, server }: ViewProps<'dashboard.serverCard'>) {
    const settings = useSettings();
    const { state } = model;
    const compact = settings.cards === 'compact' || settings.cards === 'rows';
    const power = state.kind === 'ready' ? (POWER[state.power] ?? POWER.offline) : null;

    const status =
        settings.status_style === 'bar' ? null : power ? (
            settings.status_style === 'dot' ? (
                <span className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                    <span className={cn('size-2 rounded-full', power.dot)} />
                    {power.label}
                </span>
            ) : (
                <Badge size='sm' tone={power.tone} variant='soft'>
                    {power.label}
                </Badge>
            )
        ) : state.kind === 'unavailable' ? (
            <Badge size='sm' tone='warning'>
                {state.reason.replace('-', ' ')}
            </Badge>
        ) : null;

    const usage =
        state.kind !== 'ready' || settings.usage_style === 'hidden' ? null : settings.usage_style === 'numbers' || compact ? (
            <p className='flex gap-3 text-xs text-muted-foreground tabular-nums'>
                <span>CPU {state.cpu.value.toFixed(0)}%</span>
                <span>{bytesToString(state.memory.value)}</span>
                <span>{bytesToString(state.disk.value)}</span>
            </p>
        ) : (
            <div className='grid grid-cols-3 gap-3 text-xs text-muted-foreground'>
                {(
                    [
                        ['CPU', `${state.cpu.value.toFixed(0)}%`, state.cpu],
                        ['Memory', bytesToString(state.memory.value), state.memory],
                        ['Disk', bytesToString(state.disk.value), state.disk],
                    ] as const
                ).map(([label, text, metric]) => (
                    <div key={label} className='space-y-1'>
                        <span>
                            {label} <span className='text-foreground tabular-nums'>{text}</span>
                        </span>
                        <ProgressBar value={percent(metric)} label={label} tone={metric.alarm ?? 'accent'} />
                    </div>
                ))}
            </div>
        );

    return (
        <div className={cn('flex gap-3', settings.cards === 'rows' ? 'flex-row flex-wrap items-center' : 'flex-col')}>
            <div className={cn('flex min-w-0 items-start gap-2', settings.cards === 'rows' && 'flex-1')}>
                <div className='min-w-0 flex-1'>
                    <p className='truncate font-semibold'>{model.name}</p>
                    <p className='truncate font-mono text-xs text-muted-foreground'>{model.address ?? 'No address'}</p>
                    {!compact && model.description && <p className='mt-1 line-clamp-2 text-xs text-muted-foreground'>{model.description}</p>}
                </div>
                <Slot name='dashboard.serverRow.name.after' data={server} />
                {status}
            </div>
            {state.kind === 'loading' && <Spinner size='small' />}
            {usage}
        </div>
    );
}
