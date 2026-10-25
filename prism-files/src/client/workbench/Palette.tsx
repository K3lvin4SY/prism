import { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { listFiles } from '../api';
import { getConfig } from '../config';
import { basename, fileIcon, isEditable, matchesAny } from '../lib/paths';

export interface Command {
    id: string;
    label: string;
    keys?: string;
    run: () => void;
}

/** Folders that are big and rarely edited by hand; quick open does not look inside them. */
const SKIP = new Set(['.prism-trash', 'node_modules', 'libraries', 'cache', '.cache', 'versions', 'bundler', 'region', 'entities', 'poi', 'playerdata', 'DIM1', 'DIM-1', 'data', 'Content', 'Libraries']);

const indexes = new Map<string, Promise<string[]>>();

/** Every editable file under the server's root, walked once per visit for quick open. */
function fileIndex(server: string, refresh = false): Promise<string[]> {
    if (refresh) indexes.delete(server);
    let index = indexes.get(server);
    if (!index) {
        index = (async () => {
            const files: string[] = [];
            const queue: { path: string; depth: number }[] = [{ path: '/', depth: 0 }];
            const hidden = getConfig().hidden;
            while (queue.length > 0 && files.length < 5000) {
                const { path, depth } = queue.shift()!;
                const entries = await listFiles(server, path).catch(() => []);
                for (const entry of entries) {
                    if (matchesAny(entry.path, hidden, false)) continue;
                    if (entry.directory) {
                        if (depth < 7 && !SKIP.has(entry.name)) queue.push({ path: entry.path, depth: depth + 1 });
                    } else if (isEditable(entry.name, entry.mimetype)) {
                        files.push(entry.path);
                    }
                }
            }

            return files;
        })();
        indexes.set(server, index);
    }

    return index;
}

/** Scores a fuzzy match: the query's letters in order, closer and earlier is better. */
export function fuzzy(query: string, text: string): number | null {
    if (query === '') return 0;
    const lower = text.toLowerCase();
    let score = 0;
    let position = -1;
    for (const char of query.toLowerCase()) {
        const next = lower.indexOf(char, position + 1);
        if (next < 0) return null;
        score += next - position;
        position = next;
    }

    return score + (lower.endsWith(query.toLowerCase()) ? -10 : 0);
}

interface Props {
    server: string;
    mode: 'files' | 'commands';
    commands: Command[];
    recent: string[];
    onOpen: (path: string) => void;
    onClose: () => void;
}

/** Ctrl+P quick open and Ctrl+Shift+P command palette, VS Code style; ">" switches to commands. */
export default function Palette({ server, mode, commands, recent, onOpen, onClose }: Props) {
    const [query, setQuery] = useState(mode === 'commands' ? '>' : '');
    const [files, setFiles] = useState<string[] | null>(null);
    const [selected, setSelected] = useState(0);
    const input = useRef<HTMLInputElement>(null);
    const commandMode = query.startsWith('>');
    const term = commandMode ? query.slice(1).trim() : query.trim();

    useEffect(() => {
        input.current?.focus();
        void fileIndex(server).then(setFiles);
    }, [server]);

    const items = useMemo(() => {
        if (commandMode) {
            return commands
                .map((command) => ({ command, score: fuzzy(term, command.label) }))
                .filter((item) => item.score !== null)
                .sort((a, b) => a.score! - b.score!)
                .map(({ command }) => ({ key: command.id, label: command.label, detail: command.keys, icon: 'chevron-right', run: () => command.run() }));
        }

        const pool = term === '' ? [...recent, ...(files ?? []).filter((path) => !recent.includes(path))] : (files ?? []);

        return pool
            .map((path) => ({ path, score: fuzzy(term, path) }))
            .filter((item) => item.score !== null)
            .sort((a, b) => a.score! - b.score!)
            .slice(0, 50)
            .map(({ path }) => ({ key: path, label: basename(path), detail: path, icon: fileIcon(basename(path), false).icon, run: () => onOpen(path) }));
    }, [commandMode, term, commands, files, recent, onOpen]);

    useEffect(() => setSelected(0), [query]);

    const choose = (index: number) => {
        const item = items[index];
        if (!item) return;
        onClose();
        item.run();
    };

    return (
        <div className={'pfl:fixed pfl:inset-0 pfl:z-50 pfl:flex pfl:justify-center pfl:bg-black/30 pfl:pt-[12vh]'} onMouseDown={onClose}>
            <div className={'pt-surface pt-overlay pfl:h-fit pfl:w-[min(40rem,92vw)] pfl:overflow-hidden pfl:rounded-lg pfl:border pfl:border-border pfl:bg-card pfl:shadow-2xl'} onMouseDown={(event) => event.stopPropagation()}>
                <input
                    ref={input}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') onClose();
                        if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            setSelected((value) => Math.min(value + 1, items.length - 1));
                        }
                        if (event.key === 'ArrowUp') {
                            event.preventDefault();
                            setSelected((value) => Math.max(value - 1, 0));
                        }
                        if (event.key === 'Enter') choose(selected);
                    }}
                    placeholder={commandMode ? 'Type a command' : 'Type part of a file name, or > for commands'}
                    className={'pfl:w-full pfl:border-b pfl:border-border pfl:bg-transparent pfl:px-4 pfl:py-3 pfl:text-sm pfl:outline-none'}
                />
                <div className={'pfl:max-h-[50vh] pfl:overflow-y-auto pfl:py-1'}>
                    {!commandMode && files === null && (
                        <div className={'pfl:flex pfl:items-center pfl:gap-2 pfl:px-4 pfl:py-2 pfl:text-sm pfl:text-muted-foreground'}>
                            <Spinner size={'small'} /> Finding files…
                        </div>
                    )}
                    {items.map((item, index) => (
                        <button
                            key={item.key}
                            type={'button'}
                            onMouseEnter={() => setSelected(index)}
                            onClick={() => choose(index)}
                            className={cn('pfl:flex pfl:w-full pfl:items-center pfl:gap-2 pfl:px-4 pfl:py-1.5 pfl:text-left pfl:text-sm pfl:cursor-pointer', index === selected && 'pfl:bg-primary/20')}
                        >
                            <NamedIcon name={item.icon} size={14} className={'pfl:shrink-0 pfl:text-muted-foreground'} />
                            <span className={'pfl:truncate'}>{item.label}</span>
                            {item.detail && <span className={'pfl:ml-auto pfl:truncate pfl:pl-4 pfl:font-mono pfl:text-xs pfl:text-muted-foreground'}>{item.detail}</span>}
                        </button>
                    ))}
                    {items.length === 0 && files !== null && <p className={'pfl:px-4 pfl:py-3 pfl:text-sm pfl:text-muted-foreground'}>Nothing matches.</p>}
                </div>
            </div>
        </div>
    );
}
