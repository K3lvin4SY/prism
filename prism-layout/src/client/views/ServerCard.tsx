import { Badge, ProgressBar, Spinner, bytesToString, cn } from '@pterodactyl/sdk';
import { Slot, type ServerStatMetric, type ViewProps } from '@pterodactyl/sdk/theme';
import { useSettings } from '../settings';

const percent = ({ value, limit }: ServerStatMetric) => (limit > 0 ? Math.min((value / limit) * 100, 100) : null);

const POWER: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; dot: string }> = {
    running: { label: 'Online', tone: 'success', dot: 'pla:bg-success' },
    starting: { label: 'Starting', tone: 'warning', dot: 'pla:bg-warning' },
    stopping: { label: 'Stopping', tone: 'warning', dot: 'pla:bg-warning' },
    offline: { label: 'Offline', tone: 'danger', dot: 'pla:bg-destructive' },
};

/** A server's name, address, status and usage, laid out for the card style. */
export default function ServerCard({ model, server, Default }: ViewProps<'dashboard.serverCard'>) {
    const settings = useSettings();
    if (!settings.enabled) return <Default />;
    const { state } = model;
    const compact = settings.cards === 'compact' || settings.cards === 'rows';
    const power = state.kind === 'ready' ? (POWER[state.power] ?? POWER.offline) : null;

    const status =
        settings.status_style === 'bar' ? null : power ? (
            settings.status_style === 'dot' ? (
                <span className='pla:flex pla:items-center pla:gap-1.5 pla:text-xs pla:text-muted-foreground'>
                    <span className={cn('pla:size-2 pla:rounded-full', power.dot)} />
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
            <p className='pla:flex pla:gap-3 pla:text-xs pla:text-muted-foreground pla:tabular-nums'>
                <span>CPU {state.cpu.value.toFixed(0)}%</span>
                <span>{bytesToString(state.memory.value)}</span>
                <span>{bytesToString(state.disk.value)}</span>
            </p>
        ) : (
            <div className='pla:grid pla:grid-cols-3 pla:gap-3 pla:text-xs pla:text-muted-foreground'>
                {(
                    [
                        ['CPU', `${state.cpu.value.toFixed(0)}%`, state.cpu],
                        ['Memory', bytesToString(state.memory.value), state.memory],
                        ['Disk', bytesToString(state.disk.value), state.disk],
                    ] as const
                ).map(([label, text, metric]) => (
                    <div key={label} className='pla:space-y-1'>
                        <span>
                            {label} <span className='pla:text-foreground pla:tabular-nums'>{text}</span>
                        </span>
                        <ProgressBar value={percent(metric)} label={label} tone={metric.alarm ?? 'accent'} />
                    </div>
                ))}
            </div>
        );

    return (
        <div className={cn('pla:flex pla:gap-3', settings.cards === 'rows' ? 'pla:flex-row pla:flex-wrap pla:items-center' : 'pla:flex-col')}>
            <div className={cn('pla:flex pla:min-w-0 pla:gap-2', settings.cards === 'rows' ? 'pla:flex-1 pla:items-center' : 'pla:items-start')}>
                <div className='pla:min-w-0 pla:flex-1'>
                    <p className='pla:truncate pla:font-semibold'>{model.name}</p>
                    <p className='pla:truncate pla:font-mono pla:text-xs pla:text-muted-foreground'>{model.address ?? 'No address'}</p>
                    {!compact && model.description && <p className='pla:mt-1 pla:line-clamp-2 pla:text-xs pla:text-muted-foreground'>{model.description}</p>}
                </div>
                <Slot name='dashboard.serverRow.name.after' data={server} />
                {status}
            </div>
            {state.kind === 'loading' && <Spinner size='small' />}
            {usage}
        </div>
    );
}
