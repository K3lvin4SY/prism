import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Input, ProgressBar, bytesToString, cn, httpErrorToHuman, toast, useCurrentServerRequired, useServerPermission } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { api, keys, type PrismDatabase } from '../api';
import { Pills, Section } from '../components/ui';
import { getConfig } from '../config';
import FileRow from './FileRow';

/** Import a .sql or .sql.gz, and export the database to a download or the server's files. */
export default function TransferTab({ database }: { database: PrismDatabase }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const config = getConfig();
    const canWriteFiles = useServerPermission('file.create');
    const canReadFiles = useServerPermission('file.read-content');
    const files = useQuery({
        queryKey: keys.files(identifier, database.id),
        queryFn: () => api.files(identifier, database.id),
        refetchInterval: (query) => (query.state.data?.transfers.some((file) => file.status === 'running' || file.status === 'pending') ? 2000 : false),
    });
    const [source, setSource] = useState<'upload' | 'server'>('upload');
    const [target, setTarget] = useState<'download' | 'server'>('download');
    const [file, setFile] = useState<File | null>(null);
    const [path, setPath] = useState('/');
    const [exportPath, setExportPath] = useState(`/${database.name}-${new Date().toISOString().slice(0, 10)}.sql.gz`);
    const [emptyFirst, setEmptyFirst] = useState(false);
    const [stopOnError, setStopOnError] = useState(true);
    const [uploading, setUploading] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [dragging, setDragging] = useState(false);
    const picker = useRef<HTMLInputElement>(null);

    const choose = (picked: File | undefined) => {
        if (!picked) return;
        if (!/\.sql(\.gz)?$/i.test(picked.name)) return toast.error('Pick a .sql or .sql.gz file.');
        if (picked.size > config.importMaxBytes) return toast.error(`The file is larger than the ${bytesToString(config.importMaxBytes)} import limit.`);
        setFile(picked);
    };

    const run = async (action: () => Promise<unknown>, done: string) => {
        setBusy(true);
        try {
            await action();
            toast.success(done);
            await files.refetch();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
            setUploading(null);
        }
    };

    const importNow = () =>
        run(async () => {
            if (source === 'upload') {
                if (!file) throw new Error('Pick a file first.');
                setUploading(0);
                await api.importUpload(identifier, database.id, file, { emptyFirst, stopOnError }, setUploading);
                setFile(null);
            } else {
                await api.importPath(identifier, database.id, path, { emptyFirst, stopOnError });
            }
        }, 'The import started.');

    return (
        <div className={'pdb:flex pdb:flex-col pdb:gap-4'}>
            <div className={'pdb:grid pdb:gap-4 pdb:lg:grid-cols-2'}>
                <Section
                    title={'Import'}
                    actions={
                        <Pills
                            size={'sm'}
                            value={source}
                            onChange={setSource}
                            options={[
                                { value: 'upload', label: 'Upload' },
                                { value: 'server', label: 'From server files', disabled: !canReadFiles },
                            ]}
                        />
                    }
                >
                    <div className={'pdb:flex pdb:flex-col pdb:gap-3'}>
                        {source === 'upload' ? (
                            <button
                                type={'button'}
                                onClick={() => picker.current?.click()}
                                onDragOver={(event) => (event.preventDefault(), setDragging(true))}
                                onDragLeave={() => setDragging(false)}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    setDragging(false);
                                    choose(event.dataTransfer.files[0]);
                                }}
                                className={cn('pdb:flex pdb:flex-col pdb:items-center pdb:gap-1 pdb:rounded-lg pdb:border-2 pdb:border-dashed pdb:px-4 pdb:py-8 pdb:text-center pdb:cursor-pointer', dragging ? 'pdb:border-primary pdb:bg-primary/10' : 'pdb:border-border pdb:hover:border-primary/60')}
                            >
                                <NamedIcon name={'upload'} size={26} className={'pdb:text-primary'} />
                                <span className={'pdb:font-medium'}>{file ? file.name : 'Drop a .sql or .sql.gz file'}</span>
                                <span className={'pdb:text-xs pdb:text-muted-foreground'}>{file ? bytesToString(file.size) : `or click to browse · up to ${bytesToString(config.importMaxBytes)}`}</span>
                                <input ref={picker} type={'file'} accept={'.sql,.gz'} hidden onChange={(event) => (choose(event.target.files?.[0]), (event.target.value = ''))} />
                            </button>
                        ) : (
                            <label className={'pdb:flex pdb:flex-col pdb:gap-1 pdb:text-sm'}>
                                File on the server
                                <Input value={path} onChange={(event) => setPath(event.target.value)} placeholder={'/backups/luckperms.sql.gz'} className={'pdb:font-mono'} />
                            </label>
                        )}
                        {uploading !== null && <ProgressBar value={Math.round(uploading * 100)} />}
                        <label className={'pdb:flex pdb:items-center pdb:gap-2 pdb:text-sm'}>
                            <Checkbox checked={emptyFirst} onChange={setEmptyFirst} /> Empty the database first
                        </label>
                        <label className={'pdb:flex pdb:items-center pdb:gap-2 pdb:text-sm'}>
                            <Checkbox checked={stopOnError} onChange={setStopOnError} /> Stop at the first error
                        </label>
                        <div className={'pdb:flex pdb:items-center pdb:gap-2'}>
                            <p className={'pdb:flex-1 pdb:text-xs pdb:text-muted-foreground'}>Runs as {database.username}. USE and CREATE DATABASE lines are skipped.</p>
                            <Button onClick={importNow} isLoading={busy} disabled={source === 'upload' ? !file : path.trim() === ''}>
                                Import
                            </Button>
                        </div>
                    </div>
                </Section>

                <Section
                    title={'Export'}
                    actions={
                        <Pills
                            size={'sm'}
                            value={target}
                            onChange={setTarget}
                            options={[
                                { value: 'download', label: 'Download' },
                                { value: 'server', label: 'Save to server', disabled: !canWriteFiles },
                            ]}
                        />
                    }
                >
                    <div className={'pdb:flex pdb:h-full pdb:flex-col pdb:gap-3'}>
                        <p className={'pdb:text-sm pdb:text-muted-foreground'}>A complete .sql.gz of every table, view, routine and trigger. It opens with any MySQL client, and can be imported here again.</p>
                        {target === 'server' && (
                            <label className={'pdb:flex pdb:flex-col pdb:gap-1 pdb:text-sm'}>
                                Save as
                                <Input value={exportPath} onChange={(event) => setExportPath(event.target.value)} className={'pdb:font-mono'} />
                            </label>
                        )}
                        <div className={'pdb:mt-auto pdb:flex pdb:items-center pdb:gap-2'}>
                            <p className={'pdb:flex-1 pdb:text-xs pdb:text-muted-foreground'}>{target === 'download' ? `Downloads are kept for ${config.exportKeepHours === 24 ? 'a day' : `${config.exportKeepHours} hours`}.` : 'Overwrites a file with the same name.'}</p>
                            <Button onClick={() => run(() => api.export(identifier, database.id, target === 'server' ? exportPath : null), 'The export started.')} isLoading={busy}>
                                Export
                            </Button>
                        </div>
                    </div>
                </Section>
            </div>

            <Section title={'Recent imports and exports'}>
                {files.isError && <Alert type={'danger'}>{httpErrorToHuman(files.error)}</Alert>}
                {files.data && files.data.transfers.length === 0 ? (
                    <p className={'pdb:text-sm pdb:text-muted-foreground'}>Nothing yet.</p>
                ) : (
                    <div className={'pdb:-mx-4 pdb:-my-4'}>
                        {files.data?.transfers.map((item) => (
                            <FileRow key={item.id} database={database} file={item} />
                        ))}
                    </div>
                )}
            </Section>
        </div>
    );
}
