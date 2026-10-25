import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, CopyOnClick, Dialog, DropdownMenu, DropdownMenuItem, Input, Label, TextArea, Tooltip, cn, http, httpErrorToHuman, toast, useDebouncedCallback } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { getStatus, keys } from '../api/client';
import { renameServer } from '../api/properties';
import { applyCode, formatSelection, insertAt, type Change, type Edited } from '../lib/ampersand';
import { COLORS, MOTD_WIDTH, STYLES, SYMBOLS, centerLine, fromAmpersand, gradientColors, lineWidth, normalizeMotd, rainbowColors, supportsHex, toAmpersand, toPropertiesValue, type GradientStop } from '../lib/motd';
import ColorPicker from './ColorPicker';
import GradientSlider from './GradientSlider';
import IconUpload from './IconUpload';
import ServerListPreview from './ServerListPreview';

type OutputFormat = 'properties' | 'section' | 'ampersand';
type SaveState = { kind: 'saved'; at: number | null } | { kind: 'pending' } | { kind: 'saving' } | { kind: 'failed'; message: string };

interface Props {
    server: string;
    software: string | null;
    motd: string;
    icon: string | null;
    serverName: string;
    canRename: boolean;
    maxPlayers: number;
    onSave: (values: Record<string, string>) => Promise<void>;
    onIconChange: () => void;
}

const splitLines = (motd: string): [string, string] => {
    const [first = '', second = ''] = toAmpersand(motd).split('\n');

    return [first, second];
};

type StyleKey = Extract<Change, { toggle: unknown }>['toggle'];

const STYLE_ICONS: Record<string, string> = { l: 'bold', o: 'italic', n: 'underline', m: 'strikethrough', k: 'sparkles' };

const box = 'pt-surface mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card';

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
    return (
        <section className={box}>
            <div className={'mcs:flex mcs:items-center mcs:gap-2 mcs:border-b mcs:border-border mcs:px-4 mcs:py-2.5'}>
                <h3 className={'mcs:flex-1 mcs:text-sm mcs:font-semibold'}>{title}</h3>
                {aside}
            </div>
            <div className={'mcs:p-4'}>{children}</div>
        </section>
    );
}

/** A toolbar button that keeps the cursor in the line being edited; the tools share the row's width. */
function Tool({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
    return (
        <Tooltip content={label}>
            <button
                type={'button'}
                aria-label={label}
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={onClick}
                className={'mcs:flex mcs:h-10 mcs:min-w-8 mcs:max-w-12 mcs:flex-1 mcs:cursor-pointer mcs:items-center mcs:justify-center mcs:gap-1.5 mcs:rounded-md mcs:px-2 mcs:text-sm mcs:text-muted-foreground mcs:hover:bg-muted mcs:hover:text-foreground mcs:disabled:cursor-not-allowed mcs:disabled:opacity-40'}
            >
                {children}
            </button>
        </Tooltip>
    );
}

/**
 * The MOTD as players see it in their server list, edited in place. Every change is written to
 * server.properties a moment after typing stops; the server shows it after its next restart.
 */
export default function MotdEditor({ server, software, motd, icon, serverName, canRename, maxPlayers, onSave, onIconChange }: Props) {
    const [lines, setLines] = useState<[string, string]>(() => splitLines(motd));
    const [focused, setFocused] = useState<0 | 1>(0);
    const [hex, setHex] = useState('#54daf4');
    const [stops, setStops] = useState<GradientStop[]>([
        { at: 0, hex: '#54daf4' },
        { at: 1, hex: '#c77dff' },
    ]);
    const [format, setFormat] = useState<OutputFormat>('properties');
    const [paste, setPaste] = useState('');
    const [name, setName] = useState(serverName);
    const [previewOnline, setPreviewOnline] = useState<number | null>(null);
    const [max, setMax] = useState(String(maxPlayers));
    const [state, setState] = useState<SaveState>({ kind: 'saved', at: null });
    const [restarting, setRestarting] = useState<'ask' | 'busy' | null>(null);
    const inputs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
    const hexAllowed = supportsHex(software);

    const status = useQuery({ queryKey: keys.status(server), queryFn: () => getStatus(server), staleTime: 15_000 });
    const canonical = useMemo(() => fromAmpersand(lines.join('\n')), [lines]);

    useEffect(() => {
        // Only follow outside changes; our own saves come back equal and must not move the cursor.
        setLines((current) => (fromAmpersand(current.join('\n')) === motd ? current : splitLines(motd)));
    }, [motd]);

    const write = async (value: string) => {
        setState({ kind: 'saving' });
        try {
            await onSave({ motd: value });
            setState({ kind: 'saved', at: Date.now() });
        } catch (error) {
            setState({ kind: 'failed', message: httpErrorToHuman(error) });
        }
    };
    // A save still waiting when the page is left is written then (useDebouncedCallback flushes).
    const saveMotd = useDebouncedCallback(write, 700);

    const saveMax = useDebouncedCallback((value: string) => {
        if (/^\d+$/.test(value) && Number(value) >= 1) {
            onSave({ 'max-players': value }).catch((error) => toast.error(httpErrorToHuman(error)));
        }
    }, 800);

    const update = (next: [string, string]) => {
        setLines(next);
        setState({ kind: 'pending' });
        saveMotd(fromAmpersand(next.join('\n')));
    };

    const setLine = (line: 0 | 1, value: string) => update(line === 0 ? [value, lines[1]] : [lines[0], value]);

    /** Runs an edit against the focused line's selection and puts the cursor back. */
    const edit = (change: (text: string, start: number, end: number) => Edited) => {
        const input = inputs[focused].current;
        const text = lines[focused];
        const start = input?.selectionStart ?? text.length;
        const end = input?.selectionEnd ?? text.length;
        const result = change(text, start, end);
        setLine(focused, result.text);
        requestAnimationFrame(() => {
            input?.focus();
            input?.setSelectionRange(result.anchor ?? result.cursor, result.cursor);
        });
    };

    /**
     * Formats the selected characters, whatever colors and styles they already have. With nothing
     * selected, a color, style or reset is written at the cursor for what is typed next, and a
     * rainbow or gradient colors the whole line.
     */
    const formatWith = (change: Change, code?: string) =>
        edit((text, start, end) => {
            if (start !== end) return formatSelection(text, start, end, change);
            if (code !== undefined) return applyCode(text, start, end, code);

            return formatSelection(text, 0, text.length, change);
        });

    const center = (line: 0 | 1) => setLine(line, toAmpersand(centerLine(fromAmpersand(lines[line]))));

    const output = format === 'properties' ? `motd=${toPropertiesValue(canonical)}` : format === 'section' ? canonical.replace(/\n/g, '\\n') : toAmpersand(canonical).replace(/\n/g, '\\n');

    const readPaste = (value: string) => {
        setPaste(value);
        if (value.trim() !== '') update(splitLines(normalizeMotd(value)));
    };

    const rename = async () => {
        const trimmed = name.trim();
        if (trimmed === '' || trimmed === serverName) return;
        try {
            await renameServer(server, trimmed);
            toast.success('Server renamed.');
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        }
    };

    const restart = async () => {
        setRestarting('busy');
        try {
            saveMotd.flush();
            await http.post(`/api/client/servers/${server}/power`, { signal: 'restart' });
            toast.success('Restarting. The new MOTD shows once the server is back up.');
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setRestarting(null);
        }
    };

    const online = previewOnline ?? status.data?.status?.online ?? 0;
    const running = status.data?.status != null;

    return (
        <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
            {/* Where the MOTD stands: saved to the file, and shown after a restart. */}
            <div className={cn(box, 'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-3 mcs:px-4 mcs:py-3')}>
                <SaveStatus state={state} onRetry={() => void write(canonical)} />
                <span className={'mcs:flex-1 mcs:text-xs mcs:text-muted-foreground'}>Written to server.properties as you type. Players see it after the server restarts.</span>
                {running && (
                    <Button size={'small'} isSecondary isLoading={restarting === 'busy'} disabled={state.kind === 'saving' || state.kind === 'pending'} onClick={() => setRestarting('ask')}>
                        <NamedIcon name={'rotate-ccw'} size={14} /> Restart to show it
                    </Button>
                )}
            </div>

            <ServerListPreview
                name={name}
                motd={canonical}
                icon={icon}
                online={online}
                max={Number(max) || maxPlayers}
                onLineClick={(line) => {
                    setFocused(line as 0 | 1);
                    inputs[line].current?.focus();
                }}
            />

            <div className={'mcs:grid mcs:items-start mcs:gap-4 mcs:xl:grid-cols-[minmax(0,1fr)_20rem]'}>
                <section className={box}>
                    {/* The toolbar works on the line with the cursor, or its selection. */}
                    <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-1 mcs:border-b mcs:border-border mcs:px-2 mcs:py-1.5'}>
                        <div className={cn('mcs:grid mcs:gap-1 mcs:pr-1', hexAllowed ? 'mcs:grid-cols-10' : 'mcs:grid-cols-8')}>
                            {COLORS.map((color) => (
                                <Tooltip key={color.code} content={`${color.name} · &${color.code}`}>
                                    <button
                                        type={'button'}
                                        aria-label={color.name}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => formatWith({ color: color.code }, color.code)}
                                        className={'mcs:size-5 mcs:cursor-pointer mcs:rounded-sm mcs:border mcs:border-black/30 mcs:transition-transform mcs:hover:scale-110'}
                                        style={{ backgroundColor: color.hex }}
                                    />
                                </Tooltip>
                            ))}
                            {hexAllowed && (
                                <ColorPicker
                                    value={hex}
                                    label={'Any color: pick one for the selection'}
                                    confirm={'Apply color'}
                                    hint={'Applies to the selected text, or to what you type next when nothing is selected.'}
                                    onChange={(picked) => {
                                        setHex(picked);
                                        formatWith({ color: picked }, picked);
                                    }}
                                    className={'mcs:col-start-9 mcs:col-end-11 mcs:row-start-1 mcs:row-end-3 mcs:size-11'}
                                    iconSize={24}
                                />
                            )}
                        </div>
                        <span className={'mcs:mx-1 mcs:h-8 mcs:w-px mcs:bg-border'} />
                        {STYLES.map((style) => (
                            <Tool key={style.code} label={`${style.name} · &${style.code}`} onClick={() => formatWith({ toggle: style.key as StyleKey }, style.code)}>
                                <NamedIcon name={STYLE_ICONS[style.code] ?? 'type'} size={18} />
                            </Tool>
                        ))}
                        <Tool label={'Reset formatting · &r'} onClick={() => formatWith({ reset: true }, 'r')}>
                            <NamedIcon name={'remove-formatting'} size={18} />
                        </Tool>
                        <span className={'mcs:mx-1 mcs:h-8 mcs:w-px mcs:bg-border'} />
                        <Tool label={'Rainbow: color the selection, or the line, along the spectrum'} onClick={() => formatWith({ colors: (count) => rainbowColors(count, hexAllowed) })}>
                            <NamedIcon name={'rainbow'} size={18} />
                        </Tool>
                        <DropdownMenu
                            triggerClassName={'mcs:flex mcs:h-10 mcs:min-w-8 mcs:max-w-12 mcs:flex-1'}
                            triggerContent={
                                <span title={'Symbols'} aria-label={'Symbols'} className={'mcs:flex mcs:size-full mcs:cursor-pointer mcs:items-center mcs:justify-center mcs:rounded-md mcs:text-muted-foreground mcs:hover:bg-muted mcs:hover:text-foreground'}>
                                    <NamedIcon name={'omega'} size={18} />
                                </span>
                            }
                        >
                            <div className={'mcs:grid mcs:grid-cols-8 mcs:gap-1 mcs:p-1'}>
                                {SYMBOLS.map((symbol) => (
                                    <DropdownMenuItem key={symbol} onClick={() => edit((text, start, end) => insertAt(text, start, end, symbol))}>
                                        <span className={'mcs:text-lg'}>{symbol}</span>
                                    </DropdownMenuItem>
                                ))}
                            </div>
                        </DropdownMenu>
                    </div>

                    {/* Gradients, where the server software reads hex colors. */}
                    <div className={'mcs:flex mcs:flex-col mcs:gap-2 mcs:border-b mcs:border-border mcs:bg-muted/20 mcs:px-3 mcs:py-2'}>
                        {hexAllowed ? (
                            <>
                                <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-2'}>
                                    <span className={'mcs:w-16 mcs:text-xs mcs:font-medium mcs:text-muted-foreground'}>Gradient</span>
                                    <div className={'mcs:min-w-0 mcs:flex-1'}>
                                        <GradientSlider stops={stops} onChange={setStops} />
                                    </div>
                                    <Button size={'xsmall'} isSecondary onMouseDown={(event) => event.preventDefault()} onClick={() => formatWith({ colors: (count) => gradientColors(count, stops) })}>
                                        Apply gradient
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <p className={'mcs:text-xs mcs:text-muted-foreground'}>Hex colors and gradients need Paper, Purpur or Spigot; this server uses the 16 colors above.</p>
                        )}
                    </div>

                    <div className={'mcs:flex mcs:flex-col mcs:gap-4 mcs:p-4'}>
                        {([0, 1] as const).map((line) => {
                            const width = lineWidth(fromAmpersand(lines[line]));
                            const over = width > MOTD_WIDTH;

                            return (
                                <div key={line} className={'mcs:flex mcs:flex-col mcs:gap-1.5'}>
                                    <div className={'mcs:flex mcs:items-center mcs:gap-2'}>
                                        <Label htmlFor={`mcs-motd-${line}`}>{line === 0 ? 'First line' : 'Second line'}</Label>
                                        <span className={'mcs:flex-1'} />
                                        <Button.Text size={'xsmall'} onClick={() => center(line)}>
                                            <NamedIcon name={'text-align-center'} size={13} /> Centre
                                        </Button.Text>
                                    </div>
                                    <Input
                                        id={`mcs-motd-${line}`}
                                        ref={inputs[line]}
                                        value={lines[line]}
                                        onFocus={() => setFocused(line)}
                                        onChange={(event) => setLine(line, event.target.value)}
                                        className={cn('mcs:font-mono', focused === line && 'mcs:ring-1 mcs:ring-primary/40')}
                                        spellCheck={false}
                                        placeholder={line === 0 ? 'A Minecraft Server' : 'Optional second line'}
                                    />
                                    {/* How much of the list's width the line takes; the rest is cut off. */}
                                    <div className={'mcs:flex mcs:items-center mcs:gap-2'}>
                                        <div className={'mcs:h-1 mcs:flex-1 mcs:overflow-hidden mcs:rounded-full mcs:bg-muted'}>
                                            <div className={cn('mcs:h-full mcs:rounded-full', over ? 'mcs:bg-destructive' : width > MOTD_WIDTH * 0.9 ? 'mcs:bg-warning' : 'mcs:bg-primary')} style={{ width: `${Math.min(100, (width / MOTD_WIDTH) * 100)}%` }} />
                                        </div>
                                        <span className={cn('mcs:font-mono mcs:text-xs mcs:tabular-nums', over ? 'mcs:text-destructive' : 'mcs:text-muted-foreground')}>
                                            {width} / {MOTD_WIDTH} px{over && ' · cut off'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                        <p className={'mcs:text-xs mcs:text-muted-foreground'}>
                            Codes are written with &amp;: <span className={'mcs:font-mono'}>&amp;6</span> gold, <span className={'mcs:font-mono'}>&amp;l</span> bold, <span className={'mcs:font-mono'}>&amp;r</span> back to normal. Select text first to format just that part.
                        </p>
                    </div>
                </section>

                <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                    <Section title={'In the list'}>
                        <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
                            <div>
                                <Label>Server icon</Label>
                                <IconUpload server={server} icon={icon} onChange={onIconChange} />
                            </div>
                            <div>
                                <Label htmlFor={'mcs-server-name'}>Server name</Label>
                                <Input id={'mcs-server-name'} value={name} disabled={!canRename} onChange={(event) => setName(event.target.value)} onBlur={rename} maxLength={191} />
                                <p className={'mcs:mt-1 mcs:text-xs mcs:text-muted-foreground'}>Renames the server in the panel too.</p>
                            </div>
                            <div className={'mcs:grid mcs:grid-cols-2 mcs:gap-3'}>
                                <div>
                                    <Label htmlFor={'mcs-preview-online'}>Players online</Label>
                                    <Input id={'mcs-preview-online'} inputMode={'numeric'} value={String(online)} onChange={(event) => setPreviewOnline(Number(event.target.value.replace(/\D/g, '')) || 0)} />
                                    <p className={'mcs:mt-1 mcs:text-xs mcs:text-muted-foreground'}>Preview only.</p>
                                </div>
                                <div>
                                    <Label htmlFor={'mcs-preview-max'}>Max players</Label>
                                    <Input
                                        id={'mcs-preview-max'}
                                        inputMode={'numeric'}
                                        value={max}
                                        onChange={(event) => {
                                            const value = event.target.value.replace(/\D/g, '');
                                            setMax(value);
                                            saveMax(value);
                                        }}
                                    />
                                    <p className={'mcs:mt-1 mcs:text-xs mcs:text-muted-foreground'}>Saved as max-players.</p>
                                </div>
                            </div>
                        </div>
                    </Section>

                    <Section
                        title={'Copy or paste'}
                        aside={
                            <div className={'prism-switch mcs:flex mcs:rounded-md mcs:bg-muted mcs:p-0.5'}>
                                {(
                                    [
                                        ['properties', 'File'],
                                        ['section', '§'],
                                        ['ampersand', '&'],
                                    ] as const
                                ).map(([value, label]) => (
                                    <button key={value} type={'button'} onClick={() => setFormat(value)} className={cn('prism-switch-item mcs:cursor-pointer mcs:rounded mcs:px-2 mcs:py-0.5 mcs:text-xs', format === value ? 'mcs:bg-primary mcs:text-primary-foreground' : 'mcs:text-muted-foreground mcs:hover:text-foreground')}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        }
                    >
                        <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
                            <CopyOnClick text={output}>
                                <pre className={'mcs:cursor-pointer mcs:rounded mcs:bg-sunken mcs:p-3 mcs:font-mono mcs:text-xs mcs:break-all mcs:whitespace-pre-wrap'}>{output}</pre>
                            </CopyOnClick>
                            <div>
                                <Label htmlFor={'mcs-motd-paste'}>Paste a MOTD</Label>
                                <TextArea id={'mcs-motd-paste'} rows={2} value={paste} placeholder={'Any of the three forms, from any MOTD generator'} onChange={(event) => readPaste(event.target.value)} className={'mcs:font-mono'} />
                            </div>
                        </div>
                    </Section>
                </div>
            </div>

            {restarting === 'ask' && (
                <Dialog.Confirm open title={'Restart the server?'} confirm={'Restart'} onClose={() => setRestarting(null)} onConfirmed={restart}>
                    Players are disconnected while it restarts. The new MOTD shows in their server list once it is back up.
                </Dialog.Confirm>
            )}
        </div>
    );
}

function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
    const [, tick] = useState(0);
    // "Saved just now" turns into "Saved 2 min ago" as time passes.
    useEffect(() => {
        const timer = window.setInterval(() => tick((value) => value + 1), 30_000);

        return () => window.clearInterval(timer);
    }, []);

    if (state.kind === 'failed') {
        return (
            <span className={'mcs:flex mcs:items-center mcs:gap-2 mcs:text-sm mcs:text-destructive'} role={'status'}>
                <NamedIcon name={'triangle-alert'} size={15} /> Not saved: {state.message}
                <Button.Text size={'xsmall'} onClick={onRetry}>
                    Try again
                </Button.Text>
            </span>
        );
    }
    if (state.kind === 'pending' || state.kind === 'saving') {
        return (
            <span className={'mcs:flex mcs:items-center mcs:gap-2 mcs:text-sm mcs:text-muted-foreground'} role={'status'}>
                <NamedIcon name={'loader-circle'} size={15} className={'mcs:animate-spin'} /> Saving…
            </span>
        );
    }
    const minutes = state.at ? Math.floor((Date.now() - state.at) / 60_000) : null;

    return (
        <span className={'mcs:flex mcs:items-center mcs:gap-2 mcs:text-sm mcs:text-success'} role={'status'}>
            <NamedIcon name={'circle-check'} size={15} />
            {state.at === null ? 'Saved in server.properties' : minutes === 0 ? 'Saved just now' : `Saved ${minutes} min ago`}
        </span>
    );
}
