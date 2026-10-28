import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconClock, IconShare2 } from '@tabler/icons-react';
import { client, ended, type Info } from './api';
import Backups from './Backups';
import Console from './Console';
import Files from './Files';

/** The guest page: what the link allows, and nothing else. */
export default function App({ token }: { token: string | null }) {
    const api = useMemo(() => (token ? client(token) : null), [token]);
    const [info, setInfo] = useState<Info | null>(null);
    const [problem, setProblem] = useState<string | null>(token ? null : 'This link is not complete. Copy the whole link you were given and open it again.');

    const stop = useCallback((message: string) => {
        setInfo(null);
        setProblem(message);
    }, []);

    useEffect(() => {
        api?.info().then(setInfo, (error: Error) => setProblem(ended(error) ? error.message : `${error.message} Reload the page to try again.`));
    }, [api]);

    // The page closes itself when the link expires while it is open.
    useEffect(() => {
        if (!info) return;
        const left = new Date(info.expires_at).getTime() - Date.now();
        const timer = window.setTimeout(() => stop('This link has expired.'), Math.max(0, Math.min(left, 2_147_000_000)));

        return () => window.clearTimeout(timer);
    }, [info, stop]);

    return (
        <main className={'psh-page'}>
            <header className={'psh-row'}>
                <IconShare2 size={20} />
                <h1 className={'psh-heading psh-grow psh-truncate'}>{info?.server ?? 'Shared server'}</h1>
                {info && (
                    <span className={'psh-muted'}>
                        <IconClock size={14} /> Shared until {new Date(info.expires_at).toLocaleString()}
                    </span>
                )}
            </header>

            {problem && <p className={'psh-card psh-error'}>{problem}</p>}
            {!problem && !info && <p className={'psh-muted'}>Opening…</p>}

            {api && info && (
                <>
                    {info.options.includes('console') && <Console api={api} options={info.options} onEnded={stop} />}
                    {!info.options.includes('console') && info.options.some((option) => ['start', 'stop', 'restart'].includes(option)) && <PowerOnly api={api} options={info.options} />}
                    {info.options.includes('files') && <Files api={api} />}
                    {info.options.includes('backups') && <Backups api={api} />}
                </>
            )}
        </main>
    );
}

/** Power buttons for a link that may use them without watching the console. */
function PowerOnly({ api, options }: { api: NonNullable<ReturnType<typeof client>>; options: Info['options'] }) {
    const [notice, setNotice] = useState<string | null>(null);

    return (
        <section className={'psh-card'}>
            <div className={'psh-row'}>
                {(['start', 'stop', 'restart'] as const)
                    .filter((signal) => options.includes(signal))
                    .map((signal) => (
                        <button
                            key={signal}
                            type={'button'}
                            className={'psh-button'}
                            onClick={() =>
                                api.power(signal).then(
                                    () => setNotice(`Sent ${signal}.`),
                                    (error: Error) => setNotice(error.message)
                                )
                            }
                        >
                            {signal[0].toUpperCase() + signal.slice(1)}
                        </button>
                    ))}
            </div>
            {notice && <p className={'psh-muted'}>{notice}</p>}
        </section>
    );
}
