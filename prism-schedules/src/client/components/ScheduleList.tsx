import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, NamedIcon, Switch, cn, httpErrorToHuman, toast, useCurrentServerRequired } from '@pterodactyl/sdk';
import { api, keys, toInput, type Run, type Schedule, type State } from '../api';
import { describe } from '../cron';
import { describeCondition, flatten } from '../steps';

export const STATUS: Record<string, { label: string; icon: string; tone: string }> = {
    running: { label: 'Running', icon: 'loader', tone: 'psc:text-primary' },
    done: { label: 'Succeeded', icon: 'circle-check', tone: 'psc:text-green-500' },
    failed: { label: 'Failed', icon: 'circle-x', tone: 'psc:text-destructive' },
    cancelled: { label: 'Stopped', icon: 'circle-stop', tone: 'psc:text-yellow-500' },
    skipped: { label: 'Skipped', icon: 'circle-slash', tone: 'psc:text-muted-foreground' },
};

export function triggerText(schedule: Pick<Schedule, 'trigger'>): string {
    const trigger = schedule.trigger;
    switch (trigger.type) {
        case 'cron':
            return describe(trigger.cron ?? '');
        case 'start':
            return 'When the server starts';
        case 'stop':
            return 'When the server stops';
        case 'crash':
            return 'When the server crashes';
        case 'empty':
            return `When nobody has been online for ${trigger.minutes ?? 10} minutes`;
        case 'manual':
            return 'Only when run by hand';
    }
}

export const TRIGGER_ICONS: Record<string, string> = { cron: 'clock', start: 'play', stop: 'square', crash: 'flame', empty: 'user-x', manual: 'hand' };

export function relative(iso: string | null): string {
    if (!iso) return 'never';
    const seconds = Math.round((Date.parse(iso) - Date.now()) / 1000);
    const abs = Math.abs(seconds);
    const text = abs < 60 ? `${abs}s` : abs < 3600 ? `${Math.round(abs / 60)}m` : abs < 86400 ? `${Math.round(abs / 3600)}h` : `${Math.round(abs / 86400)}d`;

    return seconds >= 0 ? `in ${text}` : `${text} ago`;
}

/** The schedules as cards, each with its switch, what it does and its last and next run. */
export default function ScheduleList({ state, onOpen, onNew }: { state: State; onOpen: (id: number, tab?: string) => void; onNew: () => void }) {
    if (state.schedules.length === 0) {
        return (
            <div className={'psc:flex psc:flex-col psc:items-center psc:gap-3 psc:rounded-lg psc:border psc:border-dashed psc:border-border psc:py-14 psc:text-center'}>
                <NamedIcon name={'calendar-clock'} size={36} className={'psc:text-muted-foreground'} />
                <div>
                    <p className={'psc:font-medium'}>No Prism schedules yet</p>
                    <p className={'psc:text-sm psc:text-muted-foreground'}>Start from a preset: daily restarts with warnings, crash recovery, backups and more.</p>
                </div>
                {state.permissions.create && (
                    <Button onClick={onNew}>
                        <NamedIcon name={'plus'} size={14} /> New schedule
                    </Button>
                )}
            </div>
        );
    }

    return (
        <div className={'psc:grid psc:gap-3 psc:lg:grid-cols-2'}>
            {state.schedules.map((schedule) => (
                <Card key={schedule.id} schedule={schedule} state={state} run={state.runs.find((run) => run.scheduleId === schedule.id && run.status === 'running')} onOpen={onOpen} />
            ))}
        </div>
    );
}

function Card({ schedule, state, run, onOpen }: { schedule: Schedule; state: State; run: Run | undefined; onOpen: (id: number, tab?: string) => void }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const queryClient = useQueryClient();
    const [busy, setBusy] = useState(false);
    const status = schedule.lastStatus ? STATUS[schedule.lastStatus] : null;
    const steps = flatten(schedule.steps).length;

    const act = async (action: () => Promise<unknown>, done?: string) => {
        setBusy(true);
        try {
            await action();
            if (done) toast.success(done);
            await queryClient.invalidateQueries({ queryKey: keys.state(identifier) });
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={cn('psc:flex psc:flex-col psc:gap-3 psc:overflow-hidden psc:rounded-lg psc:border psc:border-border psc:bg-card psc:p-4', !schedule.enabled && 'psc:opacity-70')} style={{ borderLeft: `4px solid ${schedule.color ?? 'var(--primary)'}` }}>
            <div className={'psc:flex psc:items-start psc:gap-3'}>
                <button type={'button'} onClick={() => onOpen(schedule.id)} className={'psc:min-w-0 psc:flex-1 psc:cursor-pointer psc:text-left'}>
                    <p className={'psc:truncate psc:font-semibold'}>{schedule.name}</p>
                    <p className={'psc:flex psc:items-center psc:gap-1.5 psc:text-sm psc:text-muted-foreground'}>
                        <NamedIcon name={TRIGGER_ICONS[schedule.trigger.type]} size={13} className={'psc:shrink-0'} />
                        <span className={'psc:truncate'}>{triggerText(schedule)}</span>
                    </p>
                </button>
                {state.permissions.update && <Switch checked={schedule.enabled} disabled={busy} onChange={(enabled) => void act(() => api.update(identifier, schedule.id, { ...toInput(schedule), enabled }), enabled ? 'Schedule turned on.' : 'Schedule turned off.')} aria-label={'Enabled'} />}
            </div>

            <div className={'psc:flex psc:flex-wrap psc:gap-x-4 psc:gap-y-1 psc:text-xs psc:text-muted-foreground'}>
                <span>
                    {steps} {steps === 1 ? 'step' : 'steps'}
                </span>
                {schedule.conditions.all.length > 0 && <span title={schedule.conditions.all.map(describeCondition).join(', ')}>{schedule.conditions.all.length} conditions</span>}
                {schedule.pausedUntil && <span className={'psc:text-yellow-500'}>Paused until {new Date(schedule.pausedUntil).toLocaleString()}</span>}
                {schedule.trigger.type === 'cron' && schedule.enabled && !schedule.pausedUntil && <span>Next {relative(schedule.nextRunAt)}</span>}
                <span className={'psc:flex psc:items-center psc:gap-1'}>
                    Last {relative(schedule.lastRunAt)}
                    {status && <NamedIcon name={status.icon} size={12} className={status.tone} />}
                </span>
            </div>

            {run && (
                <div className={'psc:flex psc:items-center psc:gap-2 psc:rounded-md psc:bg-primary/10 psc:px-3 psc:py-2 psc:text-sm'}>
                    <NamedIcon name={'loader'} size={14} className={'psc:animate-spin psc:text-primary'} />
                    <span className={'psc:min-w-0 psc:flex-1 psc:truncate'}>{run.detail ?? 'Running'}</span>
                    <Button.Text size={'small'} onClick={() => onOpen(schedule.id, 'history')}>
                        Watch
                    </Button.Text>
                </div>
            )}

            <div className={'psc:flex psc:flex-wrap psc:gap-2'}>
                {state.permissions.update && (
                    <Button size={'small'} isSecondary disabled={busy || !!run} onClick={() => void act(() => api.run(identifier, schedule.id), 'Started.')}>
                        <NamedIcon name={'play'} size={13} /> Run now
                    </Button>
                )}
                <Button size={'small'} isSecondary onClick={() => onOpen(schedule.id)}>
                    {state.permissions.update ? 'Edit' : 'View'}
                </Button>
                <Button.Text size={'small'} onClick={() => onOpen(schedule.id, 'history')}>
                    History
                </Button.Text>
            </div>
        </div>
    );
}
