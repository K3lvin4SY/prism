import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Spinner, cn, httpErrorToHuman, toast, useCurrentServerRequired } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { api, keys, type Schedule, type Step } from '../api';
import { STATUS } from '../components/ScheduleList';
import { getConfig } from '../config';
import { flatten, stepInfo } from '../steps';

const LEVEL: Record<string, string> = { info: 'psc:text-muted-foreground', success: 'psc:text-green-500', warning: 'psc:text-yellow-500', error: 'psc:text-destructive' };

/** The schedule's runs; a running one shows live with a Stop button. */
export default function HistoryTab({ schedule, steps }: { schedule: Schedule; steps: Step[] }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const runs = useQuery({
        queryKey: keys.runs(identifier, schedule.id),
        queryFn: () => api.runs(identifier, schedule.id),
        refetchInterval: (query) => (query.state.data?.some((run) => run.status === 'running') ? 2000 : 15_000),
    });
    const [picked, setPicked] = useState<number | null>(null);

    if (runs.isLoading) return <Spinner centered />;
    if (runs.isError) return <Alert type={'danger'}>{httpErrorToHuman(runs.error)}</Alert>;

    const list = runs.data ?? [];
    const selected = picked ?? list[0]?.id ?? null;

    if (list.length === 0) return <p className={'psc:rounded-lg psc:border psc:border-dashed psc:border-border psc:py-10 psc:text-center psc:text-sm psc:text-muted-foreground'}>No runs in the last {getConfig().historyDays} days.</p>;

    return (
        <div className={'psc:grid psc:gap-4 psc:lg:grid-cols-[18rem_minmax(0,1fr)]'}>
            <div className={'pt-surface psc:flex psc:max-h-[32rem] psc:flex-col psc:gap-1 psc:overflow-y-auto psc:rounded-lg psc:border psc:border-border psc:bg-card psc:p-1'}>
                {list.map((run) => {
                    const status = STATUS[run.status];

                    return (
                        <button key={run.id} type={'button'} onClick={() => setPicked(run.id)} className={cn('psc:flex psc:cursor-pointer psc:items-center psc:gap-2 psc:rounded-md psc:px-3 psc:py-2 psc:text-left psc:text-sm', selected === run.id ? 'psc:bg-muted' : 'psc:hover:bg-muted/50')}>
                            <NamedIcon name={status.icon} size={15} className={cn('psc:shrink-0', status.tone, run.status === 'running' && 'psc:animate-spin')} />
                            <span className={'psc:min-w-0 psc:flex-1'}>
                                <span className={'psc:block psc:truncate'}>{new Date(run.startedAt).toLocaleString()}</span>
                                <span className={'psc:block psc:truncate psc:text-xs psc:text-muted-foreground'}>
                                    {status.label} · {run.trigger === 'cron' ? 'on schedule' : run.trigger === 'manual' ? 'run by hand' : run.trigger.startsWith('schedule:') ? 'by another schedule' : `on ${run.trigger}`}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
            {selected !== null && <RunView id={selected} steps={steps} scheduleId={schedule.id} />}
        </div>
    );
}

function RunView({ id, steps, scheduleId }: { id: number; steps: Step[]; scheduleId: number }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const queryClient = useQueryClient();
    const run = useQuery({ queryKey: keys.run(identifier, id), queryFn: () => api.showRun(identifier, id), refetchInterval: (query) => (query.state.data?.status === 'running' ? 1500 : false) });
    const [stopping, setStopping] = useState(false);

    if (run.isLoading) return <Spinner centered />;
    if (run.isError || !run.data) return <Alert type={'danger'}>{httpErrorToHuman(run.error)}</Alert>;

    const data = run.data;
    const all = flatten(steps);
    const position = all.findIndex((step) => step.id === data.step);
    const current = position >= 0 ? all[position] : null;
    const finished = data.finishedAt ? Math.round((Date.parse(data.finishedAt) - Date.parse(data.startedAt)) / 1000) : null;

    return (
        <div className={'pt-surface psc:flex psc:flex-col psc:gap-3 psc:rounded-lg psc:border psc:border-border psc:bg-card psc:p-4'}>
            <div className={'psc:flex psc:flex-wrap psc:items-center psc:gap-3'}>
                <NamedIcon name={STATUS[data.status].icon} size={18} className={cn(STATUS[data.status].tone, data.status === 'running' && 'psc:animate-spin')} />
                <div className={'psc:min-w-0 psc:flex-1'}>
                    <p className={'psc:font-semibold'}>{STATUS[data.status].label}</p>
                    <p className={'psc:text-xs psc:text-muted-foreground'}>
                        Started {new Date(data.startedAt).toLocaleString()}
                        {finished !== null && ` · took ${finished < 60 ? `${finished}s` : `${Math.floor(finished / 60)}m ${finished % 60}s`}`}
                    </p>
                </div>
                {data.status === 'running' && (
                    <Button.Danger
                        isSecondary
                        size={'small'}
                        isLoading={stopping}
                        onClick={async () => {
                            setStopping(true);
                            try {
                                await api.stop(identifier, data.id);
                                await Promise.all([run.refetch(), queryClient.invalidateQueries({ queryKey: keys.runs(identifier, scheduleId) }), queryClient.invalidateQueries({ queryKey: keys.state(identifier) })]);
                                toast.success('Stopped.');
                            } catch (error) {
                                toast.error(httpErrorToHuman(error));
                            } finally {
                                setStopping(false);
                            }
                        }}
                    >
                        <NamedIcon name={'square'} size={13} /> Stop
                    </Button.Danger>
                )}
            </div>

            {data.status === 'running' && current && (
                <div className={'psc:flex psc:flex-col psc:gap-1.5 psc:rounded-md psc:bg-primary/10 psc:px-3 psc:py-2'}>
                    <p className={'psc:flex psc:items-center psc:gap-2 psc:text-sm'}>
                        <NamedIcon name={stepInfo(current.type).icon} size={14} className={'psc:text-primary'} />
                        Step {position + 1} of {all.length}: {stepInfo(current.type).label}
                        {data.detail && <span className={'psc:text-muted-foreground'}>· {data.detail}</span>}
                    </p>
                    <div className={'psc:h-1.5 psc:overflow-hidden psc:rounded-full psc:bg-muted'}>
                        <div className={'psc:h-full psc:rounded-full psc:bg-primary psc:transition-all'} style={{ width: `${Math.max(4, ((position + 0.5) / all.length) * 100)}%` }} />
                    </div>
                </div>
            )}

            <ol className={'psc:flex psc:max-h-[26rem] psc:flex-col psc:gap-1 psc:overflow-y-auto psc:font-mono psc:text-xs'}>
                {(data.log ?? []).map((line, index) => (
                    <li key={index} className={'psc:flex psc:gap-3'}>
                        <span className={'psc:shrink-0 psc:tabular-nums psc:text-muted-foreground'}>{new Date(line.at).toLocaleTimeString()}</span>
                        <span className={cn('psc:min-w-0 psc:break-words', LEVEL[line.level])}>{line.text}</span>
                    </li>
                ))}
            </ol>
        </div>
    );
}
