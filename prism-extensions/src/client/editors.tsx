import { Button, Checkbox, Input, NamedIcon, Switch, TextArea } from '@pterodactyl/sdk';
import { BUILTIN_HIGHLIGHTS, KEYBIND_ACTIONS } from './hints';

function parse<T>(value: unknown, fallback: T): T {
    if (typeof value !== 'string') return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

const row = 'ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-2 ppx:rounded-md ppx:border ppx:border-border ppx:bg-background/40 ppx:p-2';

interface CustomRule {
    pattern: string;
    regex: boolean;
    caseSensitive: boolean;
    colour: string;
}

interface Highlights {
    builtin: Record<string, boolean>;
    custom: CustomRule[];
}

/** PrismConsole's highlight rules: the built-in ones switched on or off, and custom ones. */
export function HighlightsEditor({ value, onChange }: { value: unknown; onChange: (value: string) => void }) {
    const data = parse<Highlights>(value, { builtin: {}, custom: [] });
    const builtin = data.builtin ?? {};
    const custom = Array.isArray(data.custom) ? data.custom : [];
    const update = (next: Highlights) => onChange(JSON.stringify(next));
    const setRule = (index: number, rule: Partial<CustomRule>) => update({ builtin, custom: custom.map((current, i) => (i === index ? { ...current, ...rule } : current)) });

    return (
        <div className={'ppx:flex ppx:flex-col ppx:gap-3'}>
            <div className={'ppx:grid ppx:gap-1 ppx:sm:grid-cols-2'}>
                {BUILTIN_HIGHLIGHTS.map((rule) => (
                    <label key={rule.key} className={'ppx:flex ppx:items-center ppx:gap-2 ppx:rounded-md ppx:px-2 ppx:py-1.5 ppx:text-sm ppx:hover:bg-muted/50'}>
                        <span className={'ppx:size-3 ppx:rounded-full'} style={{ background: rule.colour }} />
                        <span className={'ppx:flex-1'}>{rule.label}</span>
                        <Checkbox checked={builtin[rule.key] !== false} onChange={(checked) => update({ builtin: { ...builtin, [rule.key]: checked }, custom })} />
                    </label>
                ))}
            </div>
            <div className={'ppx:flex ppx:flex-col ppx:gap-2'}>
                {custom.map((rule, index) => (
                    <div key={index} className={row}>
                        <input
                            type={'color'}
                            value={rule.colour}
                            onChange={(event) => setRule(index, { colour: event.target.value })}
                            className={'ppx:size-8 ppx:cursor-pointer ppx:rounded ppx:border-0 ppx:bg-transparent'}
                            aria-label={'Colour'}
                        />
                        <Input value={rule.pattern} onChange={(event) => setRule(index, { pattern: event.target.value })} placeholder={rule.regex ? 'Pattern, such as \\bkicked\\b' : 'Text to colour'} className={'ppx:min-w-48 ppx:flex-1 ppx:font-mono'} />
                        <label className={'ppx:flex ppx:items-center ppx:gap-1.5 ppx:text-xs'}>
                            <Checkbox checked={rule.regex} onChange={(checked) => setRule(index, { regex: checked })} /> Regex
                        </label>
                        <label className={'ppx:flex ppx:items-center ppx:gap-1.5 ppx:text-xs'}>
                            <Checkbox checked={rule.caseSensitive} onChange={(checked) => setRule(index, { caseSensitive: checked })} /> Match case
                        </label>
                        <Button.Text size={'small'} onClick={() => update({ builtin, custom: custom.filter((_, i) => i !== index) })} aria-label={'Remove rule'}>
                            <NamedIcon name={'x'} size={14} />
                        </Button.Text>
                    </div>
                ))}
                <div>
                    <Button size={'small'} isSecondary onClick={() => update({ builtin, custom: [...custom, { pattern: '', regex: false, caseSensitive: false, colour: '#f472b6' }] })}>
                        <NamedIcon name={'plus'} size={14} /> Add a rule
                    </Button>
                </div>
            </div>
        </div>
    );
}

interface QuickCommand {
    label: string;
    command: string;
    confirm: boolean;
    /** Egg tags the button shows for; empty shows it everywhere. */
    tags: string[];
}

/** PrismConsole's quick command buttons. */
export function QuickCommandsEditor({ value, onChange }: { value: unknown; onChange: (value: string) => void }) {
    const commands = parse<QuickCommand[]>(value, []);
    const list = Array.isArray(commands) ? commands : [];
    const update = (next: QuickCommand[]) => onChange(JSON.stringify(next));
    const set = (index: number, patch: Partial<QuickCommand>) => update(list.map((current, i) => (i === index ? { ...current, ...patch } : current)));

    return (
        <div className={'ppx:flex ppx:flex-col ppx:gap-2'}>
            {list.length === 0 && <p className={'ppx:text-sm ppx:text-muted-foreground'}>No quick commands yet.</p>}
            {list.map((command, index) => (
                <div key={index} className={row}>
                    <Input value={command.label} onChange={(event) => set(index, { label: event.target.value })} placeholder={'Button label'} className={'ppx:w-40'} />
                    <Input value={command.command} onChange={(event) => set(index, { command: event.target.value })} placeholder={'Command, such as save-all'} className={'ppx:min-w-48 ppx:flex-1 ppx:font-mono'} />
                    <Input
                        value={command.tags.join(', ')}
                        onChange={(event) =>
                            set(index, {
                                tags: event.target.value
                                    .split(',')
                                    .map((tag) => tag.trim())
                                    .filter((tag, i, all) => tag !== '' || i === all.length - 1),
                            })
                        }
                        placeholder={'Egg tags, such as minecraft (empty: every server)'}
                        className={'ppx:min-w-56 ppx:flex-1'}
                    />
                    <label className={'ppx:flex ppx:items-center ppx:gap-1.5 ppx:text-xs'}>
                        <Checkbox checked={command.confirm} onChange={(checked) => set(index, { confirm: checked })} /> Ask first
                    </label>
                    <Button.Text size={'small'} onClick={() => update(list.filter((_, i) => i !== index))} aria-label={'Remove quick command'}>
                        <NamedIcon name={'x'} size={14} />
                    </Button.Text>
                </div>
            ))}
            <div>
                <Button size={'small'} isSecondary onClick={() => update([...list, { label: '', command: '', confirm: false, tags: [] }])}>
                    <NamedIcon name={'plus'} size={14} /> Add a quick command
                </Button>
            </div>
        </div>
    );
}

/** A list of paths, one per line. */
export function LinesEditor({ value, onChange, placeholder }: { value: unknown; onChange: (value: string) => void; placeholder?: string }) {
    return <TextArea value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} rows={5} placeholder={placeholder ?? '/.cache\n*.log'} className={'ppx:w-full ppx:font-mono ppx:text-sm'} />;
}

/** Prism File Browser's default keybinds. */
export function KeybindsEditor({ value, onChange }: { value: unknown; onChange: (value: string) => void }) {
    const binds = parse<Record<string, string>>(value, {});

    return (
        <div className={'ppx:grid ppx:gap-1'}>
            {Object.entries(KEYBIND_ACTIONS).map(([action, label]) => (
                <div key={action} className={'ppx:flex ppx:items-center ppx:gap-3 ppx:rounded-md ppx:px-2 ppx:py-1 ppx:hover:bg-muted/40'}>
                    <span className={'ppx:flex-1 ppx:text-sm'}>{label}</span>
                    <Input
                        value={binds[action] ?? ''}
                        onKeyDown={(event) => {
                            if (event.key === 'Tab') return;
                            event.preventDefault();
                            if (event.key === 'Backspace' || event.key === 'Delete') {
                                onChange(JSON.stringify({ ...binds, [action]: '' }));

                                return;
                            }
                            if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
                            const chord = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta', event.key.length === 1 ? event.key.toUpperCase() : event.key]
                                .filter(Boolean)
                                .join('+');
                            onChange(JSON.stringify({ ...binds, [action]: chord }));
                        }}
                        onChange={() => undefined}
                        placeholder={'Press keys'}
                        className={'ppx:w-44 ppx:text-center ppx:font-mono'}
                    />
                </div>
            ))}
        </div>
    );
}

export function ToggleRow({ label, help, checked, onChange }: { label: string; help: string | null; checked: boolean; onChange: (checked: boolean) => void }) {
    return <Switch checked={checked} onChange={onChange} label={label} description={help ?? undefined} controlPosition={'end'} className={'ppx:w-full'} />;
}
