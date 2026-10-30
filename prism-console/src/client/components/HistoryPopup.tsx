import { useEffect, useRef } from 'react';
import { cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';

interface Props {
    server: string;
    items: string[];
    selected: number;
    synced: boolean;
    filtered: boolean;
    onPick: (command: string) => void;
    onClear: () => void;
}

/** Earlier commands in a box above the command line: the newest first, the chosen one filled. */
export default function HistoryPopup({ server, items, selected, synced, filtered, onPick, onClear }: Props) {
    const list = useRef<HTMLDivElement>(null);

    useEffect(() => {
        list.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [selected]);

    return (
        <div
            role={'listbox'}
            aria-label={'Command history'}
            className={'pt-surface pt-overlay pcn:absolute pcn:bottom-full pcn:left-3 pcn:z-30 pcn:mb-2 pcn:flex pcn:w-[28rem] pcn:max-w-[calc(100%-1.5rem)] pcn:flex-col pcn:overflow-hidden pcn:rounded-lg pcn:border pcn:border-border pcn:bg-card pcn:text-foreground pcn:shadow-xl'}
        >
            <div className={'pcn:flex pcn:items-center pcn:gap-2 pcn:border-b pcn:border-border pcn:px-3 pcn:py-2 pcn:font-mono pcn:text-[11px] pcn:uppercase pcn:tracking-widest pcn:text-muted-foreground'}>
                <span className={'pcn:min-w-0 pcn:flex-1 pcn:truncate'}>History · {server}</span>
                <span className={'pcn:flex pcn:items-center pcn:gap-1'} title={synced ? 'Saved to your account, so it follows you to every browser.' : 'Kept until you leave the panel.'}>
                    {synced && <NamedIcon name={'refresh-cw'} size={11} />}
                    {synced ? 'Synced' : 'Not synced'}
                </span>
                {items.length > 0 && !filtered && (
                    <button type={'button'} onMouseDown={(event) => event.preventDefault()} onClick={onClear} className={'pcn:cursor-pointer pcn:uppercase pcn:hover:text-foreground'}>
                        · Clear
                    </button>
                )}
            </div>
            <div ref={list} className={'pcn:flex pcn:max-h-60 pcn:flex-col pcn:overflow-y-auto pcn:p-1.5'}>
                {items.length === 0 && <p className={'pcn:px-2 pcn:py-4 pcn:text-center pcn:text-sm pcn:text-muted-foreground'}>{filtered ? 'No earlier command matches.' : 'Commands you send show up here.'}</p>}
                {items.map((command, index) => (
                    <button
                        key={command}
                        type={'button'}
                        role={'option'}
                        aria-selected={index === selected}
                        data-index={index}
                        // Keeps the focus in the command line.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onPick(command)}
                        className={cn('pcn:truncate pcn:rounded-md pcn:px-2.5 pcn:py-1.5 pcn:text-left pcn:font-mono pcn:text-sm pcn:cursor-pointer', index === selected ? 'pcn:bg-primary/15 pcn:text-foreground' : 'pcn:text-foreground/85 pcn:hover:bg-muted/60')}
                    >
                        {command}
                    </button>
                ))}
            </div>
        </div>
    );
}
