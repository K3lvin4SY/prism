import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input, NamedIcon, Select, cn, useCurrentServerRequired } from '@pterodactyl/sdk';
import { api, keys, type State, type Trigger, type TriggerType } from '../api';
import { Section } from '../components/ui';
import { getConfig } from '../config';
import { build, describe, parse, type CronMode, type CronParts } from '../cron';
import { DAYS } from '../steps';

const QUICK: { label: string; cron: string }[] = [
    { label: 'Every 15 minutes', cron: '*/15 * * * *' },
    { label: 'Every hour', cron: '0 * * * *' },
    { label: 'Every 6 hours', cron: '0 */6 * * *' },
    { label: 'Daily at 04:00', cron: '0 4 * * *' },
    { label: 'Weekdays at 08:00', cron: '0 8 * * 1,2,3,4,5' },
    { label: 'Sundays at 03:00', cron: '0 3 * * 0' },
];

/** When the schedule runs: on a clock, on a server event, or only by hand. */
export default function TriggerTab({ state, trigger, onChange, disabled }: { state: State; trigger: Trigger; onChange: (trigger: Trigger) => void; disabled: boolean }) {
    const config = getConfig();
    const kinds: { type: TriggerType; label: string; icon: string; description: string; off?: string }[] = [
        { type: 'cron', label: 'On a schedule', icon: 'clock', description: 'At set times: every day, every hour, on weekdays…' },
        { type: 'crash', label: 'Server crashes', icon: 'flame', description: 'When the server stops without being asked.', off: config.stateTriggers ? undefined : 'Turned off by the administrator.' },
        { type: 'start', label: 'Server starts', icon: 'play', description: 'Each time the server comes online.', off: config.stateTriggers ? undefined : 'Turned off by the administrator.' },
        { type: 'stop', label: 'Server stops', icon: 'square', description: 'When the server is stopped on purpose.', off: config.stateTriggers ? undefined : 'Turned off by the administrator.' },
        { type: 'empty', label: 'Server is empty', icon: 'user-x', description: 'When nobody has been online for a while.', off: !config.emptyTrigger ? 'Turned off by the administrator.' : !state.minecraft ? 'Only for Minecraft servers.' : undefined },
        { type: 'manual', label: 'Only by hand', icon: 'hand', description: 'With Run now, or from another schedule.' },
    ];

    return (
        <div className={'psc:flex psc:flex-col psc:gap-4'}>
            <div className={'psc:grid psc:gap-2 psc:sm:grid-cols-2 psc:lg:grid-cols-3'}>
                {kinds.map((kind) => (
                    <button
                        key={kind.type}
                        type={'button'}
                        disabled={disabled || (!!kind.off && trigger.type !== kind.type)}
                        onClick={() => onChange(kind.type === 'cron' ? { type: 'cron', cron: trigger.cron ?? '0 4 * * *' } : kind.type === 'empty' ? { type: 'empty', minutes: trigger.minutes ?? 10 } : { type: kind.type })}
                        className={cn('psc:flex psc:cursor-pointer psc:items-start psc:gap-3 psc:rounded-lg psc:border psc:p-3 psc:text-left psc:disabled:cursor-not-allowed psc:disabled:opacity-50', trigger.type === kind.type ? 'psc:border-primary psc:bg-primary/10' : 'psc:border-border psc:bg-card')}
                    >
                        <NamedIcon name={kind.icon} size={18} className={'psc:mt-0.5 psc:shrink-0 psc:text-primary'} />
                        <span>
                            <span className={'psc:block psc:font-medium'}>{kind.label}</span>
                            <span className={'psc:block psc:text-xs psc:text-muted-foreground'}>{kind.off ?? kind.description}</span>
                        </span>
                    </button>
                ))}
            </div>

            {trigger.type === 'cron' && <CronEditor state={state} cron={trigger.cron ?? ''} onChange={(cron) => onChange({ type: 'cron', cron })} disabled={disabled} />}

            {trigger.type === 'empty' && (
                <Section title={'How long empty'}>
                    <label className={'psc:flex psc:items-center psc:gap-2 psc:text-sm'}>
                        Run once nobody has been online for
                        <Input type={'number'} min={1} max={1440} value={trigger.minutes ?? 10} disabled={disabled} onChange={(event) => onChange({ type: 'empty', minutes: Math.max(1, Math.min(1440, Number(event.target.value))) })} className={'psc:w-24'} />
                        minutes.
                    </label>
                    <p className={'psc:mt-2 psc:text-xs psc:text-muted-foreground'}>The panel sends &quot;list&quot; to the server once a minute to count players. It runs again only after someone has joined and left.</p>
                </Section>
            )}

            {['start', 'stop', 'crash'].includes(trigger.type) && (
                <p className={'psc:text-sm psc:text-muted-foreground'}>The panel checks the server once a minute. Going down counts as a crash when nobody asked for it: no stop, restart or kill, and no stop command in the console. That is decided a minute after the server goes down, once the node has reported what happened.</p>
            )}
        </div>
    );
}

function CronEditor({ state, cron, onChange, disabled }: { state: State; cron: string; onChange: (cron: string) => void; disabled: boolean }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const [parts, setParts] = useState<CronParts>(() => parse(cron));
    const preview = useQuery({ queryKey: keys.cron(identifier, cron), queryFn: () => api.cron(identifier, cron), staleTime: 60_000 });

    useEffect(() => {
        if (build(parts) !== cron) setParts(parse(cron));
        // Only when the expression changes from outside.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cron]);

    const change = (patch: Partial<CronParts>) => {
        const next = { ...parts, ...patch };
        setParts(next);
        onChange(build(next));
    };

    const time = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
    const setTime = (value: string) => {
        const [hour, minute] = value.split(':').map(Number);
        change({ hour: hour || 0, minute: minute || 0 });
    };

    return (
        <Section title={'When'} actions={<span className={'psc:text-xs psc:text-muted-foreground'}>{state.timezone}</span>}>
            <div className={'psc:flex psc:flex-col psc:gap-4'}>
                <div className={'psc:flex psc:flex-wrap psc:gap-2'}>
                    {QUICK.map((quick) => (
                        <button key={quick.cron} type={'button'} disabled={disabled} onClick={() => onChange(quick.cron)} className={cn('psc:cursor-pointer psc:rounded-full psc:border psc:px-3 psc:py-1 psc:text-xs', cron === quick.cron ? 'psc:border-primary psc:text-primary' : 'psc:border-border psc:hover:border-primary')}>
                            {quick.label}
                        </button>
                    ))}
                </div>

                <div className={'psc:flex psc:flex-wrap psc:items-center psc:gap-3 psc:text-sm'}>
                    <div className={'psc:w-44'}>
                        <Select
                            value={parts.mode}
                            disabled={disabled}
                            onChange={(mode) => change({ mode: mode as CronMode, custom: cron })}
                            options={[
                                { value: 'minutes', label: 'Every few minutes' },
                                { value: 'hourly', label: 'Hourly' },
                                { value: 'daily', label: 'Daily' },
                                { value: 'weekly', label: 'Weekly' },
                                { value: 'monthly', label: 'Monthly' },
                                { value: 'custom', label: 'Cron expression' },
                            ]}
                        />
                    </div>
                    {parts.mode === 'minutes' && (
                        <label className={'psc:flex psc:items-center psc:gap-2'}>
                            every <Input type={'number'} min={1} max={59} value={parts.every} disabled={disabled} onChange={(event) => change({ every: Math.max(1, Math.min(59, Number(event.target.value))) })} className={'psc:w-20'} /> minutes
                        </label>
                    )}
                    {parts.mode === 'hourly' && (
                        <>
                            <label className={'psc:flex psc:items-center psc:gap-2'}>
                                every <Input type={'number'} min={1} max={23} value={parts.every} disabled={disabled} onChange={(event) => change({ every: Math.max(1, Math.min(23, Number(event.target.value))) })} className={'psc:w-20'} /> hours
                            </label>
                            <label className={'psc:flex psc:items-center psc:gap-2'}>
                                at minute <Input type={'number'} min={0} max={59} value={parts.minute} disabled={disabled} onChange={(event) => change({ minute: Math.max(0, Math.min(59, Number(event.target.value))) })} className={'psc:w-20'} />
                            </label>
                        </>
                    )}
                    {['daily', 'weekly', 'monthly'].includes(parts.mode) && (
                        <label className={'psc:flex psc:items-center psc:gap-2'}>
                            at <Input type={'time'} value={time} disabled={disabled} onChange={(event) => setTime(event.target.value)} className={'psc:w-32'} />
                        </label>
                    )}
                    {parts.mode === 'monthly' && (
                        <label className={'psc:flex psc:items-center psc:gap-2'}>
                            on day <Input type={'number'} min={1} max={31} value={parts.dayOfMonth} disabled={disabled} onChange={(event) => change({ dayOfMonth: Math.max(1, Math.min(31, Number(event.target.value))) })} className={'psc:w-20'} />
                        </label>
                    )}
                    {parts.mode === 'custom' && <Input value={parts.custom} disabled={disabled} onChange={(event) => change({ custom: event.target.value })} placeholder={'0 4 * * *'} className={'psc:w-56 psc:font-mono'} aria-label={'Cron expression'} />}
                </div>

                {parts.mode === 'weekly' && (
                    <div className={'psc:flex psc:gap-1'}>
                        {DAYS.map((label, day) => {
                            const on = parts.days.includes(day);

                            return (
                                <button key={day} type={'button'} disabled={disabled} onClick={() => change({ days: on ? parts.days.filter((item) => item !== day) : [...parts.days, day] })} className={cn('psc:cursor-pointer psc:rounded-md psc:border psc:px-3 psc:py-1.5 psc:text-sm', on ? 'psc:border-primary psc:bg-primary psc:text-primary-foreground' : 'psc:border-border psc:text-muted-foreground')}>
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className={'psc:rounded-md psc:bg-muted/40 psc:px-3 psc:py-2 psc:text-sm'}>
                    <p className={'psc:font-medium'}>
                        {describe(cron)} <code className={'psc:ml-2 psc:font-mono psc:text-xs psc:text-muted-foreground'}>{cron}</code>
                    </p>
                    {preview.data && !preview.data.valid && <p className={'psc:text-destructive'}>That is not a valid cron expression.</p>}
                    {preview.data?.valid && <p className={'psc:text-xs psc:text-muted-foreground'}>Next: {preview.data.next.map((iso) => new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })).join(' · ')}</p>}
                </div>
            </div>
        </Section>
    );
}
