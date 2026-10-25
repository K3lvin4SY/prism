import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import type { History } from '../api';

interface Props {
    history: History;
    onClose: () => void;
    onPick: (command: string) => void;
    onRun: (command: string) => void;
    onPin: (command: string, pinned: boolean) => void;
    onClear: () => void;
}

/** Ctrl+R: search earlier commands, with pinned favourites first. */
export default function HistoryDialog({ history, onClose, onPick, onRun, onPin, onClear }: Props) {
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(0);
    const field = useRef<HTMLInputElement>(null);

    useEffect(() => field.current?.focus(), []);

    const items = useMemo(() => {
        const term = query.toLowerCase();
        const pinned = history.pinned.filter((command) => command.toLowerCase().includes(term)).map((command) => ({ command, pinned: true }));
        const recent = history.commands.filter((command) => !history.pinned.includes(command) && command.toLowerCase().includes(term)).map((command) => ({ command, pinned: false }));

        return [...pinned, ...recent];
    }, [history, query]);

    const choose = (index: number, run: boolean) => {
        const item = items[index];
        if (!item) return;
        run ? onRun(item.command) : onPick(item.command);
        onClose();
    };

    return (
        <Dialog open onClose={onClose} title={'Command history'}>
            <div className={'pcn:flex pcn:flex-col pcn:gap-2'}>
                <input
                    ref={field}
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setSelected(0);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'ArrowDown') setSelected((value) => Math.min(value + 1, items.length - 1));
                        if (event.key === 'ArrowUp') setSelected((value) => Math.max(value - 1, 0));
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            choose(selected, !event.shiftKey);
                        }
                    }}
                    placeholder={'Search your commands. Enter runs, Shift+Enter edits.'}
                    className={'pcn:rounded-md pcn:border pcn:border-border pcn:bg-background pcn:px-3 pcn:py-2 pcn:font-mono pcn:text-sm pcn:outline-none pcn:focus:border-primary'}
                />
                <div className={'pcn:flex pcn:max-h-80 pcn:flex-col pcn:overflow-y-auto'}>
                    {items.length === 0 && <p className={'pcn:px-2 pcn:py-6 pcn:text-center pcn:text-sm pcn:text-muted-foreground'}>{query ? 'No commands match.' : 'Commands you send show up here.'}</p>}
                    {items.map((item, index) => (
                        <div
                            key={`${item.pinned}-${item.command}`}
                            onMouseEnter={() => setSelected(index)}
                            className={cn('pcn:group pcn:flex pcn:items-center pcn:gap-2 pcn:rounded-md pcn:px-2 pcn:py-1.5', index === selected && 'pcn:bg-muted')}
                        >
                            <button type={'button'} onClick={() => onPin(item.command, !item.pinned)} aria-label={item.pinned ? 'Unpin' : 'Pin'} className={'pcn:cursor-pointer'}>
                                <NamedIcon name={'star'} size={14} className={item.pinned ? 'pcn:fill-amber-400 pcn:text-amber-400' : 'pcn:text-muted-foreground pcn:opacity-40 pcn:group-hover:opacity-100'} />
                            </button>
                            <button type={'button'} onClick={() => choose(index, false)} className={'pcn:min-w-0 pcn:flex-1 pcn:truncate pcn:text-left pcn:font-mono pcn:text-sm pcn:cursor-pointer'}>
                                {item.command}
                            </button>
                            <Button size={'xsmall'} isSecondary onClick={() => choose(index, true)}>
                                Run
                            </Button>
                        </div>
                    ))}
                </div>
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClear} disabled={history.commands.length === 0}>
                    Clear history
                </Button.Text>
                <Button onClick={onClose}>Close</Button>
            </Dialog.Footer>
        </Dialog>
    );
}
