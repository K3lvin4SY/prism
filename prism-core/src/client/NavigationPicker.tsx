import { useId, useState, type ReactNode } from 'react';
import { cn } from '@pterodactyl/sdk';
import { NamedIcon } from './icons';

/** Prism Layout's navigation layouts, named as the cards show them. */
const LAYOUTS: [string, string][] = [
    ['sidebar', 'Sidebar'],
    ['top', 'Top bar'],
    ['dock', 'Dock'],
    ['dock_expand', 'Expandable dock'],
    ['sidebar_top', 'Sidebar + top bar'],
    ['rail', 'Rail'],
    ['rail_top', 'Rail + top bar'],
    ['top_dock', 'Top bar + dock'],
];

/** The screen each drawing sits in, with Prism's own drawings' sizes: bars, the sidebar, the rail, padding. */
const W = 187;
const H = 120;
const BAR = 18;
const SIDE = 40;
const RAIL = 18;
const PAD = 10;

/** A grid of pages between two corners, three across and two down. */
function cells(x0: number, y0: number, x1: number, y1: number, gap = 6): ReactNode[] {
    const width = (x1 - x0 - gap * 2) / 3;
    const height = (y1 - y0 - gap) / 2;

    return Array.from({ length: 6 }, (_, index) => (
        <rect key={index} x={x0 + (index % 3) * (width + gap)} y={y0 + Math.floor(index / 3) * (height + gap)} width={width} height={height} rx={4} className={'ppx-nav-cell'} />
    ));
}

/** The dock along the bottom. */
const dock = (width: number, opacity = 1) => <rect key={'dock'} x={(W - width) / 2} y={93} width={width} height={18} rx={9} fill={'var(--primary)'} opacity={opacity} />;

/** What each layout draws inside the screen: its bars in the primary color, and the pages. */
function shapes(layout: string): ReactNode {
    const primary = 'var(--primary)';
    const top = <rect key={'top'} x={0} y={0} width={W} height={BAR} fill={primary} />;
    switch (layout) {
        case 'sidebar':
            return [<rect key={'side'} x={0} y={0} width={SIDE} height={H} fill={primary} />, ...cells(SIDE + PAD, PAD, W - PAD, H - PAD)];
        case 'top':
            return [top, ...cells(PAD, BAR + PAD, W - PAD, H - PAD)];
        case 'dock':
            return [...cells(PAD, PAD, W - PAD, 84), dock(74.8)];
        case 'dock_expand':
            // Opened: the pages of the area rise from the wider dock.
            return [...cells(PAD, PAD, W - PAD, 84), <rect key={'open'} x={74.8} y={48} width={37.4} height={40} rx={7} fill={primary} opacity={0.55} />, dock(104.8)];
        case 'sidebar_top':
            return [<rect key={'side'} x={0} y={BAR} width={SIDE} height={H - BAR} fill={primary} opacity={0.5} />, top, ...cells(SIDE + PAD, BAR + PAD, W - PAD, H - PAD)];
        case 'rail':
            return [<rect key={'rail'} x={0} y={0} width={RAIL} height={H} fill={primary} />, ...cells(RAIL + PAD, PAD, W - PAD, H - PAD)];
        case 'rail_top':
            return [<rect key={'rail'} x={0} y={BAR} width={RAIL} height={H - BAR} fill={primary} opacity={0.5} />, top, ...cells(RAIL + PAD, BAR + PAD, W - PAD, H - PAD)];
        case 'top_dock':
            return [top, ...cells(PAD, BAR + PAD, W - PAD, 84), dock(74.8, 0.5)];
        default:
            return cells(PAD, PAD, W - PAD, H - PAD);
    }
}

/** A small screen with the layout's bars, clipped to its rounded corners so every corner stays round. */
export function NavigationDrawing({ layout, className }: { layout: string; className?: string }) {
    const clip = useId();

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden>
            <defs>
                <clipPath id={clip}>
                    <rect width={W} height={H} rx={9} />
                </clipPath>
            </defs>
            <g clipPath={`url(#${clip})`}>
                <rect width={W} height={H} className={'ppx-nav-screen'} />
                {shapes(layout)}
            </g>
        </svg>
    );
}

/** A kind of device and the navigation it has now. */
export interface Device {
    key: string;
    label: string;
    help: string | null;
    value: unknown;
}

const DRAG = 'application/x-prism-device';
const nameOf = (layout: unknown) => LAYOUTS.find(([key]) => key === layout)?.[1] ?? 'None';

/** The chip each device is dragged by: Prism Layout's settings for computers, tablets and phones, or the device's own label. */
const chipOf = (device: Device): [string, string] => {
    if (device.key.endsWith('_mobile')) return ['smartphone', 'Mobile'];
    if (device.key.endsWith('_tablet')) return ['tablet', 'Tablet'];
    if (device.key === 'bars') return ['monitor', 'PC'];

    return ['monitor', device.label];
};

/**
 * Prism Layout's navigation for every kind of device: the eight layouts once, with the PC, tablet and
 * mobile chips sitting on the layout each one uses. Dragging a chip onto another layout moves it there;
 * clicking a chip and then a layout does the same, for a keyboard or a touch screen.
 */
export default function NavigationBoard({ devices, onChange }: { devices: Device[]; onChange: (key: string, layout: string) => void }) {
    const [held, setHeld] = useState<string | null>(null);
    const [over, setOver] = useState<string | null>(null);
    const holding = devices.find((device) => device.key === held);

    const place = (key: string, layout: string) => {
        onChange(key, layout);
        setHeld(null);
        setOver(null);
    };

    return (
        <div className={'ppx:@container ppx:flex ppx:flex-col ppx:gap-4'}>
            <div>
                <p className={'ppx:text-sm ppx:font-medium'}>Layouts</p>
                <p className={'ppx:text-xs ppx:text-muted-foreground'}>Drag PC, tablet or mobile onto a layout, or click one and then a layout.</p>
            </div>
            <div className={'ppx:grid ppx:grid-cols-2 ppx:gap-2 ppx:@sm:grid-cols-4'}>
                {LAYOUTS.map(([layout, name]) => {
                    const here = devices.filter((device) => device.value === layout);

                    return (
                        <div
                            key={layout}
                            onDragOver={(event) => {
                                if (!event.dataTransfer.types.includes(DRAG)) return;
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'move';
                                setOver(layout);
                            }}
                            onDragLeave={(event) => {
                                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                                setOver((current) => (current === layout ? null : current));
                            }}
                            onDrop={(event) => {
                                event.preventDefault();
                                const key = event.dataTransfer.getData(DRAG);
                                if (key) place(key, layout);
                            }}
                            className={cn(
                                'ppx:flex ppx:flex-col ppx:gap-1.5 ppx:rounded-xl ppx:border ppx:bg-background/60 ppx:p-1 ppx:pb-1.5 ppx:transition-colors',
                                over === layout ? 'ppx:border-primary ppx:bg-primary/10 ppx:ring-1 ppx:ring-primary' : held ? 'ppx:border-primary/50' : 'ppx:border-border'
                            )}
                        >
                            <button
                                type={'button'}
                                disabled={!holding}
                                onClick={() => holding && place(holding.key, layout)}
                                aria-label={holding ? `Put ${chipOf(holding)[1]} on ${name}` : name}
                                className={cn('ppx:flex ppx:flex-col ppx:gap-1.5 ppx:text-left', holding ? 'ppx:cursor-pointer' : 'ppx:cursor-default')}
                            >
                                <NavigationDrawing layout={layout} className={'ppx:pointer-events-none ppx:w-full'} />
                                <span className={'ppx-label ppx:px-1 ppx:text-[10px] ppx:leading-tight ppx:font-medium ppx:tracking-[0.1em] ppx:text-foreground/85 ppx:uppercase'}>{name}</span>
                            </button>
                            <div className={'ppx:flex ppx:min-h-6 ppx:flex-wrap ppx:gap-1 ppx:px-0.5'}>
                                {here.map((device) => {
                                    const [icon, label] = chipOf(device);

                                    return (
                                        <button
                                            key={device.key}
                                            type={'button'}
                                            draggable
                                            onDragStart={(event) => {
                                                event.dataTransfer.setData(DRAG, device.key);
                                                event.dataTransfer.effectAllowed = 'move';
                                                setHeld(device.key);
                                            }}
                                            onDragEnd={() => {
                                                setHeld(null);
                                                setOver(null);
                                            }}
                                            onClick={() => setHeld(held === device.key ? null : device.key)}
                                            aria-pressed={held === device.key}
                                            aria-label={`${device.label}: ${nameOf(device.value)}`}
                                            title={device.help ? `${device.label}. ${device.help}` : device.label}
                                            className={cn(
                                                'ppx:inline-flex ppx:h-6 ppx:cursor-grab ppx:items-center ppx:gap-1 ppx:rounded-md ppx:px-1.5 ppx:text-[10px] ppx:font-semibold ppx:tracking-[0.08em] ppx:uppercase ppx:transition-colors ppx:active:cursor-grabbing',
                                                held === device.key ? 'ppx:bg-primary ppx:text-primary-foreground' : 'ppx:bg-primary/15 ppx:text-primary ppx:hover:bg-primary/25'
                                            )}
                                        >
                                            <NamedIcon name={icon} size={13} />
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
