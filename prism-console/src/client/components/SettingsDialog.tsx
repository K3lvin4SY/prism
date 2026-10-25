import { useState } from 'react';
import { Button, Checkbox, Dialog, Input, Select, Switch, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import type { Area, CustomLayout, Preferences, WidgetId } from '../api';
import { FONTS, getConfig, type LayoutId, type QuickCommand, type TerminalSettings } from '../config';
import { AREAS, LAYOUTS, WIDGETS, normaliseCustom } from '../layouts';
import type { CustomRule, HighlightSettings } from '../lib/lines';

const BUILTIN: { key: string; label: string; color: string }[] = [
    { key: 'errors', label: 'Errors', color: '#f87171' },
    { key: 'warnings', label: 'Warnings', color: '#fbbf24' },
    { key: 'joins', label: 'Player joins and leaves', color: '#4ade80' },
    { key: 'chat', label: 'Chat', color: '#93c5fd' },
    { key: 'ready', label: 'Server ready', color: '#34d399' },
    { key: 'info', label: 'Info lines', color: '#7dd3fc' },
    { key: 'debug', label: 'Debug lines', color: '#94a3b8' },
    { key: 'ips', label: 'IP addresses', color: '#c084fc' },
];

type Tab = 'terminal' | 'layout' | 'highlights' | 'quick';

interface Props {
    preferences: Preferences;
    terminal: TerminalSettings;
    layout: LayoutId | 'custom';
    onChange: (patch: Partial<Preferences>) => void;
    onClose: () => void;
}

const pill = (active: boolean) =>
    cn('prism-switch-item pcn:rounded-full pcn:px-3 pcn:py-1 pcn:text-sm pcn:cursor-pointer', active ? 'pcn:bg-primary pcn:text-primary-foreground' : 'pcn:text-muted-foreground pcn:hover:bg-muted pcn:hover:text-foreground');

export default function SettingsDialog({ preferences, terminal, layout, onChange, onClose }: Props) {
    const config = getConfig();
    const tabs = (
        [
            config.allow.terminal && ['terminal', 'Terminal'],
            config.allow.layouts && ['layout', 'Layout'],
            config.allow.highlights && ['highlights', 'Highlights'],
            config.allow.quickCommands && config.features.quickCommands && ['quick', 'Quick commands'],
        ] as const
    ).filter(Boolean) as [Tab, string][];
    const [tab, setTab] = useState<Tab | undefined>(tabs[0]?.[0]);

    const setTerminal = (patch: Partial<TerminalSettings>) => onChange({ terminal: { ...preferences.terminal, ...patch } });
    const highlights: HighlightSettings = preferences.highlights ?? { builtin: {}, custom: [] };
    const quick: QuickCommand[] = preferences.quickCommands ?? [];
    const custom = normaliseCustom(preferences.custom, LAYOUTS[layout === 'custom' ? config.defaultLayout : layout].widgets);

    const move = (list: CustomLayout, index: number, offset: number) => {
        const next = [...list];
        const [item] = next.splice(index, 1);
        next.splice(Math.max(0, Math.min(next.length, index + offset)), 0, item);

        return next;
    };

    return (
        <Dialog open onClose={onClose} title={'Console settings'} description={'Saved to your account, so they follow you to every browser.'}>
            {tabs.length === 0 ? (
                <p className={'pcn:text-sm pcn:text-muted-foreground'}>An administrator has set the console up for everyone, so there is nothing to change here.</p>
            ) : (
                <div className={'pcn:flex pcn:flex-col pcn:gap-4'}>
                    <div className={'pcn:flex pcn:flex-wrap pcn:gap-1'}>
                        {tabs.map(([value, label]) => (
                            <button key={value} type={'button'} className={pill(tab === value)} onClick={() => setTab(value)}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {tab === 'terminal' && (
                        <div className={'pcn:flex pcn:flex-col pcn:gap-4'}>
                            <label className={'pcn:flex pcn:flex-col pcn:gap-1 pcn:text-sm'}>
                                Font
                                <Select value={terminal.font} onChange={(value) => setTerminal({ font: String(value) })} options={FONTS.map((font) => ({ value: font, label: font }))} />
                            </label>
                            <label className={'pcn:flex pcn:flex-col pcn:gap-1 pcn:text-sm'}>
                                <span className={'pcn:flex pcn:justify-between'}>
                                    Text size <span className={'pcn:tabular-nums pcn:text-muted-foreground'}>{terminal.fontSize}px</span>
                                </span>
                                <input type={'range'} min={9} max={24} value={terminal.fontSize} onChange={(event) => setTerminal({ fontSize: Number(event.target.value) })} style={{ accentColor: 'var(--primary)' }} />
                            </label>
                            <div className={'pcn:flex pcn:flex-col pcn:gap-1 pcn:text-sm'}>
                                Line height
                                <div className={'prism-switch pcn:flex pcn:gap-1 pcn:rounded-lg pcn:bg-muted/40 pcn:p-1'}>
                                    {[1.2, 1.3, 1.4, 1.5, 1.7].map((value) => (
                                        <button key={value} type={'button'} onClick={() => setTerminal({ lineHeight: value })} className={cn('prism-switch-item pcn:flex-1 pcn:rounded-md pcn:py-1 pcn:cursor-pointer', terminal.lineHeight === value ? 'pcn:bg-card pcn:font-semibold pcn:shadow-sm' : 'pcn:text-muted-foreground')}>
                                            {value}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <Switch checked={terminal.wrap} onChange={(wrap) => setTerminal({ wrap })} label={'Wrap long lines'} controlPosition={'end'} />
                            <Switch checked={terminal.timestamps} onChange={(timestamps) => setTerminal({ timestamps })} label={'Show timestamps'} description={'The time each line reached the panel.'} controlPosition={'end'} />
                            <div>
                                <Button.Text size={'small'} onClick={() => onChange({ terminal: undefined })}>
                                    Use the defaults
                                </Button.Text>
                            </div>
                        </div>
                    )}

                    {tab === 'layout' && (
                        <div className={'pcn:flex pcn:flex-col pcn:gap-3'}>
                            <div className={'pcn:grid pcn:gap-2 pcn:sm:grid-cols-2'}>
                                {(Object.keys(LAYOUTS) as LayoutId[]).map((id) => (
                                    <button
                                        key={id}
                                        type={'button'}
                                        onClick={() => onChange({ layout: id })}
                                        className={cn('pcn:rounded-lg pcn:border pcn:p-3 pcn:text-left pcn:cursor-pointer', layout === id ? 'pcn:border-primary pcn:bg-primary/10' : 'pcn:border-border pcn:hover:border-primary/60')}
                                    >
                                        <span className={'pcn:block pcn:font-semibold'}>
                                            {LAYOUTS[id].label}
                                            {id === config.defaultLayout && <span className={'pcn:ml-2 pcn:text-xs pcn:font-normal pcn:text-muted-foreground'}>default</span>}
                                        </span>
                                        <span className={'pcn:text-xs pcn:text-muted-foreground'}>{LAYOUTS[id].description}</span>
                                    </button>
                                ))}
                                <button
                                    type={'button'}
                                    onClick={() => onChange({ layout: 'custom', custom })}
                                    className={cn('pcn:rounded-lg pcn:border pcn:p-3 pcn:text-left pcn:cursor-pointer', layout === 'custom' ? 'pcn:border-primary pcn:bg-primary/10' : 'pcn:border-border pcn:hover:border-primary/60')}
                                >
                                    <span className={'pcn:block pcn:font-semibold'}>Your own</span>
                                    <span className={'pcn:text-xs pcn:text-muted-foreground'}>arrange the widgets yourself</span>
                                </button>
                            </div>
                            {layout === 'custom' && (
                                <div className={'pcn:flex pcn:flex-col pcn:gap-1 pcn:rounded-lg pcn:border pcn:border-border pcn:p-2'}>
                                    {custom.map((entry, index) => (
                                        <div key={entry.widget} className={'pcn:flex pcn:items-center pcn:gap-2 pcn:text-sm'}>
                                            <span className={'pcn:flex-1'}>{WIDGETS[entry.widget as WidgetId]}</span>
                                            <div className={'pcn:w-36'}>
                                                <Select
                                                    value={entry.area}
                                                    onChange={(value) => onChange({ custom: custom.map((item, i) => (i === index ? { ...item, area: value as Area } : item)) })}
                                                    options={(Object.keys(AREAS) as Area[]).filter((area) => entry.widget !== 'terminal' || area !== 'hidden').map((area) => ({ value: area, label: AREAS[area] }))}
                                                />
                                            </div>
                                            <Button.Text size={'xsmall'} disabled={index === 0} onClick={() => onChange({ custom: move(custom, index, -1) })} aria-label={'Move up'}>
                                                <NamedIcon name={'arrow-up'} size={14} />
                                            </Button.Text>
                                            <Button.Text size={'xsmall'} disabled={index === custom.length - 1} onClick={() => onChange({ custom: move(custom, index, 1) })} aria-label={'Move down'}>
                                                <NamedIcon name={'arrow-down'} size={14} />
                                            </Button.Text>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div>
                                <Button.Text size={'small'} onClick={() => onChange({ layout: undefined })}>
                                    Use the default layout
                                </Button.Text>
                            </div>
                        </div>
                    )}

                    {tab === 'highlights' && (
                        <div className={'pcn:flex pcn:flex-col pcn:gap-3'}>
                            <p className={'pcn:text-xs pcn:text-muted-foreground'}>Your rules are added to the ones the administrator set. Turning a built-in rule off here hides it only for you.</p>
                            <div className={'pcn:grid pcn:gap-1 pcn:sm:grid-cols-2'}>
                                {BUILTIN.map((rule) => (
                                    <label key={rule.key} className={'pcn:flex pcn:items-center pcn:gap-2 pcn:rounded-md pcn:px-2 pcn:py-1 pcn:text-sm pcn:hover:bg-muted/50'}>
                                        <span className={'pcn:size-3 pcn:rounded-full'} style={{ background: rule.color }} />
                                        <span className={'pcn:flex-1'}>{rule.label}</span>
                                        <Checkbox
                                            checked={highlights.builtin[rule.key] ?? config.highlights.builtin[rule.key] ?? true}
                                            onChange={(checked) => onChange({ highlights: { ...highlights, builtin: { ...highlights.builtin, [rule.key]: checked } } })}
                                        />
                                    </label>
                                ))}
                            </div>
                            {highlights.custom.map((rule, index) => (
                                <RuleRow
                                    key={index}
                                    rule={rule}
                                    onChange={(patch) => onChange({ highlights: { ...highlights, custom: highlights.custom.map((item, i) => (i === index ? { ...item, ...patch } : item)) } })}
                                    onRemove={() => onChange({ highlights: { ...highlights, custom: highlights.custom.filter((_, i) => i !== index) } })}
                                />
                            ))}
                            <div>
                                <Button size={'small'} isSecondary onClick={() => onChange({ highlights: { ...highlights, custom: [...highlights.custom, { pattern: '', regex: false, caseSensitive: false, color: '#f472b6' }] } })}>
                                    <NamedIcon name={'plus'} size={14} /> Add a rule
                                </Button>
                            </div>
                        </div>
                    )}

                    {tab === 'quick' && (
                        <div className={'pcn:flex pcn:flex-col pcn:gap-2'}>
                            <p className={'pcn:text-xs pcn:text-muted-foreground'}>Your buttons show next to the ones the administrator added, on every server.</p>
                            {quick.map((command, index) => (
                                <div key={index} className={'pcn:flex pcn:flex-wrap pcn:items-center pcn:gap-2'}>
                                    <Input value={command.label} onChange={(event) => onChange({ quickCommands: quick.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)) })} placeholder={'Label'} className={'pcn:w-32'} />
                                    <Input value={command.command} onChange={(event) => onChange({ quickCommands: quick.map((item, i) => (i === index ? { ...item, command: event.target.value } : item)) })} placeholder={'Command'} className={'pcn:min-w-40 pcn:flex-1 pcn:font-mono'} />
                                    <label className={'pcn:flex pcn:items-center pcn:gap-1 pcn:text-xs'}>
                                        <Checkbox checked={command.confirm} onChange={(confirm) => onChange({ quickCommands: quick.map((item, i) => (i === index ? { ...item, confirm } : item)) })} /> Ask first
                                    </label>
                                    <Button.Text size={'xsmall'} onClick={() => onChange({ quickCommands: quick.filter((_, i) => i !== index) })} aria-label={'Remove'}>
                                        <NamedIcon name={'x'} size={14} />
                                    </Button.Text>
                                </div>
                            ))}
                            <div>
                                <Button size={'small'} isSecondary onClick={() => onChange({ quickCommands: [...quick, { label: '', command: '', confirm: false, tags: [] }] })}>
                                    <NamedIcon name={'plus'} size={14} /> Add a button
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
            <Dialog.Footer>
                <Button onClick={onClose}>Done</Button>
            </Dialog.Footer>
        </Dialog>
    );
}

function RuleRow({ rule, onChange, onRemove }: { rule: CustomRule; onChange: (patch: Partial<CustomRule>) => void; onRemove: () => void }) {
    return (
        <div className={'pcn:flex pcn:flex-wrap pcn:items-center pcn:gap-2'}>
            <input type={'color'} value={rule.color} onChange={(event) => onChange({ color: event.target.value })} className={'pcn:size-8 pcn:cursor-pointer pcn:rounded pcn:border-0 pcn:bg-transparent'} aria-label={'Color'} />
            <Input value={rule.pattern} onChange={(event) => onChange({ pattern: event.target.value })} placeholder={rule.regex ? 'Pattern' : 'Text'} className={'pcn:min-w-40 pcn:flex-1 pcn:font-mono'} />
            <label className={'pcn:flex pcn:items-center pcn:gap-1 pcn:text-xs'}>
                <Checkbox checked={rule.regex} onChange={(regex) => onChange({ regex })} /> Regex
            </label>
            <label className={'pcn:flex pcn:items-center pcn:gap-1 pcn:text-xs'}>
                <Checkbox checked={rule.caseSensitive} onChange={(caseSensitive) => onChange({ caseSensitive })} /> Case
            </label>
            <Button.Text size={'xsmall'} onClick={onRemove} aria-label={'Remove rule'}>
                <NamedIcon name={'x'} size={14} />
            </Button.Text>
        </div>
    );
}
