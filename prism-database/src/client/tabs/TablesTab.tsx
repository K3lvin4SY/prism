import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Dialog, Input, Select, Spinner, TextArea, bytesToString, cn, httpErrorToHuman, toast, useCurrentServerRequired, useServerPermission } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { api, cellText, keys, type Column, type PrismDatabase, type Row, type Table } from '../api';
import { Pills, copy } from '../components/ui';
import { getConfig } from '../config';

const quote = (name: string) => '`' + name.replace(/`/g, '``') + '`';

export default function TablesTab({ database, onQuery }: { database: PrismDatabase; onQuery: (sql: string) => void }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const tables = useQuery({ queryKey: keys.tables(identifier, database.id), queryFn: () => api.tables(identifier, database.id) });
    const [filter, setFilter] = useState('');
    const [selected, setSelected] = useState<string | null>(null);

    useEffect(() => {
        if (!selected && tables.data?.length) setSelected(tables.data[0].name);
    }, [tables.data, selected]);

    if (tables.isLoading) return <Spinner centered />;
    if (tables.isError) return <Alert type={'danger'}>{httpErrorToHuman(tables.error)}</Alert>;

    const list = (tables.data ?? []).filter((table) => table.name.toLowerCase().includes(filter.toLowerCase()));
    const table = tables.data?.find((item) => item.name === selected);

    return (
        <div className={'pdb:grid pdb:gap-4 pdb:lg:grid-cols-[15rem_minmax(0,1fr)]'}>
            <div className={'pdb:flex pdb:flex-col pdb:gap-2'}>
                <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={`Filter ${tables.data?.length ?? 0} tables…`} />
                <div className={'pdb:flex pdb:max-h-[70vh] pdb:flex-col pdb:overflow-y-auto'}>
                    {list.map((item) => (
                        <button
                            key={item.name}
                            type={'button'}
                            onClick={() => setSelected(item.name)}
                            className={cn(
                                'pdb:flex pdb:items-center pdb:gap-2 pdb:rounded-md pdb:px-2.5 pdb:py-1.5 pdb:text-left pdb:text-sm pdb:cursor-pointer',
                                item.name === selected ? 'pdb:bg-primary pdb:text-primary-foreground' : 'pdb:hover:bg-muted'
                            )}
                        >
                            <NamedIcon name={item.type === 'view' ? 'eye' : 'table'} size={13} className={'pdb:shrink-0 pdb:opacity-70'} />
                            <span className={'pdb:min-w-0 pdb:flex-1 pdb:truncate pdb:font-mono'}>{item.name}</span>
                            <span className={cn('pdb:text-xs pdb:tabular-nums', item.name === selected ? 'pdb:opacity-80' : 'pdb:text-muted-foreground')}>{item.rows.toLocaleString()}</span>
                        </button>
                    ))}
                    {list.length === 0 && <p className={'pdb:px-2 pdb:py-4 pdb:text-sm pdb:text-muted-foreground'}>{tables.data?.length ? 'No tables match.' : 'This database has no tables yet.'}</p>}
                </div>
            </div>
            {table ? (
                <TableView key={table.name} database={database} table={table} onQuery={onQuery} onChanged={() => void tables.refetch()} onDropped={() => (setSelected(null), void tables.refetch())} />
            ) : (
                <div className={'pdb:rounded-lg pdb:border pdb:border-dashed pdb:border-border pdb:p-10 pdb:text-center pdb:text-sm pdb:text-muted-foreground'}>Pick a table.</div>
            )}
        </div>
    );
}

function TableView({ database, table, onQuery, onChanged, onDropped }: { database: PrismDatabase; table: Table; onQuery: (sql: string) => void; onChanged: () => void; onDropped: () => void }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const queryClient = useQueryClient();
    const canUpdate = useServerPermission('database.update');
    const canDelete = useServerPermission('database.delete');
    const perPage = getConfig().rowsPerPage;
    const [view, setView] = useState<'data' | 'structure'>('data');
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [column, setColumn] = useState('');
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [editing, setEditing] = useState<{ row: Row | null } | null>(null);
    const [danger, setDanger] = useState<'empty' | 'drop' | 'delete' | null>(null);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(1);
        }, 350);

        return () => window.clearTimeout(timer);
    }, [searchInput]);

    const params = { page, perPage, sort: sort?.column, direction: sort?.direction, search: search || undefined, column: column || undefined };
    const rows = useQuery({ queryKey: keys.rows(identifier, database.id, table.name, params), queryFn: () => api.rows(identifier, database.id, table.name, params), placeholderData: keepPreviousData, enabled: view === 'data' });
    const structure = useQuery({ queryKey: keys.structure(identifier, database.id, table.name), queryFn: () => api.structure(identifier, database.id, table.name), enabled: view === 'structure' });

    const data = rows.data;
    const columns = data?.columns ?? [];
    const pages = data ? Math.max(1, Math.ceil(data.total / perPage)) : 1;
    const editable = canUpdate && table.type === 'table';

    const keyOf = (row: Row): Row => (data && data.primaryKey.length ? Object.fromEntries(data.primaryKey.map((name) => [name, row[name]])) : row);
    const refresh = () => {
        setSelected(new Set());
        onChanged();

        return queryClient.invalidateQueries({ queryKey: ['prism-database', identifier, database.id, 'rows', table.name] });
    };

    const act = async (label: string, action: () => Promise<unknown>) => {
        try {
            await action();
            toast.success(label);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        }
    };

    return (
        <div className={'pdb:flex pdb:min-w-0 pdb:flex-col pdb:gap-3'}>
            <div className={'pdb:flex pdb:flex-wrap pdb:items-center pdb:gap-2'}>
                <div className={'pdb:min-w-0 pdb:flex-1'}>
                    <p className={'pdb:truncate pdb:font-mono pdb:font-semibold'}>{table.name}</p>
                    <p className={'pdb:text-xs pdb:text-muted-foreground'}>
                        {[table.type === 'view' ? 'View' : table.engine, `~${table.rows.toLocaleString()} rows`, bytesToString(table.size), table.collation].filter(Boolean).join(' · ')}
                    </p>
                </div>
                <Pills
                    size={'sm'}
                    value={view}
                    onChange={setView}
                    options={[
                        { value: 'data', label: 'Data' },
                        { value: 'structure', label: 'Structure' },
                    ]}
                />
                <Button size={'small'} isSecondary onClick={() => onQuery(`SELECT * FROM ${quote(table.name)} LIMIT 100;`)}>
                    Query
                </Button>
                {canDelete && table.type === 'table' && (
                    <Button.Danger size={'small'} isSecondary onClick={() => setDanger('empty')}>
                        Empty
                    </Button.Danger>
                )}
                {canDelete && (
                    <Button.Danger size={'small'} onClick={() => setDanger('drop')}>
                        Drop
                    </Button.Danger>
                )}
            </div>

            {view === 'structure' ? (
                structure.isLoading ? (
                    <Spinner centered />
                ) : structure.isError || !structure.data ? (
                    <Alert type={'danger'}>{httpErrorToHuman(structure.error)}</Alert>
                ) : (
                    <div className={'pdb:flex pdb:flex-col pdb:gap-4'}>
                        <div className={'pt-surface pdb:overflow-x-auto pdb:rounded-lg pdb:border pdb:border-border pdb:bg-card'}>
                            <table className={'pdb:w-full pdb:text-sm'}>
                                <thead className={'pdb:text-left pdb:text-xs pdb:uppercase pdb:text-muted-foreground'}>
                                    <tr>
                                        {['Column', 'Type', 'Null', 'Key', 'Default', 'Extra', 'Comment'].map((heading) => (
                                            <th key={heading} className={'pdb:border-b pdb:border-border pdb:px-3 pdb:py-2 pdb:font-medium'}>
                                                {heading}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {structure.data.columns.map((item) => (
                                        <tr key={item.name} className={'pdb:border-b pdb:border-border/50'}>
                                            <td className={'pdb:px-3 pdb:py-1.5 pdb:font-mono'}>{item.name}</td>
                                            <td className={'pdb:px-3 pdb:py-1.5 pdb:font-mono pdb:text-xs'}>{item.type}</td>
                                            <td className={'pdb:px-3 pdb:py-1.5'}>{item.nullable ? 'Yes' : 'No'}</td>
                                            <td className={'pdb:px-3 pdb:py-1.5 pdb:text-xs'}>{item.key}</td>
                                            <td className={'pdb:px-3 pdb:py-1.5 pdb:font-mono pdb:text-xs'}>{item.default === null ? <span className={'pdb:text-muted-foreground'}>NULL</span> : String(item.default)}</td>
                                            <td className={'pdb:px-3 pdb:py-1.5 pdb:text-xs'}>{item.extra}</td>
                                            <td className={'pdb:px-3 pdb:py-1.5 pdb:text-xs pdb:text-muted-foreground'}>{item.comment}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className={'pt-surface pdb:rounded-lg pdb:border pdb:border-border pdb:bg-card pdb:p-3'}>
                            <p className={'pdb:mb-2 pdb:text-xs pdb:font-semibold pdb:uppercase pdb:tracking-wide'}>Indexes</p>
                            {structure.data.indexes.length === 0 ? (
                                <p className={'pdb:text-sm pdb:text-muted-foreground'}>No indexes.</p>
                            ) : (
                                structure.data.indexes.map((index) => (
                                    <p key={index.name} className={'pdb:text-sm'}>
                                        <span className={'pdb:font-mono'}>{index.name}</span>
                                        <span className={'pdb:text-muted-foreground'}>
                                            {' '}
                                            · {index.unique ? 'unique' : 'index'} · {index.type} · ({index.columns.join(', ')})
                                        </span>
                                    </p>
                                ))
                            )}
                        </div>
                        <div className={'pt-surface pdb:rounded-lg pdb:border pdb:border-border pdb:bg-card pdb:p-3'}>
                            <div className={'pdb:mb-2 pdb:flex pdb:items-center'}>
                                <p className={'pdb:flex-1 pdb:text-xs pdb:font-semibold pdb:uppercase pdb:tracking-wide'}>CREATE statement</p>
                                <Button.Text size={'xsmall'} onClick={() => copy(structure.data!.create, 'CREATE statement copied')}>
                                    Copy
                                </Button.Text>
                            </div>
                            <pre className={'pdb:overflow-x-auto pdb:rounded-md pdb:bg-black/30 pdb:p-3 pdb:font-mono pdb:text-xs'}>{structure.data.create}</pre>
                        </div>
                    </div>
                )
            ) : (
                <>
                    <div className={'pdb:flex pdb:flex-wrap pdb:items-center pdb:gap-2'}>
                        <div className={'pdb:relative pdb:min-w-48 pdb:flex-1'}>
                            <NamedIcon name={'search'} size={14} className={'pdb:pointer-events-none pdb:absolute pdb:left-2.5 pdb:top-1/2 pdb:-translate-y-1/2 pdb:text-muted-foreground'} />
                            <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={column ? `Search ${column}…` : 'Search all columns…'} className={'pdb:w-full pdb:pl-8'} />
                        </div>
                        <div className={'pdb:w-44'}>
                            <Select value={column} onChange={(value) => (setColumn(String(value)), setPage(1))} options={[{ value: '', label: 'All columns' }, ...columns.map((item) => ({ value: item.name, label: item.name }))]} />
                        </div>
                        {editable && (
                            <Button size={'small'} onClick={() => setEditing({ row: null })}>
                                <NamedIcon name={'plus'} size={14} /> Insert row
                            </Button>
                        )}
                    </div>

                    {rows.isError && <Alert type={'danger'}>{httpErrorToHuman(rows.error)}</Alert>}
                    {editable && data && data.primaryKey.length === 0 && <Alert type={'info'}>This table has no primary key, so rows are found by every column and only the first match changes.</Alert>}

                    <div className={cn('pt-surface pdb:overflow-auto pdb:rounded-lg pdb:border pdb:border-border pdb:bg-card pdb:max-h-[65vh]', rows.isFetching && 'pdb:opacity-70')}>
                        {rows.isLoading ? (
                            <div className={'pdb:py-10'}>
                                <Spinner centered />
                            </div>
                        ) : (
                            <table className={'pdb:w-full pdb:text-sm'}>
                                <thead className={'pdb:sticky pdb:top-0 pdb:z-10 pdb:bg-card pdb:text-left pdb:text-xs pdb:text-muted-foreground'}>
                                    <tr>
                                        {editable && (
                                            <th className={'pdb:w-8 pdb:border-b pdb:border-border pdb:px-3 pdb:py-2'}>
                                                <Checkbox checked={!!data?.rows.length && selected.size === data.rows.length} onChange={(checked) => setSelected(new Set(checked ? data!.rows.map((_, index) => index) : []))} />
                                            </th>
                                        )}
                                        {columns.map((item) => (
                                            <th key={item.name} className={'pdb:whitespace-nowrap pdb:border-b pdb:border-border pdb:px-3 pdb:py-2 pdb:font-medium'}>
                                                <button
                                                    type={'button'}
                                                    onClick={() => (setSort(sort?.column === item.name ? (sort.direction === 'asc' ? { column: item.name, direction: 'desc' } : null) : { column: item.name, direction: 'asc' }), setPage(1))}
                                                    className={'pdb:flex pdb:items-center pdb:gap-1 pdb:cursor-pointer pdb:hover:text-foreground'}
                                                    title={item.type}
                                                >
                                                    {data?.primaryKey.includes(item.name) && <NamedIcon name={'key-round'} size={11} className={'pdb:text-amber-400'} />}
                                                    <span className={'pdb:font-mono'}>{item.name}</span>
                                                    {sort?.column === item.name && <NamedIcon name={sort.direction === 'asc' ? 'arrow-up' : 'arrow-down'} size={11} />}
                                                </button>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data?.rows.map((row, index) => (
                                        <tr key={index} onDoubleClick={() => editable && setEditing({ row })} className={cn('pdb:border-b pdb:border-border/40', selected.has(index) ? 'pdb:bg-primary/10' : 'pdb:hover:bg-muted/40', editable && 'pdb:cursor-pointer')}>
                                            {editable && (
                                                <td className={'pdb:px-3 pdb:py-1.5'} onDoubleClick={(event) => event.stopPropagation()}>
                                                    <Checkbox checked={selected.has(index)} onChange={(checked) => setSelected((current) => new Set(checked ? [...current, index] : [...current].filter((item) => item !== index)))} />
                                                </td>
                                            )}
                                            {columns.map((item) => (
                                                <td key={item.name} className={cn('pdb:max-w-[22rem] pdb:truncate pdb:px-3 pdb:py-1.5 pdb:font-mono pdb:text-xs', row[item.name] === null && 'pdb:italic pdb:text-muted-foreground', item.numeric && 'pdb:text-right')} title={cellText(row[item.name])}>
                                                    {cellText(row[item.name])}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        {data && data.rows.length === 0 && <p className={'pdb:py-8 pdb:text-center pdb:text-sm pdb:text-muted-foreground'}>{search ? 'No rows match.' : 'The table is empty.'}</p>}
                    </div>

                    <div className={'pdb:flex pdb:flex-wrap pdb:items-center pdb:gap-2 pdb:text-sm'}>
                        <span className={'pdb:flex-1 pdb:text-muted-foreground'}>
                            {data ? `${data.total.toLocaleString()} rows${search ? ' match' : ''}` : ''}
                            {editable && ' · double-click a row to edit it'}
                        </span>
                        {selected.size > 0 && editable && (
                            <Button.Danger size={'small'} onClick={() => setDanger('delete')}>
                                Delete {selected.size} {selected.size === 1 ? 'row' : 'rows'}
                            </Button.Danger>
                        )}
                        <Button.Text size={'small'} disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={'Previous page'}>
                            <NamedIcon name={'chevron-left'} size={14} />
                        </Button.Text>
                        <span className={'pdb:tabular-nums'}>
                            {page} / {pages}
                        </span>
                        <Button.Text size={'small'} disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label={'Next page'}>
                            <NamedIcon name={'chevron-right'} size={14} />
                        </Button.Text>
                    </div>
                </>
            )}

            {editing && data && (
                <RowEditor
                    columns={columns}
                    row={editing.row}
                    onClose={() => setEditing(null)}
                    onSave={async (values) => {
                        await (editing.row ? api.update(identifier, database.id, table.name, keyOf(editing.row), values) : api.insert(identifier, database.id, table.name, values));
                        toast.success(editing.row ? 'Row saved.' : 'Row inserted.');
                        setEditing(null);
                        await refresh();
                    }}
                />
            )}

            <Dialog.Confirm
                open={danger !== null}
                onClose={() => setDanger(null)}
                title={danger === 'drop' ? `Drop ${table.name}?` : danger === 'empty' ? `Empty ${table.name}?` : `Delete ${selected.size} rows?`}
                confirm={danger === 'drop' ? 'Drop table' : danger === 'empty' ? 'Empty table' : 'Delete'}
                onConfirmed={async () => {
                    const action = danger;
                    setDanger(null);
                    if (action === 'delete' && data) await act('Rows deleted.', () => api.remove(identifier, database.id, table.name, [...selected].map((index) => keyOf(data.rows[index]))));
                    if (action === 'empty') await act(`${table.name} emptied.`, () => api.empty(identifier, database.id, table.name));
                    if (action === 'drop') {
                        await act(`${table.name} dropped.`, () => api.drop(identifier, database.id, table.name));
                        onDropped();

                        return;
                    }
                    await refresh();
                }}
            >
                {danger === 'drop' ? 'The table and all its rows are deleted.' : danger === 'empty' ? 'Every row is deleted. The table and its structure stay.' : 'The selected rows are deleted.'} This cannot be undone; a backup can bring it back.
            </Dialog.Confirm>
        </div>
    );
}

/** Insert or edit one row. Each column can be set to NULL when it allows it. */
function RowEditor({ columns, row, onSave, onClose }: { columns: Column[]; row: Row | null; onSave: (values: Row) => Promise<void>; onClose: () => void }) {
    const editableColumns = useMemo(() => columns.filter((column) => !column.binary), [columns]);
    const [values, setValues] = useState<Record<string, string | null>>(() =>
        Object.fromEntries(
            editableColumns.map((column) => {
                const value = row?.[column.name];

                return [column.name, row ? (value === null || value === undefined ? null : String(value)) : column.extra.includes('auto_increment') || column.default !== null ? undefined : column.nullable ? null : ''];
            })
        ) as Record<string, string | null>
    );
    const [touched, setTouched] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);

    const save = async () => {
        setBusy(true);
        try {
            const changed = Object.fromEntries(Object.entries(values).filter(([name, value]) => (row ? touched.has(name) : value !== undefined))) as Row;
            if (row && Object.keys(changed).length === 0) return onClose();
            await onSave(changed);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} title={row ? 'Edit row' : 'Insert row'}>
            <div className={'pdb:flex pdb:max-h-[60vh] pdb:flex-col pdb:gap-3 pdb:overflow-y-auto pdb:pr-1'}>
                {editableColumns.map((column) => {
                    const value = values[column.name];
                    const isNull = value === null;
                    const set = (next: string | null | undefined) => {
                        setValues((current) => ({ ...current, [column.name]: next as string | null }));
                        setTouched((current) => new Set(current).add(column.name));
                    };
                    const long = /text|json|blob/i.test(column.type);

                    return (
                        <label key={column.name} className={'pdb:flex pdb:flex-col pdb:gap-1 pdb:text-sm'}>
                            <span className={'pdb:flex pdb:items-center pdb:gap-2'}>
                                <span className={'pdb:font-mono'}>{column.name}</span>
                                <span className={'pdb:text-xs pdb:text-muted-foreground'}>{column.type}</span>
                                {column.extra.includes('auto_increment') && !row && <span className={'pdb:text-xs pdb:text-muted-foreground'}>(automatic)</span>}
                                {column.nullable && (
                                    <span className={'pdb:ml-auto pdb:flex pdb:items-center pdb:gap-1 pdb:text-xs'}>
                                        <Checkbox checked={isNull} onChange={(checked) => set(checked ? null : '')} /> NULL
                                    </span>
                                )}
                            </span>
                            {long ? (
                                <TextArea value={value ?? ''} disabled={isNull} onChange={(event) => set(event.target.value)} rows={3} className={'pdb:font-mono pdb:text-xs'} placeholder={value === undefined ? 'Default' : undefined} />
                            ) : (
                                <Input value={value ?? ''} disabled={isNull} onChange={(event) => set(event.target.value)} className={'pdb:font-mono'} placeholder={value === undefined ? (column.default !== null ? `Default: ${String(column.default)}` : 'Automatic') : isNull ? 'NULL' : undefined} />
                            )}
                        </label>
                    );
                })}
                {columns.some((column) => column.binary) && <p className={'pdb:text-xs pdb:text-muted-foreground'}>Binary columns are not edited here; use the SQL console.</p>}
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button isLoading={busy} onClick={save}>
                    {row ? 'Save' : 'Insert'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
