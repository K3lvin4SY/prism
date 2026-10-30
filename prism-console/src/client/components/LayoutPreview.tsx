import type { ReactNode } from 'react';
import { cn } from '@pterodactyl/sdk';
import type { CustomLayout, WidgetId } from '../api';

/*
 * A small drawing of a console layout: the terminal dark, every other widget in the primary
 * color, placed in the areas the layout puts them. Prism Core draws the same in Prism
 * Properties (prism-core/src/client/ConsoleLayoutPicker.tsx); change both together.
 */

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

/** How many boxes a widget is drawn as across a row, and the row's height. */
const BLOCKS: Record<WidgetId, number> = { terminal: 1, power: 3, info: 1, tiles: 5, charts: 3 };
const ROW: Record<WidgetId, number> = { terminal: 26, power: 10, info: 14, tiles: 16, charts: 22 };
/** How much of the side column's height a widget takes. */
const GROW: Record<WidgetId, number> = { terminal: 3, power: 0, info: 1, tiles: 5, charts: 3 };

function split(x: number, width: number, count: number, gap = 4): { x: number; w: number }[] {
    const each = (width - gap * (count - 1)) / count;

    return Array.from({ length: count }, (_, index) => ({ x: x + index * (each + gap), w: each }));
}

/** Lays the widgets out in the drawing. */
export function layoutBoxes(widgets: CustomLayout, compact = false): Box[] {
    const boxes: Box[] = [];
    const of = (area: string) => widgets.filter((entry) => entry.area === area).map((entry) => entry.widget);
    const top = of('top');
    const bottom = of('bottom');
    const main = of('main');
    const side = of('side');
    const inner = WIDTH - PAD * 2;

    const rows = (list: WidgetId[], from: number, x = PAD, width = inner) => {
        let y = from;
        for (const widget of list) {
            for (const block of split(x, width, BLOCKS[widget])) boxes.push({ ...block, y, h: ROW[widget], terminal: widget === 'terminal' });
            y += ROW[widget] + GAP;
        }

        return y;
    };

    let y = rows(top, PAD);
    // Compact puts the widgets below side by side in one row.
    const bottomHeight = bottom.length === 0 ? 0 : compact ? 14 + GAP : bottom.reduce((sum, widget) => sum + ROW[widget] + GAP, 0);
    const end = HEIGHT - PAD - bottomHeight;
    const sideWidth = side.length > 0 ? (compact ? 44 : 52) : 0;
    const mainWidth = inner - (sideWidth ? sideWidth + GAP : 0);

    // The main column: the terminal takes what its other widgets leave.
    const others = main.filter((widget) => widget !== 'terminal');
    const othersHeight = others.reduce((sum, widget) => sum + ROW[widget] + GAP, 0);
    let mainY = y;
    for (const widget of main) {
        const height = widget === 'terminal' ? Math.max(12, end - mainY - othersHeight) : ROW[widget];
        for (const block of split(PAD, mainWidth, widget === 'terminal' ? 1 : BLOCKS[widget])) boxes.push({ ...block, y: mainY, h: height, terminal: widget === 'terminal' });
        mainY += height + GAP;
    }

    // The side column: the power buttons keep their size, the rest share the height.
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

    y = end + GAP;
    if (compact && bottom.length > 0) {
        split(PAD, inner, bottom.length).forEach((block, index) => boxes.push({ ...block, y, h: 14, terminal: bottom[index] === 'terminal' }));
    } else {
        rows(bottom, y);
    }

    return boxes;
}

export function LayoutPreview({ widgets, compact }: { widgets: CustomLayout; compact?: boolean }) {
    return (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={'pcn:block pcn:h-auto pcn:w-full'} aria-hidden>
            <rect width={WIDTH} height={HEIGHT} rx={9} style={{ fill: 'color-mix(in oklab, var(--muted) 70%, transparent)' }} />
            {layoutBoxes(widgets, compact).map((box, index) => (
                <rect key={index} x={box.x} y={box.y} width={box.w} height={box.h} rx={4} style={box.terminal ? { fill: 'var(--terminal-background, #0a0d18)' } : { fill: 'var(--primary)', opacity: 0.6 }} />
            ))}
        </svg>
    );
}

/** A layout to pick: its drawing in a card with its name beneath, as on the Prism Console slides. */
export function LayoutCard({ widgets, compact, label, note, selected, onClick }: { widgets: CustomLayout; compact?: boolean; label: string; note?: ReactNode; selected: boolean; onClick: () => void }) {
    return (
        <button
            type={'button'}
            onClick={onClick}
            aria-pressed={selected}
            className={cn(
                'pt-surface pcn:flex pcn:flex-col pcn:gap-2 pcn:rounded-2xl pcn:border pcn:bg-card pcn:p-2 pcn:text-left pcn:cursor-pointer pcn:transition-colors',
                selected ? 'pcn:border-primary' : 'pcn:border-border pcn:hover:border-primary/60'
            )}
        >
            <LayoutPreview widgets={widgets} compact={compact} />
            <span className={cn('pcn:flex pcn:items-baseline pcn:gap-2 pcn:px-1 pcn:pb-0.5 pcn:font-mono pcn:text-[11px] pcn:uppercase pcn:tracking-[0.06em]', selected ? 'pcn:text-foreground' : 'pcn:text-muted-foreground')}>
                <span className={'pcn:truncate'}>{label}</span>
                {note && <span className={'pcn:ml-auto pcn:shrink-0 pcn:normal-case pcn:tracking-normal pcn:text-muted-foreground'}>{note}</span>}
            </span>
        </button>
    );
}
