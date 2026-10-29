import { useId, useState, type ReactNode } from 'react';
import { cn } from '@pterodactyl/sdk';

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

const DRAG = 'application/x-prism-layout';
const nameOf = (layout: unknown) => LAYOUTS.find(([key]) => key === layout)?.[1] ?? 'None';

/**
 * Prism Layout's navigation for every kind of device: the eight layouts once, dragged onto the
 * computer, tablet and phone screens below, each of which gets its own copy. Clicking a layout and
 * then a screen does the same, for a keyboard or a touch screen.
 */
export default function NavigationBoard({ devices, onChange }: { devices: Device[]; onChange: (key: string, layout: string) => void }) {
    const [held, setHeld] = useState<string | null>(null);
    const [over, setOver] = useState<string | null>(null);

    return (
        <div className={'ppx:@container ppx:flex ppx:flex-col ppx:gap-4'}>
            <div>
                <p className={'ppx:text-sm ppx:font-medium'}>Layouts</p>
                <p className={'ppx:text-xs ppx:text-muted-foreground'}>Drag a layout onto a screen below, or click a layout and then a screen.</p>
            </div>
            <div className={'ppx:grid ppx:grid-cols-2 ppx:gap-2 ppx:@sm:grid-cols-4'}>
                {LAYOUTS.map(([layout, name]) => (
                    <button
                        key={layout}
                        type={'button'}
                        draggable
                        onDragStart={(event) => {
                            event.dataTransfer.setData(DRAG, layout);
                            event.dataTransfer.effectAllowed = 'copy';
                            setHeld(layout);
                        }}
                        onDragEnd={() => {
                            setHeld(null);
                            setOver(null);
                        }}
                        onClick={() => setHeld(held === layout ? null : layout)}
                        aria-pressed={held === layout}
                        className={cn(
                            'ppx:flex ppx:cursor-grab ppx:flex-col ppx:gap-1.5 ppx:rounded-xl ppx:border ppx:bg-background/60 ppx:p-1 ppx:pb-1.5 ppx:text-left ppx:transition-colors ppx:active:cursor-grabbing',
                            held === layout ? 'ppx:border-primary ppx:ring-1 ppx:ring-primary' : 'ppx:border-border ppx:hover:border-primary/60'
                        )}
                    >
                        <NavigationDrawing layout={layout} className={'ppx:pointer-events-none ppx:w-full'} />
                        <span className={'ppx-label ppx:px-1 ppx:text-[10px] ppx:leading-tight ppx:font-medium ppx:tracking-[0.1em] ppx:text-foreground/85 ppx:uppercase'}>{name}</span>
                    </button>
                ))}
            </div>
            <div className={'ppx:grid ppx:grid-cols-1 ppx:gap-3 ppx:@sm:grid-cols-3'}>
                {devices.map((device) => (
                    <button
                        key={device.key}
                        type={'button'}
                        onDragOver={(event) => {
                            if (!event.dataTransfer.types.includes(DRAG)) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'copy';
                            setOver(device.key);
                        }}
                        onDragLeave={() => setOver((current) => (current === device.key ? null : current))}
                        onDrop={(event) => {
                            event.preventDefault();
                            const layout = event.dataTransfer.getData(DRAG);
                            if (layout) onChange(device.key, layout);
                            setHeld(null);
                            setOver(null);
                        }}
                        onClick={() => {
                            if (!held) return;
                            onChange(device.key, held);
                            setHeld(null);
                        }}
                        aria-label={`${device.label}: ${nameOf(device.value)}${held ? `. Put ${nameOf(held)} here` : ''}`}
                        className={cn(
                            'ppx:flex ppx:flex-col ppx:gap-2 ppx:rounded-2xl ppx:border-2 ppx:border-dashed ppx:p-2 ppx:text-left ppx:transition-colors',
                            over === device.key ? 'ppx:border-primary ppx:bg-primary/10' : held ? 'ppx:cursor-pointer ppx:border-primary/50' : 'ppx:cursor-default ppx:border-border'
                        )}
                    >
                        <NavigationDrawing layout={String(device.value)} className={'ppx:pointer-events-none ppx:w-full'} />
                        <span className={'ppx-label ppx:px-1 ppx:text-[10px] ppx:leading-tight ppx:font-medium ppx:tracking-[0.1em] ppx:text-primary ppx:uppercase'}>{nameOf(device.value)}</span>
                        <span className={'ppx:px-1'}>
                            <span className={'ppx:block ppx:text-sm ppx:font-medium'}>{device.label}</span>
                            {device.help && <span className={'ppx:block ppx:text-xs ppx:text-muted-foreground'}>{device.help}</span>}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
