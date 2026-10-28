import { useEffect, useState } from 'react';
import { IconChevronLeft, IconDownload, IconFile, IconFolder } from '@tabler/icons-react';
import { formatBytes, type Client, type Entry } from './api';

/** The shared folders and files. Opening a folder lists it; a file downloads straight from the node. */
export default function Files({ api }: { api: Client }) {
    const [directory, setDirectory] = useState<string | null>(null);
    const [history, setHistory] = useState<(string | null)[]>([]);
    const [entries, setEntries] = useState<Entry[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let current = true;
        setEntries(null);
        setError(null);
        api.files(directory).then(
            (result) => current && setEntries(result.entries),
            (caught: Error) => current && setError(caught.message)
        );

        return () => {
            current = false;
        };
    }, [api, directory]);

    const open = (entry: Entry) => {
        if (entry.directory) {
            setHistory((past) => [...past, directory]);
            setDirectory(entry.path);

            return;
        }
        api.download(entry.path).then(
            ({ url }) => window.location.assign(url),
            (caught: Error) => setError(caught.message)
        );
    };

    return (
        <section className={'psh-card'}>
            <div className={'psh-row'}>
                {history.length > 0 && (
                    <button
                        type={'button'}
                        className={'psh-button psh-ghost'}
                        aria-label={'Back'}
                        onClick={() => {
                            setDirectory(history[history.length - 1]);
                            setHistory((past) => past.slice(0, -1));
                        }}
                    >
                        <IconChevronLeft size={16} />
                    </button>
                )}
                <h2 className={'psh-title'}>Files</h2>
                {directory && <code className={'psh-muted psh-truncate'}>{directory}</code>}
            </div>
            {error && <p className={'psh-error'}>{error}</p>}
            {entries === null && !error && <p className={'psh-muted'}>Loading…</p>}
            {entries?.length === 0 && <p className={'psh-muted'}>Nothing here.</p>}
            <div className={'psh-list'}>
                {entries?.map((entry) => (
                    <button key={entry.path} type={'button'} className={'psh-entry'} onClick={() => open(entry)}>
                        {entry.directory ? <IconFolder size={16} /> : <IconFile size={16} />}
                        <span className={'psh-grow psh-truncate'}>{entry.name}</span>
                        {!entry.directory && (
                            <span className={'psh-muted'}>
                                {formatBytes(entry.size)} <IconDownload size={14} />
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </section>
    );
}
