import { useEffect, useState } from 'react';
import { IconArchive, IconDownload } from '@tabler/icons-react';
import { formatBytes, type Backup, type Client } from './api';

/** The shared backups, each downloaded straight from where it is stored. */
export default function Backups({ api }: { api: Client }) {
    const [backups, setBackups] = useState<Backup[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.backups().then(setBackups, (caught: Error) => setError(caught.message));
    }, [api]);

    const download = (backup: Backup) =>
        api.backupDownload(backup.uuid).then(
            ({ url }) => window.location.assign(url),
            (caught: Error) => setError(caught.message)
        );

    return (
        <section className={'psh-card'}>
            <h2 className={'psh-title'}>Backups</h2>
            {error && <p className={'psh-error'}>{error}</p>}
            {backups === null && !error && <p className={'psh-muted'}>Loading…</p>}
            {backups?.length === 0 && <p className={'psh-muted'}>The shared backups are gone.</p>}
            <div className={'psh-list'}>
                {backups?.map((backup) => (
                    <button key={backup.uuid} type={'button'} className={'psh-entry'} onClick={() => void download(backup)}>
                        <IconArchive size={16} />
                        <span className={'psh-grow psh-truncate'}>{backup.name}</span>
                        <span className={'psh-muted'}>
                            {formatBytes(backup.size)}
                            {backup.completed_at && ` · ${new Date(backup.completed_at).toLocaleDateString()}`} <IconDownload size={14} />
                        </span>
                    </button>
                ))}
            </div>
        </section>
    );
}
