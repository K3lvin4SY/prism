import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, NamedIcon, NumberInput, PageContentBlock, Select, Spinner, TextArea, cn, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { PRISM, getSettings, refresh, saveSettings, setSettingFile, settingsKey, type PrismExtension, type PrismId, type SettingField } from './api';
import BrandingPreview from './BrandingPreview';
import SaveBar, { describeValue } from './SaveBar';
import DateTimeField from './DateTimeField';
import EggPictures from './EggPictures';
import ExportImport from './ExportImport';
import LayoutPresets from './LayoutPresets';
import { PreviewControls, closePreview, usePreviewDraft } from './preview';
import { THEME_ID, themeApi, themeKeys } from './themes/api';
import ThemeEditor, { sectionOf as themeSectionOf, themeSections } from './themes/ThemeEditor';
import { isLook } from './themes/presets';
import { HighlightsEditor, KeybindsEditor, LinesEditor, QuickCommandsEditor, ToggleRow } from './editors';
import { HINTS, type Hint } from './hints';

const EXPORT_ID = 'prism-export';
type Target = PrismId | typeof THEME_ID | typeof EXPORT_ID;

/** One entry in the sidebar: an installed Prism extension, or Prism Themes, with its sections. */
interface Entry {
    id: Target;
    name: string;
    icon: string;
    sections: string[];
    settings: { key: string; label: string; help: string | null; section: string }[];
}

const tabOf = (field: SettingField) => field.tab ?? 'General';

export default function PropertiesScreen() {
    const results = useQueries({ queries: PRISM.map((extension) => ({ queryKey: settingsKey(extension.id), queryFn: () => getSettings(extension.id), staleTime: 30_000 })) });
    const installed = PRISM.map((extension, index) => ({ extension, schema: results[index].data })).filter((item): item is { extension: PrismExtension; schema: SettingField[] } => !!item.schema);
    const loading = results.some((query) => query.isLoading);
    const failed = results.find((query) => query.isError);
    // Prism Themes is a theme, not an extension with settings, so it is found in the themes list.
    const themes = useQuery({ queryKey: themeKeys.themes, queryFn: themeApi.themes, staleTime: 30_000 });
    const hasTheme = !!themes.data?.themes.some((theme) => theme.id === THEME_ID && theme.enabled);
    const themeSettings = useQuery({ queryKey: themeKeys.settings, queryFn: themeApi.settings, enabled: hasTheme });

    const entries = useMemo(() => {
        const list: Entry[] = installed.map(({ extension, schema }) => ({
            id: extension.id,
            name: extension.name,
            icon: extension.icon,
            sections: [...(extension.id === 'prism-layout' ? ['Presets'] : []), ...new Set(schema.map(tabOf))],
            settings: schema.map((field) => ({ key: field.input, label: field.label, help: field.help, section: tabOf(field) })),
        }));
        if (hasTheme) {
            const settings = themeSettings.data ?? [];
            const theme: Entry = { id: THEME_ID, name: 'Prism Themes', icon: 'palette', sections: themeSections(settings), settings: settings.filter((setting) => isLook(setting.key)).map((setting) => ({ key: setting.key, label: setting.label, help: setting.help, section: themeSectionOf(setting) })) };
            // The look sits beside the layout.
            const layout = list.findIndex((entry) => entry.id === 'prism-layout');
            list.splice(layout + 1, 0, theme);
        }
        // Prism Export closes the list.
        if (list.length > 0) list.push({ id: EXPORT_ID, name: 'Export and import', icon: 'package', sections: ['Export', 'Import'], settings: [] });

        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [results.map((query) => query.dataUpdatedAt).join(), hasTheme, themeSettings.data]);

    const [active, setActive] = useState<Target | null>(null);
    const [sectionOf, setSectionOf] = useState<Partial<Record<Target, string>>>({});
    const [visited, setVisited] = useState<Target[]>([]);
    const [dirty, setDirty] = useState<Partial<Record<Target, boolean>>>({});
    const [search, setSearch] = useState('');
    const [focus, setFocus] = useState<string | null>(null);

    const current = entries.find((entry) => entry.id === active) ?? entries[0];
    const sectionFor = (entry: Entry) => (entry.sections.includes(sectionOf[entry.id] ?? '') ? sectionOf[entry.id]! : entry.sections[0]);

    // An editor stays mounted once opened, so its unsaved changes survive moving around.
    useEffect(() => {
        if (current && !visited.includes(current.id)) setVisited((list) => [...list, current.id]);
    }, [current, visited]);
    useEffect(() => () => closePreview(), []);

    // A setting picked from the search is scrolled to and outlined for a moment.
    useEffect(() => {
        if (!focus || !current) return;
        const frame = requestAnimationFrame(() => document.getElementById(`ppx-setting-${current.id}-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        const timer = window.setTimeout(() => setFocus(null), 2500);

        return () => {
            cancelAnimationFrame(frame);
            window.clearTimeout(timer);
        };
    }, [focus, current]);

    const go = (id: Target, section?: string, key?: string) => {
        setActive(id);
        if (section) setSectionOf((map) => ({ ...map, [id]: section }));
        setFocus(key ?? null);
    };
    const onDirty = useCallback((id: Target, value: boolean) => setDirty((map) => (map[id] === value ? map : { ...map, [id]: value })), []);

    return (
        <PageContentBlock title={'Prism Properties'}>
            <div className={'ppx:flex ppx:flex-col ppx:gap-4'}>
                {failed && <Alert type={'danger'}>{httpErrorToHuman(failed.error)}</Alert>}
                {loading && entries.length === 0 ? (
                    <Spinner centered />
                ) : !current ? (
                    <Alert type={'info'}>No Prism extensions are installed and enabled. Install a Prism extension, such as Prism Console, Prism MC or Prism Layout, to change its settings here.</Alert>
                ) : (
                    <div className={'ppx:grid ppx:gap-6 ppx:lg:grid-cols-[15rem_minmax(0,1fr)]'}>
                        <Sidebar entries={entries} current={current} section={sectionFor(current)} dirty={dirty} search={search} onSearch={setSearch} onGo={go} />
                        <div className={'ppx:min-w-0'}>
                            {entries
                                .filter((entry) => visited.includes(entry.id) || entry.id === current.id)
                                .map((entry) => {
                                    const shown = entry.id === current.id;
                                    const section = sectionFor(entry);
                                    const item = installed.find(({ extension }) => extension.id === entry.id);

                                    return (
                                        <div key={entry.id} hidden={!shown}>
                                            {entry.id === EXPORT_ID ? (
                                                <ExportImport section={section} installed={installed} theme={hasTheme ? themeSettings.data : undefined} />
                                            ) : entry.id === THEME_ID ? (
                                                <ThemeEditor section={section} focus={shown ? focus : null} onDirty={(value) => onDirty(THEME_ID, value)} />
                                            ) : (
                                                item && <ExtensionSettings extension={item.extension} schema={item.schema} tab={section} focus={shown ? focus : null} onDirty={onDirty} />
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}
            </div>
        </PageContentBlock>
    );
}

/**
 * How far down a bar fixed or stuck to the top of the page reaches, such as Prism Layout's top
 * bar, so the sidebar sticks under it rather than behind it. Works with any layout and theme.
 */
function useStickyTop(): number {
    const [top, setTop] = useState(0);

    useEffect(() => {
        const measure = () => {
            let bottom = 0;
            for (const header of document.querySelectorAll('header')) {
                const style = getComputedStyle(header);
                const box = header.getBoundingClientRect();
                if ((style.position === 'sticky' || style.position === 'fixed') && box.top <= 1 && box.height > 0) bottom = Math.max(bottom, box.bottom);
            }
            setTop(Math.round(bottom));
        };
        measure();
        const observer = new ResizeObserver(measure);
        document.querySelectorAll('header').forEach((header) => observer.observe(header));
        window.addEventListener('resize', measure);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, []);

    return top;
}

function Sidebar({ entries, current, section, dirty, search, onSearch, onGo }: { entries: Entry[]; current: Entry; section: string; dirty: Partial<Record<Target, boolean>>; search: string; onSearch: (value: string) => void; onGo: (id: Target, section?: string, key?: string) => void }) {
    const query = search.trim().toLowerCase();
    const matches = useMemo(() => {
        if (!query) return [];
        const found: { entry: Entry; section: string; key?: string; label: string }[] = [];
        for (const entry of entries) {
            for (const name of entry.sections) if (`${entry.name} ${name}`.toLowerCase().includes(query)) found.push({ entry, section: name, label: name });
            for (const setting of entry.settings) if (`${setting.label} ${setting.help ?? ''} ${setting.section}`.toLowerCase().includes(query)) found.push({ entry, section: setting.section, key: setting.key, label: setting.label });
        }

        return found.slice(0, 60);
    }, [entries, query]);
    const total = entries.reduce((sum, entry) => sum + entry.settings.length, 0);
    const topOffset = useStickyTop();

    return (
        <aside
            className={'ppx:flex ppx:flex-col ppx:gap-3 ppx:lg:sticky ppx:lg:top-[calc(var(--ppx-top)+1rem)] ppx:lg:max-h-[calc(100dvh-var(--ppx-top)-2rem)] ppx:lg:self-start ppx:lg:overflow-y-auto'}
            style={{ '--ppx-top': `${topOffset}px` } as React.CSSProperties}
        >
            <div className={'ppx:relative'}>
                <NamedIcon name={'search'} size={14} className={'ppx:pointer-events-none ppx:absolute ppx:top-1/2 ppx:left-3 ppx:-translate-y-1/2 ppx:text-muted-foreground'} />
                <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={`Search ${total} settings`} aria-label={'Search the settings'} className={'ppx:w-full ppx:pl-8'} />
            </div>

            {query ? (
                <nav className={'ppx:flex ppx:flex-col ppx:gap-0.5 ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card ppx:p-1.5'} aria-label={'Search results'}>
                    {matches.length === 0 ? (
                        <p className={'ppx:px-2 ppx:py-1.5 ppx:text-sm ppx:text-muted-foreground'}>No setting matches.</p>
                    ) : (
                        matches.map((match) => (
                            <button
                                key={`${match.entry.id}:${match.section}:${match.key ?? ''}`}
                                type={'button'}
                                onClick={() => {
                                    onGo(match.entry.id, match.section, match.key);
                                    onSearch('');
                                }}
                                className={'ppx:flex ppx:cursor-pointer ppx:flex-col ppx:rounded-md ppx:px-2 ppx:py-1.5 ppx:text-left ppx:hover:bg-muted'}
                            >
                                <span className={'ppx:text-sm'}>{match.label}</span>
                                <span className={'ppx:text-xs ppx:text-muted-foreground'}>
                                    {match.entry.name}
                                    {match.key && ` · ${match.section}`}
                                </span>
                            </button>
                        ))
                    )}
                </nav>
            ) : (
                <>
                    {/* Narrow screens: one dropdown of every extension's sections. */}
                    <select
                        className={'ppx:w-full ppx:rounded-md ppx:border ppx:border-input-border ppx:bg-input ppx:px-3 ppx:py-2 ppx:text-sm ppx:lg:hidden'}
                        value={`${current.id}\u0000${section}`}
                        onChange={(event) => {
                            const [id, name] = event.target.value.split('\u0000');
                            onGo(id as Target, name);
                        }}
                        aria-label={'Settings section'}
                    >
                        {entries.map((entry) => (
                            <optgroup key={entry.id} label={entry.name}>
                                {entry.sections.map((name) => (
                                    <option key={name} value={`${entry.id}\u0000${name}`}>
                                        {name}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>

                    <nav className={'ppx:hidden ppx:flex-col ppx:gap-0.5 ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card ppx:p-1.5 ppx:lg:flex'} aria-label={'Prism extensions'}>
                        {entries.map((entry) => {
                            const open = entry.id === current.id;

                            return (
                                <div key={entry.id}>
                                    <button
                                        type={'button'}
                                        onClick={() => onGo(entry.id)}
                                        aria-expanded={open}
                                        className={cn('ppx:flex ppx:w-full ppx:cursor-pointer ppx:items-center ppx:gap-2.5 ppx:rounded-md ppx:px-2 ppx:py-1.5 ppx:text-left ppx:text-sm', open ? 'ppx:font-semibold ppx:text-foreground' : 'ppx:text-muted-foreground ppx:hover:bg-muted ppx:hover:text-foreground')}
                                    >
                                        <NamedIcon name={entry.icon} size={15} className={open ? 'ppx:text-primary' : undefined} />
                                        <span className={'ppx:min-w-0 ppx:flex-1 ppx:truncate'}>{entry.name}</span>
                                        {dirty[entry.id] && <span className={'ppx:size-2 ppx:shrink-0 ppx:rounded-full ppx:bg-warning'} title={'Unsaved changes'} />}
                                    </button>
                                    {open && (
                                        <div className={'ppx:my-1 ppx:ml-[1.2rem] ppx:flex ppx:flex-col ppx:gap-0.5 ppx:border-l ppx:border-border ppx:pl-2'}>
                                            {entry.sections.map((name) => (
                                                <button
                                                    key={name}
                                                    type={'button'}
                                                    onClick={() => onGo(entry.id, name)}
                                                    aria-current={name === section ? 'page' : undefined}
                                                    className={cn('ppx:cursor-pointer ppx:rounded-md ppx:px-2 ppx:py-1 ppx:text-left ppx:text-sm', name === section ? 'ppx:bg-primary/12 ppx:font-medium ppx:text-primary' : 'ppx:text-muted-foreground ppx:hover:bg-muted ppx:hover:text-foreground')}
                                                >
                                                    {name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </nav>
                </>
            )}
        </aside>
    );
}

function ExtensionSettings({ extension, schema, tab, focus, onDirty }: { extension: PrismExtension; schema: SettingField[]; tab: string; focus: string | null; onDirty: (id: Target, dirty: boolean) => void }) {
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState<Record<string, unknown>>({});
    const [saving, setSaving] = useState(false);
    const dirty = Object.keys(draft).length > 0;
    const hints = HINTS[extension.id];
    const layout = extension.id === 'prism-layout';

    useEffect(() => onDirty(extension.id, dirty), [extension.id, dirty, onDirty]);

    // Leaving with unsaved changes asks first.
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);

        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const value = (field: SettingField) => (field.input in draft ? draft[field.input] : field.value);
    const values = useMemo(() => Object.fromEntries(schema.map((field) => [field.input, field.input in draft ? draft[field.input] : field.value])), [schema, draft]);
    // Only Prism Layout listens in the preview window; for the others nothing is sent.
    usePreviewDraft(layout ? extension.id : '', layout ? values : EMPTY);

    const change = (field: SettingField, next: unknown) =>
        setDraft((current) => {
            const copy = { ...current };
            if (JSON.stringify(next) === JSON.stringify(field.value)) delete copy[field.input];
            else copy[field.input] = next;

            return copy;
        });

    const pick = (settings: Record<string, unknown>) => {
        for (const [key, next] of Object.entries(settings)) {
            const field = schema.find((item) => item.input === key);
            if (field) change(field, next);
        }
    };

    const save = async () => {
        setSaving(true);
        try {
            const fresh = await saveSettings(extension.id, draft);
            await refresh(extension.id);
            queryClient.setQueryData(settingsKey(extension.id), fresh);
            setDraft({});
            toast.success(`${extension.name} settings saved. People see them the next time they load a page.`);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setSaving(false);
        }
    };

    const fields = schema.filter((field) => tabOf(field) === tab);
    const sections: { title: string; fields: SettingField[] }[] = [];
    for (const field of fields) {
        const title = hints[field.input]?.section ?? tab;
        const section = sections.find((entry) => entry.title === title);
        section ? section.fields.push(field) : sections.push({ title, fields: [field] });
    }

    return (
        <div className={'ppx:flex ppx:flex-col ppx:gap-4'}>
            <div className={'ppx:flex ppx:items-center ppx:gap-4 ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card ppx:p-4'}>
                <div className={'ppx:flex ppx:size-11 ppx:shrink-0 ppx:items-center ppx:justify-center ppx:rounded-lg ppx:bg-primary/15 ppx:text-primary'}>
                    <NamedIcon name={extension.icon} size={22} />
                </div>
                <div className={'ppx:min-w-0'}>
                    <h2 className={'ppx:text-lg ppx:font-semibold'}>{extension.name}</h2>
                    <p className={'ppx:text-sm ppx:text-muted-foreground'}>{extension.description}</p>
                </div>
            </div>

            {layout && tab === 'Presets' && <LayoutPresets values={values} onPick={pick} />}
            {layout && (tab === 'Branding' || tab === 'Sign-in page') && <BrandingPreview schema={schema} draft={draft} tab={tab} />}

            {sections.map((section) => (
                <section key={section.title} className={'ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card'}>
                    <h3 className={'ppx:border-b ppx:border-border ppx:px-4 ppx:py-3 ppx:text-sm ppx:font-semibold'}>{section.title}</h3>
                    <div className={'ppx:flex ppx:flex-col ppx:divide-y ppx:divide-border'}>
                        {section.fields.map((field) => (
                            <div key={field.input} id={`ppx-setting-${extension.id}-${field.input}`} className={cn('ppx:scroll-mt-24 ppx:px-4 ppx:py-3 ppx:transition-shadow', focus === field.input && 'ppx:rounded-md ppx:ring-2 ppx:ring-primary ppx:ring-inset')}>
                                {field.field === 'file' ? (
                                    <FileField extension={extension} field={field} onSchema={(fresh) => queryClient.setQueryData(settingsKey(extension.id), fresh)} />
                                ) : (
                                    <Field field={field} hint={hints[field.input] ?? {}} value={value(field)} onChange={(next) => change(field, next)} />
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            ))}

            {layout && tab === 'Server cards' && <EggPictures />}

            {extension.id === 'prism-files' && tab === 'Paths' && (
                <Alert type={'info'}>Protected paths are enforced by Prism File Browser. Someone using the panel&apos;s file API directly, such as an API key or SFTP, is not stopped by them.</Alert>
            )}

            {layout && <PreviewControls />}

            <SaveBar
                changes={schema
                    .filter((field) => field.input in draft)
                    .map((field) => ({ key: field.input, label: field.label, section: tabOf(field), from: describeValue(field.value, field.options), to: describeValue(draft[field.input], field.options) }))}
                saving={saving}
                onSave={save}
                onDiscard={() => setDraft({})}
                onUndo={(key) =>
                    setDraft((current) => {
                        const { [key]: _undone, ...rest } = current;

                        return rest;
                    })
                }
            />
        </div>
    );
}

const EMPTY: Record<string, unknown> = {};

function Label({ field, aside }: { field: SettingField; aside?: React.ReactNode }) {
    return (
        <div className={'ppx:mb-2 ppx:flex ppx:items-start ppx:gap-3'}>
            <div className={'ppx:min-w-0 ppx:flex-1'}>
                <p className={'ppx:text-sm ppx:font-medium'}>{field.label}</p>
                {field.help && <p className={'ppx:text-xs ppx:text-muted-foreground'}>{field.help}</p>}
            </div>
            {aside}
        </div>
    );
}

/** A file setting: uploaded or removed straight away, outside the unsaved changes. */
function FileField({ extension, field, onSchema }: { extension: PrismExtension; field: SettingField; onSchema: (schema: SettingField[]) => void }) {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const current = typeof field.value === 'string' && field.value !== '' ? field.value : null;

    const send = async (file: File | null) => {
        setBusy(true);
        try {
            onSchema(await setSettingFile(extension.id, field.input, file));
            await refresh(extension.id);
            toast.success(file ? `${field.label} uploaded.` : `${field.label} removed.`);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
            if (input.current) input.current.value = '';
        }
    };

    return (
        <>
            <Label field={field} />
            <div className={'ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-3'}>
                <div className={'ppx:flex ppx:h-16 ppx:min-w-16 ppx:max-w-64 ppx:items-center ppx:justify-center ppx:rounded-md ppx:border ppx:border-dashed ppx:border-border ppx:bg-muted/40 ppx:p-2'}>
                    {current ? <img src={current} alt={field.label} className={'ppx:max-h-12 ppx:max-w-60 ppx:object-contain'} /> : <NamedIcon name={'image'} size={20} className={'ppx:text-muted-foreground'} />}
                </div>
                <input ref={input} type={'file'} accept={'image/*,.ico'} className={'ppx:hidden'} onChange={(event) => event.target.files?.[0] && void send(event.target.files[0])} />
                <Button isSecondary size={'small'} isLoading={busy} onClick={() => input.current?.click()}>
                    <NamedIcon name={'upload'} size={14} /> {current ? 'Replace' : 'Upload'}
                </Button>
                {current && (
                    <Button.Danger isSecondary size={'small'} disabled={busy} onClick={() => void send(null)}>
                        Remove
                    </Button.Danger>
                )}
            </div>
        </>
    );
}

function Field({ field, hint, value, onChange }: { field: SettingField; hint: Hint; value: unknown; onChange: (value: unknown) => void }) {
    if (field.field === 'toggle') {
        return <ToggleRow label={field.label} help={field.help} checked={value === true} onChange={onChange} />;
    }

    if (field.field === 'number' && hint.slider) {
        const { min, max, step = 1, unit = '' } = hint.slider;
        const number = Number(value ?? min);

        return (
            <>
                <Label field={field} aside={<span className={'ppx:font-mono ppx:text-sm ppx:tabular-nums'}>{number.toLocaleString()}{unit}</span>} />
                <input
                    type={'range'}
                    min={min}
                    max={max}
                    step={step}
                    value={number}
                    onChange={(event) => onChange(Number(event.target.value))}
                    className={'ppx:w-full ppx:cursor-pointer'}
                    style={{ accentColor: 'var(--primary)' }}
                    aria-label={field.label}
                />
            </>
        );
    }

    if (field.field === 'number') {
        return (
            <>
                <Label field={field} />
                <NumberInput value={Number(value ?? 0)} onValueChange={(next) => onChange(next ?? 0)} className={'ppx:w-40'} />
            </>
        );
    }

    if (field.field === 'select' && (hint.segmented || field.options.length <= 3)) {
        return (
            <>
                <Label field={field} />
                <div className={'prism-switch ppx:flex ppx:flex-wrap ppx:gap-1 ppx:rounded-lg ppx:bg-muted/40 ppx:p-1'}>
                    {field.options.map((option) => (
                        <button
                            key={String(option.value)}
                            type={'button'}
                            onClick={() => onChange(option.value)}
                            className={cn(
                                'prism-switch-item ppx:rounded-md ppx:px-3 ppx:py-1.5 ppx:text-sm ppx:cursor-pointer',
                                option.value === value ? 'ppx:bg-card ppx:font-semibold ppx:shadow-sm' : 'ppx:text-muted-foreground ppx:hover:text-foreground'
                            )}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </>
        );
    }

    if (field.field === 'select') {
        return (
            <>
                <Label field={field} />
                <div className={'ppx:w-72'}>
                    <Select value={value as string} onChange={(next) => onChange(next)} options={field.options.map((option) => ({ value: option.value as string, label: option.label }))} />
                </div>
            </>
        );
    }

    if (field.field === 'textarea') {
        const editor =
            hint.editor === 'highlights' ? (
                <HighlightsEditor value={value} onChange={onChange} />
            ) : hint.editor === 'quickCommands' ? (
                <QuickCommandsEditor value={value} onChange={onChange} />
            ) : hint.editor === 'keybinds' ? (
                <KeybindsEditor value={value} onChange={onChange} />
            ) : hint.editor === 'lines' ? (
                <LinesEditor value={value} onChange={onChange} />
            ) : (
                <TextArea value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} rows={5} className={'ppx:w-full'} />
            );

        return (
            <>
                <Label field={field} />
                {editor}
            </>
        );
    }

    if (hint.editor === 'datetime') {
        return (
            <>
                <Label field={field} />
                <DateTimeField value={value} onChange={onChange} />
            </>
        );
    }

    if (field.field === 'color') {
        return (
            <>
                <Label field={field} />
                <input type={'color'} value={typeof value === 'string' ? value : '#000000'} onChange={(event) => onChange(event.target.value)} aria-label={field.label} />
            </>
        );
    }

    return (
        <>
            <Label field={field} />
            <Input type={field.field === 'password' ? 'password' : 'text'} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} className={'ppx:w-full ppx:max-w-md'} />
        </>
    );
}
