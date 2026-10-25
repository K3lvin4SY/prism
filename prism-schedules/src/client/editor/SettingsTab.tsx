import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, Input, cn, httpErrorToHuman, toast, useCurrentServerRequired } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { api, keys, type Schedule, type ScheduleInput, type State } from '../api';
import { Check, Section } from '../components/ui';

const COLORS = ['#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#0ea5e9', '#64748b'];

/** Color, pausing, export, copying to other servers and deleting. */
export default function SettingsTab({ state, schedule, value, onChange, disabled, onDeleted }: { state: State; schedule: Schedule | null; value: ScheduleInput; onChange: (patch: Partial<ScheduleInput>) => void; disabled: boolean; onDeleted: () => void }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const queryClient = useQueryClient();
    const [until, setUntil] = useState(() => {
        const date = new Date(Date.now() + 86400000);
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());

        return date.toISOString().slice(0, 16);
    });
    const [targets, setTargets] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const act = async (action: () => Promise<unknown>, done: string) => {
        setBusy(true);
        try {
            await action();
            toast.success(done);
            await queryClient.invalidateQueries({ queryKey: keys.state(identifier) });

            return true;
        } catch (error) {
            toast.error(httpErrorToHuman(error));

            return false;
        } finally {
            setBusy(false);
        }
    };

    const exportJson = () => {
        const clean = JSON.parse(JSON.stringify(value), (key, item) => (key === 'webhook' || key === 'webhookSet' ? undefined : item)) as ScheduleInput;
        const blob = new Blob([JSON.stringify({ prismSchedule: 1, ...clean }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${value.name.replace(/[^\w.-]+/g, '-').toLowerCase() || 'schedule'}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    return (
        <div className={'psc:grid psc:gap-4 psc:lg:grid-cols-2'}>
            <Section title={'Color'}>
                <p className={'psc:mb-3 psc:text-sm psc:text-muted-foreground'}>Shown on the card and in the calendar.</p>
                <div className={'psc:flex psc:flex-wrap psc:gap-2'}>
                    <button type={'button'} disabled={disabled} onClick={() => onChange({ color: null })} className={cn('psc:size-8 psc:cursor-pointer psc:rounded-full psc:border-2 psc:bg-primary', value.color === null ? 'psc:border-foreground' : 'psc:border-transparent')} title={'Theme color'} />
                    {COLORS.map((color) => (
                        <button key={color} type={'button'} disabled={disabled} onClick={() => onChange({ color: color })} className={cn('psc:size-8 psc:cursor-pointer psc:rounded-full psc:border-2', value.color === color ? 'psc:border-foreground' : 'psc:border-transparent')} style={{ background: color }} title={color} />
                    ))}
                </div>
            </Section>

            {schedule && (
                <Section title={'Pause'}>
                    {schedule.pausedUntil ? (
                        <div className={'psc:flex psc:flex-wrap psc:items-center psc:gap-3'}>
                            <p className={'psc:flex-1 psc:text-sm'}>Paused until {new Date(schedule.pausedUntil).toLocaleString()}. Its trigger does nothing until then.</p>
                            {!disabled && (
                                <Button isSecondary disabled={busy} onClick={() => void act(() => api.pause(identifier, schedule.id, null), 'Resumed.')}>
                                    Resume now
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className={'psc:flex psc:flex-wrap psc:items-center psc:gap-3'}>
                            <p className={'psc:w-full psc:text-sm psc:text-muted-foreground'}>Hold the schedule until a date, for example over a holiday, without turning it off.</p>
                            <Input type={'datetime-local'} value={until} disabled={disabled} onChange={(event) => setUntil(event.target.value)} className={'psc:w-60'} />
                            {!disabled && (
                                <Button isSecondary disabled={busy || !until} onClick={() => void act(() => api.pause(identifier, schedule.id, new Date(until).toISOString()), 'Paused.')}>
                                    Pause until then
                                </Button>
                            )}
                        </div>
                    )}
                </Section>
            )}

            <Section title={'Export'}>
                <p className={'psc:mb-3 psc:text-sm psc:text-muted-foreground'}>A JSON file you can import on another server or keep. Discord webhooks are left out.</p>
                <Button isSecondary onClick={exportJson}>
                    <NamedIcon name={'download'} size={14} /> Export JSON
                </Button>
            </Section>

            {schedule && (
                <Section title={'Copy to other servers'}>
                    {state.servers.length === 0 ? (
                        <p className={'psc:text-sm psc:text-muted-foreground'}>You have no other servers where you may make schedules.</p>
                    ) : (
                        <div className={'psc:flex psc:flex-col psc:gap-3'}>
                            <div className={'psc:flex psc:max-h-48 psc:flex-col psc:gap-1.5 psc:overflow-y-auto'}>
                                {state.servers.map((server) => (
                                    <label key={server.identifier} className={'psc:flex psc:cursor-pointer psc:items-center psc:gap-2 psc:text-sm'}>
                                        <Check checked={targets.includes(server.identifier)} onChange={(on) => setTargets(on ? [...targets, server.identifier] : targets.filter((item) => item !== server.identifier))} label={server.name} />
                                        {server.name}
                                    </label>
                                ))}
                            </div>
                            <Button
                                isSecondary
                                className={'psc:self-start'}
                                disabled={busy || targets.length === 0}
                                onClick={async () => {
                                    setBusy(true);
                                    try {
                                        const copied = await api.copy(identifier, schedule.id, targets);
                                        toast.success(`Copied to ${copied.join(', ')}.`);
                                        setTargets([]);
                                    } catch (error) {
                                        toast.error(httpErrorToHuman(error));
                                    } finally {
                                        setBusy(false);
                                    }
                                }}
                            >
                                <NamedIcon name={'copy'} size={14} /> Copy to {targets.length || ''} {targets.length === 1 ? 'server' : 'servers'}
                            </Button>
                            <p className={'psc:text-xs psc:text-muted-foreground'}>The saved version is copied. &quot;Run another schedule&quot; steps need a schedule picked again there.</p>
                        </div>
                    )}
                </Section>
            )}

            {schedule && state.permissions.delete && (
                <Section title={'Delete'}>
                    <div className={'psc:flex psc:flex-wrap psc:items-center psc:gap-3'}>
                        <p className={'psc:flex-1 psc:text-sm psc:text-muted-foreground'}>The schedule and its history are removed. A run in progress is stopped.</p>
                        <Button.Danger isSecondary onClick={() => setDeleting(true)}>
                            Delete schedule
                        </Button.Danger>
                    </div>
                    {deleting && (
                        <Dialog.Confirm
                            open
                            title={`Delete ${schedule.name}?`}
                            confirm={'Delete'}
                            pending={busy}
                            onClose={() => setDeleting(false)}
                            onConfirmed={async () => {
                                if (await act(() => api.remove(identifier, schedule.id), 'Schedule deleted.')) onDeleted();
                            }}
                        >
                            This cannot be undone.
                        </Dialog.Confirm>
                    )}
                </Section>
            )}
        </div>
    );
}
