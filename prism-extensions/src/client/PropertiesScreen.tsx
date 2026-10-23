import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, NamedIcon, NumberInput, PageContentBlock, Select, Spinner, TextArea, cn, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { PRISM, getSettings, refresh, saveSettings, setSettingFile, settingsKey, type PrismExtension, type PrismId, type SettingField } from './api';
import BrandingPreview from './BrandingPreview';
import { THEME_ID, themeApi, themeKeys } from './themes/api';
import ThemeEditor from './themes/ThemeEditor';
import { HighlightsEditor, KeybindsEditor, LinesEditor, QuickCommandsEditor, ToggleRow } from './editors';
import { HINTS, type Hint } from './hints';

const pill = (active: boolean) =>
    cn(
        'ppx:inline-flex ppx:items-center ppx:gap-1.5 ppx:rounded-full ppx:px-3.5 ppx:py-1.5 ppx:text-sm ppx:font-medium ppx:cursor-pointer ppx:transition-colors',
        active ? 'ppx:bg-primary ppx:text-primary-foreground ppx:shadow-sm' : 'ppx:text-muted-foreground ppx:hover:bg-muted ppx:hover:text-foreground'
    );

export default function PropertiesScreen() {
    const results = useQueries({ queries: PRISM.map((extension) => ({ queryKey: settingsKey(extension.id), queryFn: () => getSettings(extension.id), staleTime: 30_000 })) });
    const installed = PRISM.map((extension, index) => ({ extension, query: results[index] })).filter(({ query }) => query.data);
    const loading = results.some((query) => query.isLoading);
    const failed = results.find((query) => query.isError);
    // Prism Themes is a theme, not an extension with settings, so it is found in the themes list.
    const themes = useQuery({ queryKey: themeKeys.themes, queryFn: themeApi.themes, staleTime: 30_000 });
    const hasTheme = !!themes.data?.themes.some((theme) => theme.id === THEME_ID && theme.enabled);
    const [selected, setSelected] = useState<PrismId | typeof THEME_ID | null>(null);
    const themeOpen = hasTheme && (selected === THEME_ID || installed.length === 0);
    const current = themeOpen ? undefined : (installed.find(({ extension }) => extension.id === selected) ?? installed[0]);

    return (
        <PageContentBlock title={'Prism Properties'}>
            <div className={'ppx:flex ppx:flex-col ppx:gap-4'}>
                {failed && <Alert type={'danger'}>{httpErrorToHuman(failed.error)}</Alert>}
                {loading && installed.length === 0 ? (
                    <Spinner centered />
                ) : installed.length === 0 && !hasTheme ? (
                    <Alert type={'info'}>No Prism extensions are installed and enabled. Install PrismConsole, Prism File Browser, Prism Database Manager, Prism Branding, Prism Backups, Prism Schedules or Prism Themes to change their settings here.</Alert>
                ) : (
                    <>
                        {installed.length + (hasTheme ? 1 : 0) > 1 && (
                            <div className={'ppx:flex ppx:flex-wrap ppx:gap-1 ppx:self-start ppx:rounded-full ppx:border ppx:border-border ppx:bg-card ppx:p-1'}>
                                {installed.map(({ extension }) => (
                                    <button key={extension.id} type={'button'} className={pill(!themeOpen && current?.extension.id === extension.id)} onClick={() => setSelected(extension.id)}>
                                        <NamedIcon name={extension.icon} size={14} /> {extension.name}
                                    </button>
                                ))}
                                {hasTheme && (
                                    <button type={'button'} className={pill(themeOpen)} onClick={() => setSelected(THEME_ID)}>
                                        <NamedIcon name={'palette'} size={14} /> Prism Themes
                                    </button>
                                )}
                            </div>
                        )}
                        {themeOpen && <ThemeEditor />}
                        {current && <ExtensionSettings key={current.extension.id} extension={current.extension} schema={current.query.data!} />}
                    </>
                )}
            </div>
        </PageContentBlock>
    );
}

function ExtensionSettings({ extension, schema }: { extension: PrismExtension; schema: SettingField[] }) {
    const queryClient = useQueryClient();
    const tabs = useMemo(() => [...new Set(schema.map((field) => field.tab ?? 'General'))], [schema]);
    const [tab, setTab] = useState(tabs[0]);
    const [draft, setDraft] = useState<Record<string, unknown>>({});
    const [saving, setSaving] = useState(false);
    const dirty = Object.keys(draft).length > 0;
    const hints = HINTS[extension.id];

    // Leaving with unsaved changes asks first.
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);

        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const value = (field: SettingField) => (field.input in draft ? draft[field.input] : field.value);
    const change = (field: SettingField, next: unknown) =>
        setDraft((current) => {
            const copy = { ...current };
            if (JSON.stringify(next) === JSON.stringify(field.value)) delete copy[field.input];
            else copy[field.input] = next;

            return copy;
        });

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

    const fields = schema.filter((field) => (field.tab ?? 'General') === tab);
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

            <div className={'ppx:flex ppx:flex-wrap ppx:gap-1 ppx:self-start ppx:rounded-full ppx:border ppx:border-border ppx:bg-card ppx:p-1'}>
                {tabs.map((name) => (
                    <button key={name} type={'button'} className={pill(name === tab)} onClick={() => setTab(name)}>
                        {name}
                    </button>
                ))}
            </div>

            {extension.id === 'prism-branding' && <BrandingPreview schema={schema} draft={draft} tab={tab} />}

            {sections.map((section) => (
                <section key={section.title} className={'ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card'}>
                    <h3 className={'ppx:border-b ppx:border-border ppx:px-4 ppx:py-3 ppx:text-sm ppx:font-semibold'}>{section.title}</h3>
                    <div className={'ppx:flex ppx:flex-col ppx:divide-y ppx:divide-border'}>
                        {section.fields.map((field) => (
                            <div key={field.input} className={'ppx:px-4 ppx:py-3'}>
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

            {extension.id === 'prism-files' && tab === 'Paths' && (
                <Alert type={'info'}>Protected paths are enforced by Prism File Browser. Someone using the panel&apos;s file API directly, such as an API key or SFTP, is not stopped by them.</Alert>
            )}

            <div
                className={cn(
                    'ppx:sticky ppx:bottom-4 ppx:z-10 ppx:flex ppx:items-center ppx:gap-3 ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card ppx:p-3 ppx:shadow-lg ppx:transition-opacity',
                    dirty ? 'ppx:opacity-100' : 'ppx:pointer-events-none ppx:opacity-0'
                )}
            >
                <span className={'ppx:flex-1 ppx:text-sm'}>{Object.keys(draft).length === 1 ? 'One unsaved change.' : `${Object.keys(draft).length} unsaved changes.`}</span>
                <Button.Text onClick={() => setDraft({})} disabled={saving}>
                    Discard
                </Button.Text>
                <Button onClick={save} isLoading={saving}>
                    Save changes
                </Button>
            </div>
        </div>
    );
}

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
                <div className={'ppx:flex ppx:flex-wrap ppx:gap-1 ppx:rounded-lg ppx:bg-muted/40 ppx:p-1'}>
                    {field.options.map((option) => (
                        <button
                            key={String(option.value)}
                            type={'button'}
                            onClick={() => onChange(option.value)}
                            className={cn(
                                'ppx:rounded-md ppx:px-3 ppx:py-1.5 ppx:text-sm ppx:cursor-pointer',
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
