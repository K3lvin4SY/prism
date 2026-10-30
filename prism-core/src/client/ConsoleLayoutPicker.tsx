import { cn } from '@pterodactyl/sdk';

/*
 * Prism Console's default layout, picked from small drawings of each: the terminal dark, every
 * other widget in the primary color. The layouts and the drawing mirror Prism Console's own
 * (prism-console/src/client/layouts.ts and components/LayoutPreview.tsx); change them together.
 */

type Widget = 'terminal' | 'power' | 'info' | 'tiles' | 'charts';
type Area = 'top' | 'main' | 'side' | 'bottom';

const LAYOUTS: Record<string, { widgets: [Widget, Area][]; compact?: boolean }> = {
    classic: { widgets: [['terminal', 'main'], ['power', 'side'], ['tiles', 'side'], ['info', 'side'], ['charts', 'bottom']] },
    dashboard: { widgets: [['tiles', 'top'], ['terminal', 'main'], ['power', 'side'], ['info', 'side'], ['charts', 'bottom']] },
    side: { widgets: [['terminal', 'main'], ['power', 'side'], ['info', 'side'], ['tiles', 'side'], ['charts', 'side']] },
    monitor: { widgets: [['charts', 'top'], ['tiles', 'top'], ['terminal', 'main'], ['power', 'side'], ['info', 'side']] },
    focus: { widgets: [['power', 'top'], ['terminal', 'main'], ['charts', 'bottom']] },
    compact: { compact: true, widgets: [['terminal', 'main'], ['power', 'bottom'], ['tiles', 'bottom'], ['charts', 'bottom']] },
};

interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
    terminal: boolean;
}

const WIDTH = 260;
const HEIGHT = 130;
const PAD = 8;
const GAP = 6;
const BLOCKS: Record<Widget, number> = { terminal: 1, power: 3, info: 1, tiles: 5, charts: 3 };
const ROW: Record<Widget, number> = { terminal: 26, power: 10, info: 14, tiles: 16, charts: 22 };
const GROW: Record<Widget, number> = { terminal: 3, power: 0, info: 1, tiles: 5, charts: 3 };

function split(x: number, width: number, count: number, gap = 4): { x: number; w: number }[] {
    const each = (width - gap * (count - 1)) / count;

    return Array.from({ length: count }, (_, index) => ({ x: x + index * (each + gap), w: each }));
}

function layoutBoxes(widgets: [Widget, Area][], compact = false): Box[] {
    const boxes: Box[] = [];
    const of = (area: Area) => widgets.filter(([, where]) => where === area).map(([widget]) => widget);
    const top = of('top');
    const bottom = of('bottom');
    const main = of('main');
    const side = of('side');
    const inner = WIDTH - PAD * 2;

    const rows = (list: Widget[], from: number) => {
        let y = from;
        for (const widget of list) {
            for (const block of split(PAD, inner, BLOCKS[widget])) boxes.push({ ...block, y, h: ROW[widget], terminal: widget === 'terminal' });
            y += ROW[widget] + GAP;
        }

        return y;
    };

    const y = rows(top, PAD);
    const bottomHeight = bottom.length === 0 ? 0 : compact ? 14 + GAP : bottom.reduce((sum, widget) => sum + ROW[widget] + GAP, 0);
    const end = HEIGHT - PAD - bottomHeight;
    const sideWidth = side.length > 0 ? (compact ? 44 : 52) : 0;
    const mainWidth = inner - (sideWidth ? sideWidth + GAP : 0);

    const othersHeight = main.filter((widget) => widget !== 'terminal').reduce((sum, widget) => sum + ROW[widget] + GAP, 0);
    let mainY = y;
    for (const widget of main) {
        const height = widget === 'terminal' ? Math.max(12, end - mainY - othersHeight) : ROW[widget];
        for (const block of split(PAD, mainWidth, widget === 'terminal' ? 1 : BLOCKS[widget])) boxes.push({ ...block, y: mainY, h: height, terminal: widget === 'terminal' });
        mainY += height + GAP;
    }

    if (side.length > 0) {
        const x = PAD + mainWidth + GAP;
        const fixed = side.filter((widget) => GROW[widget] === 0).reduce((sum, widget) => sum + ROW[widget], 0);
        const share = side.reduce((sum, widget) => sum + GROW[widget], 0) || 1;
        const room = end - y - fixed - GAP * (side.length - 1);
        let sideY = y;
        for (const widget of side) {
            const height = GROW[widget] === 0 ? ROW[widget] : Math.max(6, (room * GROW[widget]) / share);
            boxes.push({ x, w: sideWidth, y: sideY, h: height, terminal: widget === 'terminal' });
            sideY += height + GAP;
        }
    }

    if (compact && bottom.length > 0) {
        split(PAD, inner, bottom.length).forEach((block, index) => boxes.push({ ...block, y: end + GAP, h: 14, terminal: bottom[index] === 'terminal' }));
    } else {
        rows(bottom, end + GAP);
    }

    return boxes;
}

export default function ConsoleLayoutPicker({ value, options, onChange }: { value: unknown; options: { value: string | number | boolean; label: string }[]; onChange: (value: unknown) => void }) {
    return (
        <div className={'ppx:grid ppx:grid-cols-2 ppx:gap-3 ppx:sm:grid-cols-3'}>
            {options.map((option) => {
                const layout = LAYOUTS[String(option.value)];
                const selected = option.value === value;

                return (
                    <button
                        key={String(option.value)}
                        type={'button'}
                        onClick={() => onChange(option.value)}
                        aria-pressed={selected}
                        className={cn(
                            'pt-surface ppx:flex ppx:flex-col ppx:gap-2 ppx:rounded-2xl ppx:border ppx:bg-card ppx:p-2.5 ppx:text-left ppx:cursor-pointer ppx:transition-colors',
                            selected ? 'ppx:border-primary' : 'ppx:border-border ppx:hover:border-primary/60'
                        )}
                    >
                        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={'ppx:block ppx:h-auto ppx:w-full'} aria-hidden>
                            <rect width={WIDTH} height={HEIGHT} rx={9} style={{ fill: 'color-mix(in oklab, var(--muted) 70%, transparent)' }} />
                            {layout &&
                                layoutBoxes(layout.widgets, layout.compact).map((box, index) => (
                                    <rect key={index} x={box.x} y={box.y} width={box.w} height={box.h} rx={4} style={box.terminal ? { fill: 'var(--terminal-background, #0a0d18)' } : { fill: 'var(--primary)', opacity: 0.6 }} />
                                ))}
                        </svg>
                        <span className={cn('ppx:px-1 ppx:pb-0.5 ppx:font-mono ppx:text-xs ppx:uppercase ppx:tracking-[0.06em]', selected ? 'ppx:text-foreground' : 'ppx:text-muted-foreground')}>{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
