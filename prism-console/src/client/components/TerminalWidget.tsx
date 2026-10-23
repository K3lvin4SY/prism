import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { NamedIcon, cn, toast, useSendServerCommand, useServerPermission, type SdkServer } from '@pterodactyl/sdk';
import { useHistory } from '../api';
import { getConfig, loadFont, type TerminalSettings } from '../config';
import { download, exportLines, type ExportFormat } from '../lib/export';
import { LEVELS, compileRules, highlightRanges, paint, searchRanges, searchRegex, type ConsoleLine, type HighlightSettings, type Level, type Piece } from '../lib/lines';
import { useStore, type ServerConsoleStore } from '../store';
import HistoryDialog from './HistoryDialog';
import { IconButton, MenuItem, Popover } from './Popover';

interface Props {
    server: SdkServer;
    store: ServerConsoleStore;
    settings: TerminalSettings;
    onSettings: (patch: Partial<TerminalSettings>) => void;
    highlights: HighlightSettings[];
    hiddenLevels: Level[];
    onHiddenLevels: (levels: Level[]) => void;
    onOpenSettings: () => void;
    tall?: boolean;
    compact?: boolean;
}

const LEVEL_COLOURS: Record<Level, string> = {
    error: 'pcn:text-red-400',
    warning: 'pcn:text-amber-300',
    info: 'pcn:text-sky-300',
    player: 'pcn:text-emerald-300',
    debug: 'pcn:text-slate-400',
    system: 'pcn:text-violet-300',
};

const stamp = (time: number) => new Date(time).toLocaleTimeString([], { hour12: false });

const Line = memo(function Line({ line, pieces, timestamps, current }: { line: ConsoleLine; pieces: Piece[]; timestamps: boolean; current: boolean }) {
    return (
        <div data-line={line.id} className={cn('pcn-line', current && 'pcn-line-current')}>
            {timestamps && <span className={'pcn:select-none pcn:pr-2 pcn:opacity-50'}>[{stamp(line.time)}]</span>}
            {pieces.map((piece, index) => {
                const style: CSSProperties = {};
                if (piece.fg) style.color = piece.fg;
                if (piece.bg) style.background = piece.bg;
                if (piece.bold) style.fontWeight = 700;
                if (piece.dim) style.opacity = 0.7;
                if (piece.italic) style.fontStyle = 'italic';
                if (piece.underline) style.textDecoration = 'underline';

                return piece.match ? (
                    <mark key={index} style={style} className={piece.match === 'current' ? 'pcn-match-current' : 'pcn-match'}>
                        {piece.text}
                    </mark>
                ) : (
                    <span key={index} style={style}>
                        {piece.text}
                    </span>
                );
            })}
            {pieces.length === 0 && ' '}
        </div>
    );
});

export default function TerminalWidget({ server, store, settings, onSettings, highlights, hiddenLevels, onHiddenLevels, onOpenSettings, tall, compact }: Props) {
    useStore(store);
    const config = getConfig();
    const uuid = server.attributes.uuid;
    const canSend = useServerPermission('control.console');
    const send = useSendServerCommand(uuid);
    const { history, record, pin, clear } = useHistory(server.attributes.identifier, config.features.historySync);

    const widget = useRef<HTMLDivElement>(null);
    const scroller = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const [stick, setStick] = useState(true);
    const [searching, setSearching] = useState(false);
    const [search, setSearch] = useState({ query: '', regex: false, caseSensitive: false, wholeWord: false });
    const [current, setCurrent] = useState(0);
    const [command, setCommand] = useState('');
    const [cursor, setCursor] = useState(-1);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [exportFiltered, setExportFiltered] = useState(true);
    const [exportStamps, setExportStamps] = useState(true);

    const rules = useMemo(() => compileRules(highlights), [highlights]);
    const regex = useMemo(() => (searching ? searchRegex(search) : null), [searching, search]);
    const visible = useMemo(() => store.lines.filter((line) => !hiddenLevels.includes(line.level)), [store.lines, store.version, hiddenLevels]);

    const matches = useMemo(() => {
        if (!regex) return [] as { line: number; index: number }[];
        const list: { line: number; index: number }[] = [];
        for (const line of visible) searchRanges(line.text, regex).forEach((_, index) => list.push({ line: line.id, index }));

        return list;
    }, [visible, regex]);
    const active = matches.length > 0 ? matches[Math.min(current, matches.length - 1)] : null;

    // Highlighting is worked out once per line; only searching repaints lines as they render.
    const painted = useMemo(() => new WeakMap<ConsoleLine, Piece[]>(), [rules]);
    const pieces = (line: ConsoleLine): Piece[] => {
        if (!regex) {
            let cached = painted.get(line);
            if (!cached) {
                cached = paint(line.segments, highlightRanges(line, rules));
                painted.set(line, cached);
            }

            return cached;
        }

        const ranges = highlightRanges(line, rules);
        {
            searchRanges(line.text, regex).forEach((range, index) => ranges.push({ ...range, match: active?.line === line.id && active.index === index ? 'current' : 'match' }));
        }

        return paint(line.segments, ranges);
    };

    // Follows new output unless the reader scrolled up.
    useEffect(() => {
        if (stick && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    }, [store.version, stick, visible.length, settings]);

    useEffect(() => {
        if (!active) return;
        scroller.current?.querySelector(`[data-line="${active.line}"]`)?.scrollIntoView({ block: 'center' });
        setStick(false);
    }, [active?.line, active?.index]);

    // Ctrl+F opens the search, and Ctrl+R the history, while the console is on screen.
    useEffect(() => {
        const keys = (event: globalThis.KeyboardEvent) => {
            if (!widget.current || widget.current.offsetParent === null) return;
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && config.features.search) {
                event.preventDefault();
                setSearching(true);
                setTimeout(() => document.getElementById(`pcn-search-${uuid}`)?.focus(), 0);
            }
            if (event.ctrlKey && event.key.toLowerCase() === 'r' && canSend) {
                event.preventDefault();
                setHistoryOpen(true);
            }
        };
        window.addEventListener('keydown', keys);

        return () => window.removeEventListener('keydown', keys);
    }, [uuid, canSend, config.features.search]);

    const family = loadFont(settings.font);
    const suggestion = command !== '' ? (history.commands.find((item) => item.startsWith(command) && item !== command) ?? '') : '';

    const submit = (value = command) => {
        const text = value.trim();
        if (text === '' || !canSend) return;
        send.mutateAsync({ command: text }).catch(() => toast.error('The command could not be sent. Is the server running?'));
        record(text);
        setCommand('');
        setCursor(-1);
        setStick(true);
    };

    const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submit();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            const next = Math.min(cursor + 1, history.commands.length - 1);
            if (next >= 0) {
                setCursor(next);
                setCommand(history.commands[next]);
            }
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            const next = cursor - 1;
            setCursor(Math.max(-1, next));
            setCommand(next >= 0 ? history.commands[next] : '');
        } else if (event.key === 'Tab' && suggestion) {
            event.preventDefault();
            setCommand(suggestion);
        }
    };

    const exportAs = (format: ExportFormat) => {
        const lines = exportFiltered ? visible : store.lines;
        const name = `${server.attributes.name.replace(/[^\w.-]+/g, '-')}-console-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${format}`;
        download(exportLines(lines, format, exportStamps, `${server.attributes.name} console`), name, format === 'html' ? 'text/html' : 'text/plain');
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(exportLines(exportFiltered ? visible : store.lines, 'txt', exportStamps, ''));
            toast.success('The console was copied.');
        } catch {
            toast.error('Your browser did not allow copying.');
        }
    };

    const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : widget.current?.requestFullscreen());

    const style = {
        fontFamily: family,
        fontSize: `${settings.fontSize}px`,
        lineHeight: settings.lineHeight,
        whiteSpace: settings.wrap ? 'pre-wrap' : 'pre',
    } as CSSProperties;

    return (
        <div ref={widget} className={'pcn-terminal pcn:flex pcn:min-w-0 pcn:flex-col pcn:overflow-hidden pcn:rounded-lg pcn:border pcn:border-border'}>
            <div className={'pcn:flex pcn:flex-wrap pcn:items-center pcn:gap-1 pcn:border-b pcn:border-white/10 pcn:px-2 pcn:py-1.5'}>
                {config.features.filters && (
                    <div className={'pcn:flex pcn:flex-wrap pcn:gap-1'}>
                        {LEVELS.map(({ level, label }) => {
                            const hidden = hiddenLevels.includes(level);

                            return (
                                <button
                                    key={level}
                                    type={'button'}
                                    onClick={() => onHiddenLevels(hidden ? hiddenLevels.filter((item) => item !== level) : [...hiddenLevels, level])}
                                    aria-pressed={!hidden}
                                    title={hidden ? `Show ${label.toLowerCase()}` : `Hide ${label.toLowerCase()}`}
                                    className={cn(
                                        'pcn:inline-flex pcn:items-center pcn:gap-1.5 pcn:rounded-full pcn:border pcn:px-2 pcn:py-0.5 pcn:text-xs pcn:cursor-pointer pcn:transition-opacity',
                                        hidden ? 'pcn:border-white/10 pcn:opacity-40 pcn:line-through' : 'pcn:border-white/20'
                                    )}
                                >
                                    <span className={LEVEL_COLOURS[level]}>{label}</span>
                                    <span className={'pcn:rounded-full pcn:bg-white/10 pcn:px-1.5 pcn:tabular-nums'}>{store.counts[level]}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
                <div className={'pcn:ml-auto pcn:flex pcn:items-center pcn:gap-0.5'}>
                    {config.features.search && <IconButton icon={'search'} label={'Search (Ctrl+F)'} active={searching} onClick={() => setSearching(!searching)} />}
                    <IconButton icon={'minus'} label={'Smaller text'} onClick={() => onSettings({ fontSize: Math.max(9, settings.fontSize - 1) })} />
                    <span className={'pcn:w-6 pcn:text-center pcn:text-xs pcn:tabular-nums'}>{settings.fontSize}</span>
                    <IconButton icon={'plus'} label={'Larger text'} onClick={() => onSettings({ fontSize: Math.min(24, settings.fontSize + 1) })} />
                    <IconButton icon={'text-wrap'} label={'Wrap long lines'} active={settings.wrap} onClick={() => onSettings({ wrap: !settings.wrap })} />
                    <IconButton icon={'clock'} label={'Timestamps'} active={settings.timestamps} onClick={() => onSettings({ timestamps: !settings.timestamps })} />
                    {config.features.export && (
                        <>
                            <IconButton icon={'copy'} label={'Copy the console'} onClick={copy} />
                            <Popover icon={'download'} label={'Download the console'}>
                                {(close) => (
                                    <div className={'pcn:flex pcn:flex-col pcn:gap-1'}>
                                        <div className={'pcn:mb-1 pcn:flex pcn:gap-1 pcn:rounded-md pcn:bg-muted/50 pcn:p-1 pcn:text-xs'}>
                                            {[true, false].map((filtered) => (
                                                <button
                                                    key={String(filtered)}
                                                    type={'button'}
                                                    onClick={() => setExportFiltered(filtered)}
                                                    className={cn('pcn:flex-1 pcn:rounded pcn:px-2 pcn:py-1 pcn:cursor-pointer', exportFiltered === filtered ? 'pcn:bg-primary pcn:text-primary-foreground' : 'pcn:text-muted-foreground')}
                                                >
                                                    {filtered ? 'Visible lines' : 'All lines'}
                                                </button>
                                            ))}
                                        </div>
                                        <label className={'pcn:flex pcn:items-center pcn:gap-2 pcn:px-2 pcn:py-1 pcn:text-sm'}>
                                            <input type={'checkbox'} checked={exportStamps} onChange={(event) => setExportStamps(event.target.checked)} /> Include timestamps
                                        </label>
                                        <MenuItem icon={'file-text'} onClick={() => (exportAs('txt'), close())}>
                                            Download .txt
                                        </MenuItem>
                                        <MenuItem icon={'scroll-text'} onClick={() => (exportAs('log'), close())}>
                                            Download .log
                                        </MenuItem>
                                        <MenuItem icon={'file-code'} onClick={() => (exportAs('html'), close())}>
                                            Download coloured .html
                                        </MenuItem>
                                        <MenuItem icon={'clipboard'} onClick={() => (copy(), close())}>
                                            Copy to clipboard
                                        </MenuItem>
                                    </div>
                                )}
                            </Popover>
                        </>
                    )}
                    <IconButton icon={'trash-2'} label={'Clear the console'} onClick={() => store.clear()} />
                    <IconButton icon={'maximize'} label={'Full screen'} onClick={fullscreen} />
                    <IconButton icon={'settings'} label={'Console settings'} onClick={onOpenSettings} />
                </div>
            </div>

            {searching && (
                <div className={'pcn:flex pcn:flex-wrap pcn:items-center pcn:gap-1 pcn:border-b pcn:border-white/10 pcn:px-2 pcn:py-1.5'}>
                    <NamedIcon name={'search'} size={14} className={'pcn:opacity-60'} />
                    <input
                        id={`pcn-search-${uuid}`}
                        value={search.query}
                        onChange={(event) => {
                            setSearch({ ...search, query: event.target.value });
                            setCurrent(0);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') setCurrent((value) => (matches.length ? (event.shiftKey ? (value - 1 + matches.length) % matches.length : (value + 1) % matches.length) : 0));
                            if (event.key === 'Escape') setSearching(false);
                        }}
                        placeholder={'Search the console'}
                        className={cn('pcn:min-w-40 pcn:flex-1 pcn:rounded-md pcn:border pcn:bg-black/20 pcn:px-2 pcn:py-1 pcn:text-sm pcn:outline-none', search.query && !regex ? 'pcn:border-red-500' : 'pcn:border-white/15 pcn:focus:border-primary')}
                    />
                    <span className={'pcn:min-w-12 pcn:text-center pcn:text-xs pcn:tabular-nums pcn:opacity-70'}>{matches.length ? `${Math.min(current, matches.length - 1) + 1}/${matches.length}` : search.query ? '0/0' : ''}</span>
                    <IconButton icon={'regex'} label={'Regular expression'} active={search.regex} onClick={() => setSearch({ ...search, regex: !search.regex })} />
                    <IconButton icon={'case-sensitive'} label={'Match case'} active={search.caseSensitive} onClick={() => setSearch({ ...search, caseSensitive: !search.caseSensitive })} />
                    <IconButton icon={'whole-word'} label={'Whole word'} active={search.wholeWord} onClick={() => setSearch({ ...search, wholeWord: !search.wholeWord })} />
                    <IconButton icon={'chevron-up'} label={'Previous match'} disabled={!matches.length} onClick={() => setCurrent((value) => (value - 1 + matches.length) % matches.length)} />
                    <IconButton icon={'chevron-down'} label={'Next match'} disabled={!matches.length} onClick={() => setCurrent((value) => (value + 1) % matches.length)} />
                    <IconButton icon={'x'} label={'Close the search'} onClick={() => setSearching(false)} />
                </div>
            )}

            <div className={'pcn:relative pcn:min-h-0 pcn:flex-1'}>
                <div
                    ref={scroller}
                    onScroll={(event) => {
                        const element = event.currentTarget;
                        setStick(element.scrollHeight - element.scrollTop - element.clientHeight < 24);
                    }}
                    className={cn('pcn:overflow-auto pcn:px-3 pcn:py-2', tall ? 'pcn:h-[calc(100vh-15rem)]' : compact ? 'pcn:h-[22rem]' : 'pcn:h-[min(62vh,40rem)]')}
                    style={style}
                    role={'log'}
                    aria-live={'off'}
                >
                    {visible.map((line) => (
                        <Line key={line.id} line={line} pieces={pieces(line)} timestamps={settings.timestamps} current={active?.line === line.id} />
                    ))}
                    {visible.length === 0 && <div className={'pcn:opacity-50'}>{store.lines.length ? 'Every line is filtered out.' : 'Waiting for output…'}</div>}
                </div>
                {!stick && (
                    <button
                        type={'button'}
                        onClick={() => setStick(true)}
                        className={'pcn:absolute pcn:bottom-3 pcn:right-5 pcn:flex pcn:items-center pcn:gap-1 pcn:rounded-full pcn:bg-primary pcn:px-3 pcn:py-1 pcn:text-xs pcn:font-medium pcn:text-primary-foreground pcn:shadow-lg pcn:cursor-pointer'}
                    >
                        <NamedIcon name={'arrow-down'} size={12} /> Latest output
                    </button>
                )}
            </div>

            {canSend && (
                <div className={'pcn:flex pcn:items-center pcn:gap-2 pcn:border-t pcn:border-white/10 pcn:px-3 pcn:py-2'}>
                    <NamedIcon name={'chevron-right'} size={16} className={'pcn:shrink-0 pcn:opacity-60'} />
                    <div className={'pcn:relative pcn:min-w-0 pcn:flex-1'} style={{ fontFamily: family, fontSize: `${settings.fontSize}px` }}>
                        {suggestion && (
                            <div aria-hidden className={'pcn:pointer-events-none pcn:absolute pcn:inset-0 pcn:flex pcn:items-center pcn:whitespace-pre pcn:opacity-35'}>
                                <span className={'pcn:invisible'}>{command}</span>
                                {suggestion.slice(command.length)}
                            </div>
                        )}
                        <input
                            ref={input}
                            value={command}
                            onChange={(event) => {
                                setCommand(event.target.value);
                                setCursor(-1);
                            }}
                            onKeyDown={onKey}
                            placeholder={'Type a command…  ↑ history · Tab accepts · Ctrl+R search'}
                            aria-label={'Command'}
                            className={'pcn:w-full pcn:bg-transparent pcn:outline-none pcn:placeholder:opacity-50'}
                            autoComplete={'off'}
                            spellCheck={false}
                        />
                    </div>
                    <IconButton icon={'history'} label={'Command history (Ctrl+R)'} onClick={() => setHistoryOpen(true)} />
                    <button
                        type={'button'}
                        onClick={() => submit()}
                        aria-label={'Send'}
                        className={'pcn:flex pcn:size-7 pcn:items-center pcn:justify-center pcn:rounded-md pcn:bg-primary pcn:text-primary-foreground pcn:cursor-pointer pcn:disabled:opacity-40'}
                        disabled={command.trim() === ''}
                    >
                        <NamedIcon name={'arrow-right'} size={15} />
                    </button>
                </div>
            )}

            {historyOpen && (
                <HistoryDialog
                    history={history}
                    onClose={() => {
                        setHistoryOpen(false);
                        setTimeout(() => input.current?.focus(), 0);
                    }}
                    onPick={(value) => setCommand(value)}
                    onRun={(value) => submit(value)}
                    onPin={(value, pinned) => pin({ command: value, pinned })}
                    onClear={() => clear()}
                />
            )}
        </div>
    );
}
