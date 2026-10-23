import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, NamedIcon, Select, cn, httpErrorToHuman, useCurrentServerRequired, useServerPermission } from '@pterodactyl/sdk';
import { api, cellText, type PrismDatabase, type QueryResult } from '../api';
import { getConfig } from '../config';

const SNIPPETS: { label: string; sql: (database: string) => string }[] = [
    { label: 'Tables', sql: () => 'SHOW TABLES;' },
    { label: 'Sizes', sql: (database) => `SELECT TABLE_NAME, TABLE_ROWS, ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024) AS size_kb\nFROM information_schema.TABLES\nWHERE TABLE_SCHEMA = '${database}'\nORDER BY DATA_LENGTH + INDEX_LENGTH DESC;` },
    { label: 'Version', sql: () => 'SELECT VERSION(), @@version_comment;' },
    { label: 'Processes', sql: () => 'SHOW PROCESSLIST;' },
];

function historyKey(server: string, id: number) {
    return `prism-database:history:${server}:${id}`;
}

function loadHistory(key: string): string[] {
    try {
        return JSON.parse(localStorage.getItem(key) ?? '[]');
    } catch {
        return [];
    }
}

/** The SQL console: runs as the database's own user; Ctrl+Enter runs. */
export default function SqlTab({ database, draft, onDraftUsed }: { database: PrismDatabase; draft: string | null; onDraftUsed: () => void }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const canWrite = useServerPermission('database.update') && !getConfig().sqlReadOnly;
    const key = historyKey(identifier, database.id);
    const [sql, setSql] = useState('');
    const [history, setHistory] = useState<string[]>(() => loadHistory(key));
    const [results, setResults] = useState<QueryResult[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    const editor = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (draft === null) return;
        setSql(draft);
        onDraftUsed();
        setTimeout(() => editor.current?.focus(), 0);
    }, [draft, onDraftUsed]);

    const run = async (text = sql) => {
        if (!text.trim() || running) return;
        setRunning(true);
        setError(null);
        try {
            const response = await api.query(identifier, database.id, text);
            setResults(response.results);
            const next = [text.trim(), ...history.filter((item) => item !== text.trim())].slice(0, 30);
            setHistory(next);
            try {
                localStorage.setItem(key, JSON.stringify(next));
            } catch {
                // History is a convenience only.
            }
        } catch (failure) {
            setError(httpErrorToHuman(failure));
            setResults(null);
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className={'pdb:flex pdb:flex-col pdb:gap-3'}>
            <div className={'pdb:flex pdb:flex-wrap pdb:items-center pdb:gap-1.5'}>
                {SNIPPETS.map((snippet) => (
                    <button
                        key={snippet.label}
                        type={'button'}
                        onClick={() => {
                            setSql(snippet.sql(database.name));
                            void run(snippet.sql(database.name));
                        }}
                        className={'pdb:rounded-full pdb:border pdb:border-border pdb:px-3 pdb:py-1 pdb:text-xs pdb:cursor-pointer pdb:hover:border-primary'}
                    >
                        {snippet.label}
                    </button>
                ))}
                <span className={'pdb:ml-auto'}>
                    <Badge size={'sm'} tone={canWrite ? 'warning' : 'info'}>
                        {canWrite ? 'Read and write' : 'Read only'}
                    </Badge>
                </span>
            </div>

            <div className={'pdb:overflow-hidden pdb:rounded-lg pdb:border pdb:border-border pdb:bg-card'}>
                <div className={'pdb:flex pdb:items-center pdb:justify-between pdb:border-b pdb:border-border pdb:px-3 pdb:py-1.5 pdb:text-xs pdb:text-muted-foreground'}>
                    <span className={'pdb:font-mono'}>
                        <span className={'pdb:text-primary'}>{database.username}</span> @ {database.name}
                    </span>
                    <span>Ctrl + Enter to run</span>
                </div>
                <textarea
                    ref={editor}
                    value={sql}
                    onChange={(event) => setSql(event.target.value)}
                    onKeyDown={(event) => {
                        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                            event.preventDefault();
                            void run();
                        }
                        if (event.key === 'Tab') {
                            event.preventDefault();
                            const target = event.currentTarget;
                            const start = target.selectionStart;
                            setSql(sql.slice(0, start) + '    ' + sql.slice(target.selectionEnd));
                            setTimeout(() => target.setSelectionRange(start + 4, start + 4), 0);
                        }
                    }}
                    spellCheck={false}
                    placeholder={'SELECT * FROM luckperms_players LIMIT 10;'}
                    className={'pdb:block pdb:min-h-40 pdb:w-full pdb:resize-y pdb:bg-transparent pdb:p-3 pdb:font-mono pdb:text-sm pdb:outline-none'}
                />
            </div>

            <div className={'pdb:flex pdb:flex-wrap pdb:items-center pdb:gap-2'}>
                <div className={'pdb:w-80 pdb:max-w-full'}>
                    <Select
                        value={''}
                        onChange={(value) => value && setSql(String(value))}
                        options={[{ value: '', label: `History (${history.length})` }, ...history.map((item) => ({ value: item, label: item.replace(/\s+/g, ' ').slice(0, 80) }))]}
                    />
                </div>
                <div className={'pdb:flex-1'} />
                <Button isSecondary onClick={() => (setSql(''), setResults(null), setError(null))}>
                    Clear
                </Button>
                <Button onClick={() => run()} isLoading={running} disabled={!sql.trim()}>
                    Run
                </Button>
            </div>

            {error && <Alert type={'danger'}>{error}</Alert>}
            {results?.map((result, index) => (
                <div key={index} className={'pdb:overflow-hidden pdb:rounded-lg pdb:border pdb:border-border pdb:bg-card'}>
                    <div className={'pdb:flex pdb:items-center pdb:gap-2 pdb:border-b pdb:border-border pdb:px-3 pdb:py-1.5 pdb:text-xs'}>
                        <span className={'pdb:min-w-0 pdb:flex-1 pdb:truncate pdb:font-mono pdb:text-muted-foreground'}>{result.sql.replace(/\s+/g, ' ')}</span>
                        <span className={cn(result.error ? 'pdb:text-destructive' : 'pdb:text-success')}>
                            {result.error ? 'Failed' : result.columns.length ? `${result.rows.length}${result.truncated ? '+' : ''} rows` : `${result.affected ?? 0} affected`} · {result.ms} ms
                        </span>
                    </div>
                    {result.error ? (
                        <p className={'pdb:px-3 pdb:py-2 pdb:font-mono pdb:text-xs pdb:text-destructive'}>{result.error}</p>
                    ) : result.columns.length > 0 ? (
                        <div className={'pdb:max-h-96 pdb:overflow-auto'}>
                            <table className={'pdb:w-full pdb:text-xs'}>
                                <thead className={'pdb:sticky pdb:top-0 pdb:bg-card pdb:text-left pdb:text-muted-foreground'}>
                                    <tr>
                                        {result.columns.map((column, i) => (
                                            <th key={i} className={'pdb:whitespace-nowrap pdb:border-b pdb:border-border pdb:px-3 pdb:py-1.5 pdb:font-mono pdb:font-medium'}>
                                                {column}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.rows.map((row, i) => (
                                        <tr key={i} className={'pdb:border-b pdb:border-border/40'}>
                                            {row.map((cell, j) => (
                                                <td key={j} className={cn('pdb:max-w-[24rem] pdb:truncate pdb:px-3 pdb:py-1 pdb:font-mono', cell === null && 'pdb:italic pdb:text-muted-foreground')} title={cellText(cell)}>
                                                    {cellText(cell)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {result.truncated && <p className={'pdb:px-3 pdb:py-1.5 pdb:text-xs pdb:text-muted-foreground'}>Only the first {result.rows.length} rows are shown. Add a LIMIT to see others.</p>}
                        </div>
                    ) : (
                        <p className={'pdb:flex pdb:items-center pdb:gap-1 pdb:px-3 pdb:py-2 pdb:text-xs pdb:text-muted-foreground'}>
                            <NamedIcon name={'check'} size={12} /> Done.
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
}
