import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Dialog, Input, Spinner, bytesToString, cn, httpErrorToHuman, useCurrentServerRequired } from '@pterodactyl/sdk';
import type { ViewProps } from '@pterodactyl/sdk/theme';
import { api, keys, snippets, type PrismDatabase } from '../api';
import { CopyField, Pills, Section, Tile, UsageChart, copy } from '../components/ui';

type Series = 'size' | 'rows' | 'tables';
type Snippet = 'CLI' | 'URI' | 'JDBC' | '.env';

export default function OverviewTab({ database, model, onDeleted }: { database: PrismDatabase; model: ViewProps<'server.databases'>['model']; onDeleted: () => void }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const overview = useQuery({ queryKey: keys.overview(identifier, database.id), queryFn: () => api.overview(identifier, database.id), refetchInterval: 30_000 });
    const [series, setSeries] = useState<Series>('size');
    const [snippet, setSnippet] = useState<Snippet>('CLI');
    const [deleting, setDeleting] = useState(false);
    const [confirm, setConfirm] = useState('');
    // The panel's own actions take its id for the database, found by name.
    const core = model.databases.find((item) => item.name === database.name);

    if (overview.isLoading) return <Spinner centered />;
    if (overview.isError || !overview.data) return <Alert type={'danger'}>{httpErrorToHuman(overview.error)}</Alert>;

    const data = overview.data;
    const examples = snippets(database, data.password);
    const format = series === 'size' ? bytesToString : (value: number) => value.toLocaleString();

    return (
        <div className={'pdb:flex pdb:flex-col pdb:gap-4'}>
            {data.error && <Alert type={'warning'}>{data.error}</Alert>}
            <div className={'pdb:grid pdb:gap-3 pdb:grid-cols-2 pdb:lg:grid-cols-4'}>
                <Tile label={'Size'} value={data.totals ? bytesToString(data.totals.size) : '—'} detail={data.totals ? `${data.totals.tables} tables` : undefined} />
                <Tile label={'Rows'} value={data.totals ? data.totals.rows.toLocaleString() : '—'} detail={'Estimated by MySQL'} />
                <Tile label={'Connections'} value={data.processes.length} detail={database.maxConnections ? `Up to ${database.maxConnections}` : 'No per-user limit'} />
                <Tile label={'Server'} value={data.version?.version.split('-')[0] ?? '—'} detail={data.version ? `${/mariadb/i.test(data.version.version + data.version.comment) ? 'MariaDB' : 'MySQL'} on ${database.hostName}` : undefined} />
            </div>

            <Section
                title={'Usage over 30 days'}
                actions={
                    <Pills
                        size={'sm'}
                        value={series}
                        onChange={setSeries}
                        options={[
                            { value: 'size', label: 'Size' },
                            { value: 'rows', label: 'Rows' },
                            { value: 'tables', label: 'Tables' },
                        ]}
                    />
                }
            >
                <UsageChart points={data.history.map((point) => ({ at: point.at, value: point[series] }))} format={format} />
            </Section>

            <div className={'pdb:grid pdb:gap-4 pdb:lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]'}>
                <Section title={'Connection details'}>
                    <div className={'pdb:grid pdb:gap-3 pdb:sm:grid-cols-2'}>
                        <CopyField label={'Host'} value={`${database.host}:${database.port}`} />
                        <CopyField label={'Database'} value={database.name} />
                        <CopyField label={'Username'} value={database.username} />
                        <CopyField label={'Password'} value={data.password} secret />
                        <CopyField label={'Connections from'} value={database.remote} />
                        <CopyField label={'Max connections'} value={database.maxConnections ? String(database.maxConnections) : 'Unlimited'} />
                    </div>
                    <div className={'pdb:mt-4 pdb:flex pdb:flex-wrap pdb:items-center pdb:gap-2'}>
                        <span className={'pdb:flex-1 pdb:text-xs pdb:uppercase pdb:tracking-wide pdb:text-muted-foreground'}>Connect with</span>
                        <Pills size={'sm'} value={snippet} onChange={setSnippet} options={(['CLI', 'URI', 'JDBC', '.env'] as Snippet[]).map((value) => ({ value, label: value }))} />
                    </div>
                    <pre className={'pdb:mt-2 pdb:overflow-x-auto pdb:rounded-md pdb:bg-black/30 pdb:p-3 pdb:font-mono pdb:text-xs pdb:whitespace-pre'}>{examples[snippet]}</pre>
                    <div className={'pdb:mt-2 pdb:flex pdb:justify-end pdb:gap-2'}>
                        {database.own && model.permissions.update && core && (
                            <Button size={'small'} isSecondary isLoading={model.rotating.includes(core.id)} onClick={() => model.actions.rotatePassword(core.id).then(() => overview.refetch())}>
                                Rotate password
                            </Button>
                        )}
                        <Button size={'small'} isSecondary onClick={() => copy(examples[snippet], `${snippet} copied`)}>
                            Copy
                        </Button>
                    </div>
                </Section>

                <Section title={'Active connections'}>
                    {data.processes.length === 0 ? (
                        <p className={'pdb:text-sm pdb:text-muted-foreground'}>Nothing is connected right now.</p>
                    ) : (
                        <div className={'pdb:flex pdb:flex-col pdb:gap-2'}>
                            {data.processes.map((process) => (
                                <div key={process.id} className={'pdb:text-sm'}>
                                    <p className={'pdb:font-mono'}>{process.host}</p>
                                    <p className={'pdb:text-xs pdb:text-muted-foreground'}>
                                        {process.command} · {process.time}s{process.state ? ` · ${process.state}` : ''}
                                    </p>
                                    {process.info && <p className={'pdb:truncate pdb:font-mono pdb:text-xs pdb:text-muted-foreground'}>{process.info}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                </Section>
            </div>

            {database.own && model.permissions.delete && core && (
                <div className={'pdb:flex pdb:flex-wrap pdb:items-center pdb:gap-3 pdb:rounded-lg pdb:border pdb:border-destructive/40 pdb:p-4'}>
                    <div className={'pdb:flex-1'}>
                        <p className={'pdb:font-medium'}>Delete this database</p>
                        <p className={'pdb:text-sm pdb:text-muted-foreground'}>Every table and row is deleted. Prism backups of it are deleted too.</p>
                    </div>
                    <Button.Danger onClick={() => setDeleting(true)}>Delete database</Button.Danger>
                </div>
            )}

            {deleting && core && (
                <Dialog open onClose={() => setDeleting(false)} title={`Delete ${database.name}?`}>
                    <p className={'pdb:text-sm'}>
                        Type <code className={'pdb:font-mono'}>{core.shortName}</code> to confirm.
                    </p>
                    <Input value={confirm} onChange={(event) => setConfirm(event.target.value)} className={'pdb:mt-2 pdb:font-mono'} autoFocus />
                    <Dialog.Footer>
                        <Button.Text onClick={() => setDeleting(false)}>Cancel</Button.Text>
                        <Button.Danger
                            disabled={confirm !== core.shortName && confirm !== core.name}
                            onClick={async () => {
                                await model.actions.remove(core.id).catch(() => undefined);
                                setDeleting(false);
                                onDeleted();
                            }}
                        >
                            Delete
                        </Button.Danger>
                    </Dialog.Footer>
                </Dialog>
            )}
            <p className={cn('pdb:text-xs pdb:text-muted-foreground', !overview.isFetching && 'pdb:invisible')}>Refreshing…</p>
        </div>
    );
}
