import { useMemo, useState } from 'react';
import { Button, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import type { Schedule, State } from '../api';
import { TRIGGER_ICONS, triggerText } from './ScheduleList';

const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#ec4899', '#6366f1'];
const color = (schedule: Schedule, index: number) => schedule.color ?? PALETTE[index % PALETTE.length];
const PER_CELL = 3;

/** The coming week by day and hour, each run a block in its schedule's color. */
export default function Calendar({ state, onOpen }: { state: State; onOpen: (id: number) => void }) {
    const [compact, setCompact] = useState(true);
    const days = useMemo(() => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);

        return Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
    }, []);

    // cell key "day-hour" → the runs in it
    const cells = useMemo(() => {
        const map = new Map<string, { schedule: Schedule; index: number; at: Date }[]>();
        state.schedules.forEach((schedule, index) => {
            if (!schedule.enabled || schedule.pausedUntil) return;
            for (const iso of schedule.upcoming) {
                const at = new Date(iso);
                const day = days.findIndex((date) => date.toDateString() === at.toDateString());
                if (day === -1) continue;
                const key = `${day}-${at.getHours()}`;
                map.set(key, [...(map.get(key) ?? []), { schedule, index, at }]);
            }
        });

        return map;
    }, [state.schedules, days]);

    const busyHours = new Set([...cells.keys()].map((key) => Number(key.split('-')[1])));
    const hours = Array.from({ length: 24 }, (_, hour) => hour).filter((hour) => !compact || busyHours.has(hour));
    const offClock = state.schedules.filter((schedule) => schedule.trigger.type !== 'cron');
    const now = new Date();

    return (
        <div className={'psc:flex psc:flex-col psc:gap-3'}>
            <div className={'psc:flex psc:flex-wrap psc:items-center psc:gap-3'}>
                <div className={'psc:flex psc:flex-1 psc:flex-wrap psc:gap-3'}>
                    {state.schedules
                        .filter((schedule) => schedule.trigger.type === 'cron')
                        .map((schedule) => (
                            <button key={schedule.id} type={'button'} onClick={() => onOpen(schedule.id)} className={cn('psc:flex psc:cursor-pointer psc:items-center psc:gap-1.5 psc:text-xs', (!schedule.enabled || schedule.pausedUntil) && 'psc:line-through psc:opacity-60')}>
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
                <div className={'psc:grid psc:min-w-[720px]'} style={{ gridTemplateColumns: '3.5rem repeat(7, minmax(0, 1fr))' }}>
                    <div className={'psc:border-b psc:border-border'} />
                    {days.map((day, index) => (
                        <div key={index} className={cn('psc:border-b psc:border-l psc:border-border psc:px-2 psc:py-2 psc:text-center psc:text-xs psc:font-semibold', index === 0 && 'psc:text-primary')}>
                            {day.toLocaleDateString(undefined, { weekday: 'short' })}
                            <span className={'psc:ml-1 psc:font-normal psc:text-muted-foreground'}>{day.getDate()}</span>
                        </div>
                    ))}
                    {hours.length === 0 && <div className={'psc:col-span-8 psc:p-8 psc:text-center psc:text-sm psc:text-muted-foreground'}>Nothing on the clock in the coming week.</div>}
                    {hours.map((hour) => (
                        <Row key={hour} hour={hour} days={days} cells={cells} now={now} onOpen={onOpen} />
                    ))}
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

function Row({ hour, days, cells, now, onOpen }: { hour: number; days: Date[]; cells: Map<string, { schedule: Schedule; index: number; at: Date }[]>; now: Date; onOpen: (id: number) => void }) {
    return (
        <>
            <div className={'psc:border-b psc:border-border psc:px-2 psc:py-1.5 psc:text-right psc:text-xs psc:tabular-nums psc:text-muted-foreground'}>{String(hour).padStart(2, '0')}:00</div>
            {days.map((_, day) => {
                const items = cells.get(`${day}-${hour}`) ?? [];
                const current = day === 0 && now.getHours() === hour;
                // Several runs of one schedule in the hour show as one block with a count.
                const grouped = [...new Map(items.map((item) => [item.schedule.id, item])).values()].map((item) => ({ ...item, count: items.filter((other) => other.schedule.id === item.schedule.id).length }));

                return (
                    <div key={day} className={cn('psc:flex psc:min-h-9 psc:gap-1 psc:border-b psc:border-l psc:border-border psc:p-1', current && 'psc:bg-primary/5')}>
                        {grouped.slice(0, PER_CELL).map(({ schedule, index, at, count }) => (
                            <button
                                key={schedule.id}
                                type={'button'}
                                onClick={() => onOpen(schedule.id)}
                                title={`${schedule.name} · ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${count > 1 ? ` and ${count - 1} more this hour` : ''}`}
                                className={'psc:min-w-0 psc:flex-1 psc:cursor-pointer psc:truncate psc:rounded psc:px-1.5 psc:py-0.5 psc:text-left psc:text-[11px] psc:font-medium psc:text-white psc:hover:opacity-90'}
                                style={{ background: color(schedule, index) }}
                            >
                                {count > 1 ? `${count}×` : `:${String(at.getMinutes()).padStart(2, '0')}`} {schedule.name}
                            </button>
                        ))}
                        {grouped.length > PER_CELL && <span className={'psc:self-center psc:text-[11px] psc:text-muted-foreground'}>+{grouped.length - PER_CELL}</span>}
                    </div>
                );
            })}
        </>
    );
}
