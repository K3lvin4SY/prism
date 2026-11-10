import { useEffect, useMemo, useState } from 'react';
import { Button, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import type { Run, Schedule, State, Step } from '../api';
import { TRIGGER_ICONS, triggerText } from './ScheduleList';

const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#ec4899', '#6366f1'];
const color = (schedule: Schedule, index: number) => schedule.color ?? PALETTE[index % PALETTE.length];

/** Height of one hour, in pixels. */
const HOUR = 56;
/** The shortest a block is drawn, in minutes, so a run of a few seconds stays readable. */
const SHORTEST = 25;
const MINUTE = 60_000;

/** One block on the calendar: a run, or several runs of one schedule close together. */
interface Block {
    key: string;
    schedule: Schedule;
    index: number;
    /** Minutes since the day's midnight. */
    start: number;
    end: number;
    /** Where it is drawn to: at least SHORTEST minutes long. */
    shown: number;
    count: number;
    /** Minutes between the runs, when there are several. */
    every: number | null;
    lane: number;
    /** How many blocks of its group stand side by side, and which of them this is. */
    lanes: number;
    column: number;
    /** Drawn over the blocks it overlaps, indented, instead of beside them. */
    cascade: boolean;
}

/** A block starting at least this many minutes after those it overlaps is laid over them, leaving their names in view. */
const CASCADE = 30;

/** How long a schedule's steps wait on their own, in seconds; branches count their longer side. */
function stepSeconds(steps: Step[]): number {
    return steps.reduce((total, step) => {
        if (step.type === 'wait' || step.type === 'countdown') return total + (Number(step.config.seconds) || 0);
        if (step.type === 'if') return total + Math.max(stepSeconds(step.then ?? []), stepSeconds(step.else ?? []));

        return total;
    }, 0);
}

/** How long a run of the schedule takes: the middle of its finished runs, or what its steps wait. */
function duration(schedule: Schedule, runs: Run[]): number {
    const took = runs
        .filter((run) => run.scheduleId === schedule.id && run.finishedAt && run.status === 'done')
        .map((run) => (new Date(run.finishedAt!).getTime() - new Date(run.startedAt).getTime()) / MINUTE)
        .filter((minutes) => minutes >= 0)
        .sort((a, b) => a - b);
    if (took.length > 0) return Math.max(1, took[Math.floor(took.length / 2)]);

    return Math.max(1, stepSeconds(schedule.steps) / 60);
}

const clock = (minutes: number) => {
    const rounded = Math.round(minutes);

    return `${String(Math.floor(rounded / 60) % 24).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
};

/** Where a block's top is drawn: a block that would run past midnight is drawn upwards instead. */
const blockTop = (block: Block) => Math.min(block.start, 24 * 60 - (block.shown - block.start < SHORTEST ? SHORTEST : block.shown - block.start));

/**
 * Where a block sits across its day, as in Google Calendar: laid over earlier ones a little
 * indented, or side by side, every column but the last reaching past its share and the later on top.
 */
function place(block: Block): { left: string; width: string } {
    const left = block.cascade ? Math.min(60, block.lane * 14) : (block.column / block.lanes) * 100;
    const width = block.cascade || block.column === block.lanes - 1 ? 100 - left : Math.min(100 - left, 170 / block.lanes);

    return { left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)` };
}

/** Puts blocks that overlap side by side, each group of overlapping blocks sharing the width. */
function layOut(blocks: Block[]): Block[] {
    const sorted = [...blocks].sort((a, b) => a.start - b.start || b.shown - a.shown);
    let group: Block[] = [];
    let groupEnd = -1;
    const finish = () => {
        const columns = [...new Set(group.filter((block) => !block.cascade).map((block) => block.lane))].sort((a, b) => a - b);
        group.forEach((block) => {
            block.lanes = Math.max(1, columns.length);
            block.column = block.cascade ? 0 : columns.indexOf(block.lane);
        });
        group = [];
    };

    for (const block of sorted) {
        if (block.start >= groupEnd && group.length > 0) finish();
        const ends: number[] = [];
        group.forEach((other) => (ends[other.lane] = Math.max(ends[other.lane] ?? -1, other.shown)));
        let lane = 0;
        while (ends[lane] !== undefined && ends[lane] > block.start) lane++;
        block.lane = lane;
        // Like Google Calendar: a block that starts well after the ones it overlaps is laid over
        // them, a little indented; blocks starting about together share the width.
        const under = group.filter((other) => other.shown > block.start);
        block.cascade = lane > 0 && under.every((other) => block.start - other.start >= CASCADE);
        group.push(block);
        groupEnd = Math.max(groupEnd, block.shown);
    }
    if (group.length > 0) finish();

    return sorted;
}

/** The coming week as a time grid, each run a block from its start for as long as it takes. */
export default function Calendar({ state, onOpen }: { state: State; onOpen: (id: number) => void }) {
    const [compact, setCompact] = useState(true);
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 60_000);

        return () => window.clearInterval(timer);
    }, []);

    const days = useMemo(() => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);

        return Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
    }, []);

    // Each day's blocks. Runs of one schedule that would be drawn on top of each other become one block.
    const perDay = useMemo(() => {
        const result: Block[][] = days.map(() => []);
        state.schedules.forEach((schedule, index) => {
            if (!schedule.enabled || schedule.pausedUntil) return;
            const length = duration(schedule, state.runs);
            const starts = schedule.upcoming.map((iso) => new Date(iso)).sort((a, b) => a.getTime() - b.getTime());

            for (const at of starts) {
                const day = days.findIndex((date) => date.toDateString() === at.toDateString());
                if (day === -1) continue;
                const start = at.getHours() * 60 + at.getMinutes() + at.getSeconds() / 60;
                const end = Math.min(24 * 60, start + length);
                const last = [...result[day]].reverse().find((block) => block.schedule.id === schedule.id);

                if (last && start < last.shown) {
                    last.every = last.count === 1 ? start - last.start : last.every;
                    last.count++;
                    last.end = Math.max(last.end, end);
                    last.shown = Math.min(24 * 60, Math.max(last.end, start + SHORTEST));
                    continue;
                }

                result[day].push({ key: `${schedule.id}-${at.getTime()}`, schedule, index, start, end, shown: Math.min(24 * 60, Math.max(end, start + SHORTEST)), count: 1, every: null, lane: 0, lanes: 1, column: 0, cascade: false });
            }
        });

        return result.map(layOut);
    }, [state.schedules, state.runs, days]);

    // The hours shown: all of them, or only those a block covers.
    const hours = useMemo(() => {
        if (!compact) return Array.from({ length: 24 }, (_, hour) => hour);
        // The hour it is now too, so the line marking the time shows.
        const busy = new Set<number>([now.getHours()]);
        perDay.flat().forEach((block) => {
            for (let hour = Math.floor(blockTop(block) / 60); hour * 60 < block.shown; hour++) busy.add(hour);
        });

        return [...busy].sort((a, b) => a - b);
    }, [perDay, compact, now]);

    const row = new Map(hours.map((hour, index) => [hour, index]));
    /** Where a time of day is drawn, in pixels from the top; hidden hours take no room. */
    const y = (minutes: number, isEnd = false) => {
        const hour = Math.min(23, Math.floor((isEnd ? minutes - 0.001 : minutes) / 60));
        const index = row.get(hour);
        if (index === undefined) return null;

        return index * HOUR + ((minutes - hour * 60) / 60) * HOUR;
    };
    const height = hours.length * HOUR;
    const nowY = y(now.getHours() * 60 + now.getMinutes());
    const offClock = state.schedules.filter((schedule) => schedule.trigger.type !== 'cron');

    return (
        <div className={'psc:flex psc:flex-col psc:gap-3'}>
            <div className={'psc:flex psc:flex-wrap psc:items-center psc:gap-3'}>
                <div className={'psc:flex psc:flex-1 psc:flex-wrap psc:gap-3'}>
                    {state.schedules
                        .filter((schedule) => schedule.trigger.type === 'cron')
                        .map((schedule) => (
                            <button
                                key={schedule.id}
                                type={'button'}
                                onClick={() => onOpen(schedule.id)}
                                className={cn('psc:flex psc:cursor-pointer psc:items-center psc:gap-1.5 psc:text-xs', (!schedule.enabled || schedule.pausedUntil) && 'psc:line-through psc:opacity-60')}
                            >
                                <span className={'psc:size-2.5 psc:rounded-sm'} style={{ background: color(schedule, state.schedules.indexOf(schedule)) }} />
                                {schedule.name}
                            </button>
                        ))}
                </div>
                <Button.Text size={'small'} onClick={() => setCompact(!compact)}>
                    {compact ? 'Show all hours' : 'Only busy hours'}
                </Button.Text>
            </div>

            <div className={'pt-surface psc:overflow-x-auto psc:rounded-lg psc:border psc:border-border psc:bg-card'}>
                <div className={'psc:grid psc:min-w-[660px] psc:grid-cols-[3.1rem_repeat(7,minmax(0,1fr))] psc:sm:min-w-[720px] psc:sm:grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]'}>
                    <div className={'psc:border-b psc:border-border'} />
                    {days.map((day, index) => (
                        <div key={index} className={cn('psc:border-b psc:border-l psc:border-border psc:px-2 psc:py-2 psc:text-center psc:text-xs psc:font-semibold', index === 0 && 'psc:text-primary')}>
                            {day.toLocaleDateString(undefined, { weekday: 'short' })}
                            <span className={'psc:ml-1 psc:font-normal psc:text-muted-foreground'}>{day.getDate()}</span>
                        </div>
                    ))}

                    {hours.length === 0 ? (
                        <div className={'psc:col-span-8 psc:p-8 psc:text-center psc:text-sm psc:text-muted-foreground'}>Nothing on the clock in the coming week.</div>
                    ) : (
                        <>
                            {/* The hours, with a break where hidden hours are left out. */}
                            <div className={'psc:relative'} style={{ height }}>
                                {hours.map((hour, index) => (
                                    <div key={hour} className={'psc:absolute psc:inset-x-0 psc:px-1.5 psc:pt-1 psc:text-right psc:text-xs psc:tabular-nums psc:text-muted-foreground psc:sm:px-2'} style={{ top: index * HOUR, height: HOUR }}>
                                        {String(hour).padStart(2, '0')}:00
                                    </div>
                                ))}
                            </div>
                            {days.map((_, day) => (
                                <div key={day} className={cn('psc:relative psc:border-l psc:border-border', day === 0 && 'psc:bg-primary/[0.03]')} style={{ height }}>
                                    {hours.map((hour, index) => (
                                        <div
                                            key={hour}
                                            aria-hidden
                                            className={cn('psc:absolute psc:inset-x-0 psc:border-t psc:border-border/70', index > 0 && hours[index - 1] !== hour - 1 && 'psc:border-t-2 psc:border-dashed psc:border-border')}
                                            style={{ top: index * HOUR }}
                                        />
                                    ))}

                                    {perDay[day].map((block) => {
                                        const top = y(blockTop(block)) ?? 0;
                                        const bottom = y(block.shown, true) ?? top + (SHORTEST / 60) * HOUR;
                                        const tall = bottom - top >= 34;
                                        const time =
                                            block.count > 1
                                                ? `${clock(block.start)} – ${clock(block.end)}${block.every ? ` · every ${Math.round(block.every)} min` : ''}`
                                                : block.end - block.start >= 1.5
                                                  ? `${clock(block.start)} – ${clock(block.end)}`
                                                  : clock(block.start);

                                        return (
                                            <button
                                                key={block.key}
                                                type={'button'}
                                                onClick={() => onOpen(block.schedule.id)}
                                                title={`${block.count > 1 ? `${block.count}× ` : ''}${block.schedule.name} · ${time}`}
                                                className={cn(
                                                    'psc:@container psc:absolute psc:z-10 psc:flex psc:min-w-0 psc:cursor-pointer psc:overflow-hidden psc:rounded-md psc:px-1.5 psc:text-left psc:text-[11px] psc:leading-tight psc:text-white psc:shadow-sm psc:ring-1 psc:ring-card psc:hover:z-20 psc:hover:brightness-110',
                                                    tall ? 'psc:flex-col psc:py-1' : 'psc:items-center psc:gap-1'
                                                )}
                                                style={{
                                                    top: top + 1,
                                                    height: Math.max(18, bottom - top - 2),
                                                    ...place(block),
                                                    zIndex: 10 + block.lane,
                                                    background: color(block.schedule, block.index),
                                                }}
                                            >
                                                <span className={'psc:truncate psc:font-semibold'}>
                                                    {block.count > 1 && `${block.count}× `}
                                                    {block.schedule.name}
                                                </span>
                                                {/* A narrow block keeps its name; the time is in its tooltip. */}
                                                <span className={cn('psc:truncate psc:tabular-nums psc:opacity-85', !tall && 'psc:hidden psc:shrink-0 psc:@[8.5rem]:inline')}>{tall ? time : clock(block.start)}</span>
                                            </button>
                                        );
                                    })}

                                    {day === 0 && nowY !== null && (
                                        <div aria-hidden className={'psc:pointer-events-none psc:absolute psc:inset-x-0 psc:z-30 psc:h-0.5 psc:bg-destructive'} style={{ top: nowY }}>
                                            <span className={'psc:absolute psc:-top-1 psc:-left-1 psc:size-2.5 psc:rounded-full psc:bg-destructive'} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>

            {offClock.length > 0 && (
                <div className={'pt-surface psc:flex psc:flex-col psc:gap-2 psc:rounded-lg psc:border psc:border-border psc:bg-card psc:p-4'}>
                    <p className={'psc:text-xs psc:font-semibold psc:uppercase psc:tracking-wide psc:text-muted-foreground'}>Not on the clock</p>
                    {offClock.map((schedule) => (
                        <button key={schedule.id} type={'button'} onClick={() => onOpen(schedule.id)} className={'psc:flex psc:cursor-pointer psc:items-center psc:gap-2 psc:text-left psc:text-sm psc:hover:text-primary'}>
                            <NamedIcon name={TRIGGER_ICONS[schedule.trigger.type]} size={14} />
                            <span className={'psc:font-medium'}>{schedule.name}</span>
                            <span className={'psc:text-muted-foreground'}>{triggerText(schedule)}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
