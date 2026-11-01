import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Spinner, cn, httpErrorToHuman, toast, useCurrentServerRequired } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { api, keys, type LogLine, type Run, type Schedule, type Step } from '../api';
import { STATUS } from '../components/ScheduleList';
import { getConfig } from '../config';
import { flatten, stepInfo, summary } from '../steps';

const LEVEL: Record<string, string> = { info: '', success: 'psc:text-success', warning: 'psc:text-warning', error: 'psc:text-destructive' };
const DOT: Record<string, string> = { running: 'psc:bg-primary psc:animate-pulse', done: 'psc:bg-success', failed: 'psc:bg-destructive', cancelled: 'psc:bg-warning', skipped: 'psc:bg-muted-foreground' };

/** The schedule's runs beside the one picked, its steps as cards and its output below; a running one shows live. */
export default function HistoryTab({ schedule, steps, schedules }: { schedule: Schedule; steps: Step[]; schedules: Schedule[] }) {
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
        <div className={'pt-surface psc:grid psc:overflow-hidden psc:rounded-xl psc:border psc:border-border psc:bg-card psc:lg:grid-cols-[18rem_minmax(0,1fr)]'}>
            <div className={'psc:flex psc:max-h-[36rem] psc:flex-col psc:gap-1 psc:overflow-y-auto psc:border-b psc:border-border psc:p-3 psc:lg:border-r psc:lg:border-b-0'}>
                <p className={'psc:px-2 psc:pt-1 psc:pb-2 psc:font-mono psc:text-[0.7rem] psc:tracking-[0.2em] psc:text-muted-foreground psc:uppercase'}>Runs</p>
                {list.map((run) => (
                    <button
                        key={run.id}
                        type={'button'}
                        onClick={() => setPicked(run.id)}
                        className={cn('psc:flex psc:cursor-pointer psc:items-start psc:gap-2.5 psc:rounded-lg psc:border psc:px-3 psc:py-2 psc:text-left psc:transition-colors', selected === run.id ? 'psc:border-primary psc:bg-primary/10' : 'psc:border-transparent psc:hover:bg-muted/50')}
                    >
                        <span className={cn('psc:mt-1.5 psc:size-2 psc:shrink-0 psc:rounded-full', DOT[run.status])} />
                        <span className={'psc:min-w-0 psc:flex-1'}>
                            <span className={'psc:block psc:truncate psc:text-sm psc:font-semibold'}>{when(run.startedAt)}</span>
                            <span className={'psc:block psc:truncate psc:text-xs psc:text-muted-foreground'}>{runLine(run)}</span>
                        </span>
                    </button>
                ))}
            </div>
            {selected !== null && <RunView id={selected} steps={steps} schedule={schedule} schedules={schedules} />}
        </div>
    );
}

type StepState = 'done' | 'warning' | 'failed' | 'stopped' | 'running' | 'pending';

interface StepCard {
    id: string;
    step: Step | null;
    state: StepState;
    lines: LogLine[];
    start: number | null;
    end: number | null;
}

function RunView({ id, steps, schedule, schedules }: { id: number; steps: Step[]; schedule: Schedule; schedules: Schedule[] }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const queryClient = useQueryClient();
    const run = useQuery({ queryKey: keys.run(identifier, id), queryFn: () => api.showRun(identifier, id), refetchInterval: (query) => (query.state.data?.status === 'running' ? 1500 : false) });
    const [stopping, setStopping] = useState(false);
    const [focus, setFocus] = useState<string | null>(null);
    const running = run.data?.status === 'running';
    const now = useNow(running);

    useEffect(() => setFocus(null), [id]);

    if (run.isLoading) return <Spinner centered />;
    if (run.isError || !run.data) return <Alert type={'danger'}>{httpErrorToHuman(run.error)}</Alert>;

    const data = run.data;
    const all = flatten(steps);
    const position = all.findIndex((step) => step.id === data.step);
    const cards = stepCards(data, steps, now);
    const log = (data.log ?? []).filter((line) => focus === null || line.step === focus);
    const focused = cards.find((card) => card.id === focus);
    const status = STATUS[data.status];

    return (
        <div className={'psc:flex psc:min-w-0 psc:flex-col psc:gap-3 psc:p-4 psc:lg:p-5'}>
            <div className={'psc:flex psc:flex-wrap psc:items-center psc:gap-3'}>
                <h3 className={'psc:truncate psc:text-lg psc:font-semibold'}>{schedule.name}</h3>
                <span className={cn('psc:rounded-full psc:px-2.5 psc:py-0.5 psc:text-xs', running ? 'psc:bg-primary/15 psc:text-primary' : 'psc:bg-muted psc:text-muted-foreground')}>
                    {status.label}
                    {running && position >= 0 && ` · step ${position + 1} of ${all.length}`}
                    {!running && data.finishedAt && ` · ${long(Date.parse(data.finishedAt) - Date.parse(data.startedAt))}`}
                </span>
                <span className={'psc:text-xs psc:text-muted-foreground'}>{new Date(data.startedAt).toLocaleString()}</span>
                {running && (
                    <Button.Danger
                        isSecondary
                        size={'small'}
                        isLoading={stopping}
                        className={'psc:ml-auto'}
                        onClick={async () => {
                            setStopping(true);
                            try {
                                await api.stop(identifier, data.id);
                                await Promise.all([run.refetch(), queryClient.invalidateQueries({ queryKey: keys.runs(identifier, schedule.id) }), queryClient.invalidateQueries({ queryKey: keys.state(identifier) })]);
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

            {cards.length > 0 && (
                <div className={'psc:flex psc:flex-col psc:gap-2'}>
                    {cards.map((card) => (
                        <StepCardView key={card.id} card={card} detail={card.state === 'running' ? data.detail : null} now={now} schedules={schedules} focused={focus === card.id} onFocus={card.lines.length > 0 ? () => setFocus(focus === card.id ? null : card.id) : undefined} />
                    ))}
                </div>
            )}

            <div className={'psc:flex psc:min-h-40 psc:flex-col psc:gap-2 psc:rounded-lg psc:bg-black/25 psc:p-4'}>
                {focused && (
                    <p className={'psc:flex psc:items-center psc:gap-2 psc:text-xs psc:text-muted-foreground'}>
                        Only {focused.step ? stepInfo(focused.step.type).label : 'this step'}
                        <button type={'button'} onClick={() => setFocus(null)} className={'psc:cursor-pointer psc:text-primary psc:hover:underline'}>
                            Show all
                        </button>
                    </p>
                )}
                <ol className={'psc:flex psc:max-h-[22rem] psc:flex-col psc:gap-1 psc:overflow-y-auto psc:font-mono psc:text-xs psc:leading-relaxed'}>
                    {log.map((line, index) => (
                        <li key={index} className={cn('psc:flex psc:gap-3', index === log.length - 1 ? 'psc:text-foreground' : 'psc:text-muted-foreground')}>
                            <span className={'psc:shrink-0 psc:tabular-nums psc:opacity-80'}>{new Date(line.at).toLocaleTimeString()}</span>
                            <span className={cn('psc:min-w-0 psc:break-words', LEVEL[line.level])}>{line.text}</span>
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    );
}

const MARK: Record<StepState, { icon?: string; className: string }> = {
    done: { icon: 'check', className: 'psc:bg-success/15 psc:text-success' },
    warning: { icon: 'triangle-alert', className: 'psc:bg-warning/15 psc:text-warning' },
    failed: { icon: 'x', className: 'psc:bg-destructive/15 psc:text-destructive' },
    stopped: { icon: 'square', className: 'psc:bg-warning/15 psc:text-warning' },
    running: { className: '' },
    pending: { className: 'psc:border psc:border-dashed psc:border-muted-foreground/50' },
};

function StepCardView({ card, detail, now, schedules, focused, onFocus }: { card: StepCard; detail: string | null; now: number; schedules: Schedule[]; focused: boolean; onFocus?: () => void }) {
    const info = card.step ? stepInfo(card.step.type) : null;
    const text = card.step ? summary(card.step, (id) => schedules.find((item) => item.id === id)?.name) : 'A step no longer in this schedule';
    const elapsed = card.start !== null ? (card.end ?? now) - card.start : null;
    const total = card.step && card.state === 'running' ? planned(card.step) : null;
    const mark = MARK[card.state];

    return (
        <button
            type={'button'}
            disabled={!onFocus}
            onClick={onFocus}
            className={cn(
                'psc:flex psc:flex-col psc:gap-2.5 psc:rounded-lg psc:border psc:px-4 psc:py-3 psc:text-left psc:transition-colors psc:enabled:cursor-pointer',
                card.state === 'running' ? 'psc:border-primary psc:bg-primary/10' : focused ? 'psc:border-primary/60 psc:bg-muted/50' : 'psc:border-transparent psc:bg-muted/30 psc:enabled:hover:bg-muted/50',
                card.state === 'pending' && 'psc:opacity-50',
            )}
        >
            <span className={'psc:flex psc:w-full psc:items-center psc:gap-3'}>
                {card.state === 'running' ? (
                    <span className={'psc:size-5 psc:shrink-0 psc:animate-spin psc:rounded-full psc:border-2 psc:border-primary psc:border-t-transparent'} />
                ) : (
                    <span className={cn('psc:flex psc:size-6 psc:shrink-0 psc:items-center psc:justify-center psc:rounded-full', mark.className)}>{mark.icon && <NamedIcon name={mark.icon} size={14} />}</span>
                )}
                <span className={'psc:flex psc:min-w-0 psc:flex-1 psc:flex-col'}>
                    <span className={'psc:flex psc:min-w-0 psc:items-baseline psc:gap-1.5'}>
                        {info && text.startsWith(info.label) ? (
                            <span className={'psc:min-w-0 psc:truncate psc:font-medium'}>{text}</span>
                        ) : (
                            <>
                                <span className={'psc:shrink-0 psc:font-medium'}>{info?.label ?? 'Removed step'}</span>
                                <span className={'psc:min-w-0 psc:truncate psc:text-sm psc:text-muted-foreground'}>· {text}</span>
                            </>
                        )}
                    </span>
                    {detail && <span className={'psc:truncate psc:text-xs psc:text-muted-foreground'}>{detail}</span>}
                </span>
                {elapsed !== null && card.state !== 'pending' && <span className={'psc:shrink-0 psc:font-mono psc:text-xs psc:tabular-nums psc:text-muted-foreground'}>{clock(elapsed)}</span>}
            </span>
            {card.state === 'running' && (
                <span className={'psc:block psc:h-1.5 psc:w-full psc:overflow-hidden psc:rounded-full psc:bg-muted'}>
                    {total ? (
                        <span className={'psc:block psc:h-full psc:rounded-full psc:bg-primary psc:transition-all'} style={{ width: `${Math.min(100, Math.max(2, ((elapsed ?? 0) / total) * 100))}%` }} />
                    ) : (
                        <span className={'psc:block psc:h-full psc:w-1/3 psc:animate-pulse psc:rounded-full psc:bg-primary'} />
                    )}
                </span>
            )}
        </button>
    );
}

/**
 * The steps a run reached, in the order it reached them, from the step each log line names. Most
 * steps write their line when they finish, so a step runs from the end of the one before (or the run's
 * start); a wait or countdown writes as it begins, which also marks where the step before it ended.
 * While the run is going, the steps still to come follow, dimmed.
 */
function stepCards(run: Run, steps: Step[], now: number): StepCard[] {
    const all = flatten(steps);
    const cards: StepCard[] = [];

    for (const line of run.log ?? []) {
        if (line.step === null) continue;
        let card = cards.find((item) => item.id === line.step);
        if (!card) {
            card = { id: line.step, step: all.find((step) => step.id === line.step) ?? null, state: 'done', lines: [], start: null, end: null };
            cards.push(card);
        }
        card.lines.push(line);
    }

    const running = run.status === 'running';
    if (running && run.step !== null && !cards.some((card) => card.id === run.step)) {
        cards.push({ id: run.step, step: all.find((step) => step.id === run.step) ?? null, state: 'done', lines: [], start: null, end: null });
    }

    const first = (card: StepCard) => (card.lines.length > 0 ? Date.parse(card.lines[0].at) : null);
    const last = (card: StepCard) => (card.lines.length > 0 ? Date.parse(card.lines[card.lines.length - 1].at) : null);
    const beginsWithLine = (card: StepCard | undefined) => card?.step?.type === 'wait' || card?.step?.type === 'countdown';
    let cursor = Date.parse(run.startedAt);

    cards.forEach((card, index) => {
        const next = cards[index + 1];
        const level = card.lines[card.lines.length - 1]?.level;
        card.start = beginsWithLine(card) ? (first(card) ?? cursor) : cursor;

        if (running && card.id === run.step) {
            card.state = 'running';
            card.start = Math.min(card.start, now);
            card.end = null;
        } else {
            const ended = next ? (beginsWithLine(next) ? first(next) : null) : run.finishedAt ? Date.parse(run.finishedAt) : null;
            card.end = Math.max(last(card) ?? card.start, ended ?? 0);
            if (level === 'error') card.state = 'failed';
            else if (run.status === 'cancelled' && card.id === run.step && level !== 'success') card.state = 'stopped';
            else if (level === 'warning') card.state = 'warning';
        }

        cursor = card.end ?? cursor;
    });

    if (running && run.step !== null) {
        const top = steps.findIndex((step) => flatten([step]).some((item) => item.id === run.step));
        for (const step of top >= 0 ? steps.slice(top + 1) : []) {
            if (!cards.some((card) => card.id === step.id)) cards.push({ id: step.id, step, state: 'pending', lines: [], start: null, end: null });
        }
    }

    return cards;
}

/** How long a step that waits is meant to take, in milliseconds, for its progress bar. */
function planned(step: Step): number | null {
    const seconds = step.type === 'wait' || step.type === 'countdown' ? Number(step.config.seconds) : step.type === 'waitFor' ? Number(step.config.timeout) : 0;

    return seconds > 0 ? seconds * 1000 : null;
}

/** The current time, ticking each second while `live`. */
function useNow(live: boolean): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!live) return;
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 1000);

        return () => window.clearInterval(timer);
    }, [live]);

    return now;
}

/** 0:42, 10:00, 1:02:03 */
function clock(ms: number): string {
    const total = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, '0');

    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** 38 s, 1 min 6 s, 11 min */
function long(ms: number): string {
    const total = Math.max(0, Math.round(ms / 1000));
    if (total < 60) return `${total} s`;
    const minutes = Math.floor(total / 60);
    if (minutes >= 10 || total % 60 === 0) return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;

    return `${minutes} min ${total % 60} s`;
}

/** Today 04:00, Yesterday 21:14, 28 Oct 04:00 */
function when(iso: string): string {
    const date = new Date(iso);
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
    if (days === 0) return `Today ${time}`;
    if (days === 1) return `Yesterday ${time}`;

    return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

function runLine(run: Run): string {
    const by = run.trigger === 'cron' ? 'on schedule' : run.trigger === 'manual' ? 'run by hand' : run.trigger.startsWith('schedule:') ? 'by another schedule' : `on ${run.trigger}`;
    const outcome = run.status === 'done' && run.finishedAt ? long(Date.parse(run.finishedAt) - Date.parse(run.startedAt)) : STATUS[run.status].label;

    return `${outcome} · ${by}`;
}
