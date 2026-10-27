import { useEffect, useRef } from 'react';
import { Alert, ProgressBar, useCurrentServerRequired, useExtensionJobProgress } from '@pterodactyl/sdk';

interface Props {
    job: string;
    onFinished?: (status: 'completed' | 'failed') => void;
}

/** Live progress of an install running on the queue. */
export default function JobProgress({ job, onFinished }: Props) {
    const server = useCurrentServerRequired();
    const progress = useExtensionJobProgress(job, { serverUuid: server.attributes.uuid });
    const reported = useRef(false);
    const status = progress.data?.status;

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
        <div className={'pt-surface cks:flex cks:flex-col cks:gap-2 cks:rounded-md cks:border cks:border-border cks:bg-card cks:p-4'}>
            <div className={'cks:flex cks:justify-between cks:text-sm'}>
                <span>{reinstalling ? 'The egg is reinstalling the server…' : (data?.message ?? 'Starting…')}</span>
                <span className={'cks:text-muted-foreground'}>{data?.percent ?? 0}%</span>
            </div>
            <ProgressBar value={data?.percent ?? 0} label={data?.message ?? 'Install progress'} />
        </div>
    );
}
