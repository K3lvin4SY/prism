import { useEffect, useRef, useState } from 'react';
import { Alert, ProgressBar, useCurrentServerRequired, useExtensionJobProgress } from '@pterodactyl/sdk';
import { advancePlan } from '../api/client';

interface Props {
    job: string;
    onFinished?: (status: 'completed' | 'failed') => void;
}

/** How long a plan may wait for the Panel's queue worker before this page runs it itself. */
const TAKE_OVER_AFTER_MS = 12_000;

/**
 * Runs the plan from this page when the Panel's queue worker does not: after a short wait it
 * asks the server to run a slice at a time, and the server only does so while no worker has
 * touched the plan lately. Returns whether this page has been running it.
 */
function usePageRunner(identifier: string, job: string, finished: boolean, onDone: () => void): boolean {
    const [running, setRunning] = useState(false);

    useEffect(() => {
        if (finished) return;
        let stopped = false;
        let timer = 0;
        const next = (ms: number) => {
            if (!stopped) timer = window.setTimeout(step, ms);
        };
        const step = async () => {
            try {
                const result = await advancePlan(identifier, job);
                if (stopped) return;
                if (result === 'done') {
                    onDone();
                    return;
                }
                if (result === 'busy') {
                    next(10_000);
                    return;
                }
                setRunning(true);
                onDone();
                next(result === 'more' ? 500 : 3_000);
            } catch {
                next(10_000);
            }
        };
        next(TAKE_OVER_AFTER_MS);

        return () => {
            stopped = true;
            window.clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [identifier, job, finished]);

    return running;
}

/** Live progress of an install, run by the Panel's queue or, failing that, by this page. */
export default function JobProgress({ job, onFinished }: Props) {
    const server = useCurrentServerRequired();
    const progress = useExtensionJobProgress(job, { serverUuid: server.attributes.uuid });
    const reported = useRef(false);
    const status = progress.data?.status;
    const finished = status === 'completed' || status === 'failed';
    const pageRunning = usePageRunner(server.attributes.identifier, job, finished, () => void progress.refetch());

    useEffect(() => {
        if (!reported.current && (status === 'completed' || status === 'failed')) {
            reported.current = true;
            onFinished?.(status);
        }
    }, [status, onFinished]);

    // While the egg reinstalls the server, the Panel answers 409 for a while; only a 404 means the job is gone.
    const httpStatus = (progress.error as { response?: { status?: number } } | null)?.response?.status;
    if (progress.isError && httpStatus === 404 && !progress.data) {
        return <Alert type={'warning'}>Progress for this install is no longer available.</Alert>;
    }

    const data = progress.data;
    const reinstalling = progress.isError && httpStatus === 409;
    if (data?.status === 'failed') {
        return <Alert type={'danger'}>{data.message}</Alert>;
    }

    if (data?.status === 'completed') {
        return <Alert type={'success'}>{data.message}</Alert>;
    }

    return (
        <div className={'pt-surface fct:flex fct:flex-col fct:gap-2 fct:rounded-md fct:border fct:border-border fct:bg-card fct:p-4'}>
            <div className={'fct:flex fct:justify-between fct:text-sm'}>
                <span>{reinstalling ? 'The egg is reinstalling the server…' : (data?.message ?? 'Starting…')}</span>
                <span className={'fct:text-muted-foreground'}>{data?.percent ?? 0}%</span>
            </div>
            <ProgressBar value={data?.percent ?? 0} label={data?.message ?? 'Install progress'} />
            {pageRunning && !reinstalling && (
                <p className={'fct:text-xs fct:text-muted-foreground'}>
                    The Panel's background queue is not picking this up, so this page is running it. Keep the page open until it finishes; an admin may want to check the Panel's queue worker.
                </p>
            )}
        </div>
    );
}
