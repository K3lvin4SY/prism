import { Spinner, cn } from '@pterodactyl/sdk';
import { Slot, type ServerCardState, type ServerStatMetric, type ViewProps } from '@pterodactyl/sdk/theme';
import { NamedIcon } from '../icons';
import { GameLogo } from '../logos';
import { useSettings, type LayoutSettings } from '../settings';
import { useCardGame, type CardGame } from './cardContext';

const percent = ({ value, limit }: ServerStatMetric) => (limit > 0 ? Math.min((value / limit) * 100, 100) : 0);

const POWER: Record<string, { label: string; text: string; soft: string; dot: string }> = {
    running: { label: 'Online', text: 'pla:text-success', soft: 'pla:bg-success/15', dot: 'pla:bg-success' },
    starting: { label: 'Starting', text: 'pla:text-warning', soft: 'pla:bg-warning/15', dot: 'pla:bg-warning' },
    stopping: { label: 'Stopping', text: 'pla:text-warning', soft: 'pla:bg-warning/15', dot: 'pla:bg-warning' },
    offline: { label: 'Offline', text: 'pla:text-destructive', soft: 'pla:bg-destructive/15', dot: 'pla:bg-destructive' },
};

type Ready = Extract<ServerCardState, { kind: 'ready' }>;

const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

/** Bytes short enough for a card: one decimal under 100, none above, as 566 MiB or 1.5 GiB. */
export function shortBytes(bytes: number): string {
    let value = Math.max(0, bytes);
    let unit = 0;
    while (value >= 1024 && unit < UNITS.length - 1) {
        value /= 1024;
        unit++;
    }

    return `${unit === 0 || value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')} ${UNITS[unit]}`;
}

/** CPU, memory and disk, with the words each layout uses. */
const metrics = (state: Ready) =>
    [
        ['CPU', `${state.cpu.value.toFixed(0)}%`, state.cpu],
        ['RAM', shortBytes(state.memory.value), state.memory],
        ['Disk', shortBytes(state.disk.value), state.disk],
    ] as const;

const fill = (metric: ServerStatMetric) => (metric.alarm === 'danger' ? 'pla:bg-destructive' : metric.alarm === 'warning' ? 'pla:bg-warning' : 'pla:bg-primary');

function Bar({ metric, className }: { metric: ServerStatMetric; className?: string }) {
    return (
        <span className={cn('pla:block pla:h-1.5 pla:overflow-hidden pla:rounded-full pla:bg-secondary', className)}>
            <span className={cn('pla:block pla:h-full pla:rounded-full', fill(metric))} style={{ width: `${percent(metric)}%` }} />
        </span>
    );
}

function Status({ state, style }: { state: ServerCardState; style: LayoutSettings['status_style'] }) {
    if (style === 'bar') return null;
    if (state.kind === 'unavailable')
        return <span className='pla:inline-flex pla:rounded-full pla:bg-warning/15 pla:px-2.5 pla:py-0.5 pla:text-xs pla:font-semibold pla:whitespace-nowrap pla:text-warning pla:capitalize'>{state.reason.replace('-', ' ')}</span>;
    if (state.kind !== 'ready') return <Spinner size='small' />;
    const power = POWER[state.power] ?? POWER.offline;

    return style === 'dot' ? (
        <span className={cn('pla:inline-flex pla:items-center pla:gap-1.5 pla:text-sm pla:whitespace-nowrap', power.text)}>
            <span className={cn('pla:size-2 pla:rounded-full', power.dot)} />
            {power.label}
        </span>
    ) : (
        <span className={cn('pla:inline-flex pla:rounded-full pla:px-2.5 pla:py-0.5 pla:text-xs pla:font-semibold pla:whitespace-nowrap', power.soft, power.text)}>{power.label}</span>
    );
}

/** The game's logo, its color, or nothing, by the "Show the game on cards" setting. */
function Mark({ game, mark, size }: { game: CardGame | null; mark: LayoutSettings['egg_colors']; size: number }) {
    if (mark === 'logo') return <GameLogo logo={game?.logo ?? null} tags={game?.tags} size={size} className='pla:rounded-lg' />;
    if (mark === 'color' && game?.color)
        return (
            <span style={{ width: size, height: size }} className='pla:flex pla:shrink-0 pla:items-center pla:justify-center pla:rounded-lg pla:bg-[color-mix(in_oklab,var(--pla-egg)_22%,transparent)] pla:text-(--pla-egg)' aria-hidden>
                <NamedIcon name='gamepad-2' size={Math.round(size * 0.5)} />
            </span>
        );

    return null;
}

/** A server's game, name, status and usage: cells of the list's grid on rows, the body of a tile. */
export default function ServerCard({ model, server, Default }: ViewProps<'dashboard.serverCard'>) {
    const settings = useSettings();
    const game = useCardGame();
    if (!settings.enabled) return <Default />;
    const { state } = model;
    const ready = state.kind === 'ready' ? state : null;
    const offline = ready?.power === 'offline';
    const usage = settings.usage_style;

    if (settings.cards === 'rows')
        return (
            <div className='pla-row-cells'>
                <span className='pla-row-mark'>
                    <Mark game={game} mark={settings.egg_colors} size={36} />
                </span>
                <span className='pla-row-name pla:flex pla:min-w-0 pla:items-center pla:gap-2'>
                    <span className='pla:min-w-0'>
                        <span className='pla:block pla:truncate pla:font-semibold'>{model.name}</span>
                        <span className='pla:block pla:truncate pla:font-mono pla:text-xs pla:text-muted-foreground'>{model.address ?? 'No address'}</span>
                    </span>
                    <Slot name='dashboard.serverRow.name.after' data={server} />
                </span>
                <span className='pla-row-game pla:truncate pla:text-sm pla:text-muted-foreground'>{game?.game}</span>
                <span className='pla-row-status'>
                    <Status state={state} style={settings.status_style} />
                </span>
                <span className={cn('pla-row-usage pla:min-w-0', offline && 'pla:opacity-60')}>
                    {ready && usage === 'numbers' && (
                        <span className='pla:block pla:truncate pla:font-mono pla:text-xs pla:text-muted-foreground pla:tabular-nums'>
                            {metrics(ready)
                                .map(([label, text]) => `${label} ${text}`)
                                .join(' · ')}
                        </span>
                    )}
                    {ready && usage === 'bars' && (
                        <span className='pla:grid pla:grid-cols-3 pla:gap-3'>
                            {metrics(ready).map(([label, text, metric]) => (
                                <span key={label} className='pla:min-w-0' title={`${label} ${text}`}>
                                    <span className='pla:mb-1 pla:block pla:truncate pla:font-mono pla:text-[11px] pla:text-muted-foreground pla:tabular-nums'>
                                        {label} {text}
                                    </span>
                                    <Bar metric={metric} />
                                </span>
                            ))}
                        </span>
                    )}
                </span>
            </div>
        );

    const subtitle = [game?.game, model.address].filter(Boolean);

    return (
        <div className='pla:flex pla:flex-col pla:gap-4'>
            <div className='pla:flex pla:items-center pla:gap-3.5'>
                <Mark game={game} mark={settings.egg_colors} size={44} />
                <div className='pla:min-w-0 pla:flex-1'>
                    <p className='pla:truncate pla:text-lg pla:leading-tight pla:font-bold'>{model.name}</p>
                    <p className='pla:truncate pla:text-sm pla:text-muted-foreground'>
                        {subtitle.length > 0 ? subtitle.join(' · ') : 'No address'}
                    </p>
                </div>
                <Slot name='dashboard.serverRow.name.after' data={server} />
                <Status state={state} style={settings.status_style} />
            </div>
            {ready && usage === 'bars' && (
                <div className={cn('pla:grid pla:grid-cols-[auto_1fr] pla:items-center pla:gap-x-4 pla:gap-y-2.5', offline && 'pla:opacity-60')}>
                    {metrics(ready).map(([label, text, metric]) => (
                        <div key={label} className='pla:contents' title={`${label} ${text}`}>
                            <span className='pla:text-sm pla:text-muted-foreground'>{label}</span>
                            <Bar metric={metric} />
                        </div>
                    ))}
                </div>
            )}
            {ready && usage === 'numbers' && (
                <div className={cn('pla:grid pla:grid-cols-3 pla:gap-2.5', offline && 'pla:opacity-60')}>
                    {metrics(ready).map(([label, text]) => (
                        <div key={label} className='pla:min-w-0 pla:rounded-lg pla:bg-muted/60 pla:px-3 pla:py-2.5'>
                            <p className='pla:text-xs pla:text-muted-foreground'>{label}</p>
                            <p className='pla:truncate pla:text-lg pla:font-bold pla:tabular-nums'>{text}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
