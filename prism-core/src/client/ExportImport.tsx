import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import ExtensionMark from './ExtensionMark';
import { NamedIcon } from './icons';
import { refresh, saveSettings, settingsKey, type PrismExtension, type PrismId, type SettingField } from './api';
import { describeValue } from './SaveBar';
import { THEME_ID, optionsOf, themeApi, themeKeys, type ThemeSetting } from './themes/api';

/** What a Prism export file holds: each section's saved settings, pictures left out. */
interface ExportFile {
    prismExport: 1;
    exportedAt: string;
    panel?: string;
    sections: Record<string, { name: string; settings: Record<string, unknown> }>;
}

interface Source {
    id: string;
    name: string;
    icon: string;
    /** The settings that can be exported: everything but uploaded files. */
    fields: { key: string; label: string; value: unknown; options?: readonly { value: unknown; label: string }[] }[];
}

const box = 'pt-surface ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card';

function sourcesOf(installed: { extension: PrismExtension; schema: SettingField[] }[], theme: ThemeSetting[] | undefined): Source[] {
    const list: Source[] = installed.map(({ extension, schema }) => ({
        id: extension.id,
        name: extension.name,
        icon: extension.icon,
        fields: schema.filter((field) => field.field !== 'file').map((field) => ({ key: field.input, label: field.label, value: field.value, options: field.options })),
    }));
    if (theme) list.push({ id: THEME_ID, name: 'Prism Themes', icon: 'palette', fields: theme.filter((setting) => setting.type !== 'image').map((setting) => ({ key: setting.key, label: setting.label, value: setting.value, options: optionsOf(setting) })) });

    return list.filter((source) => source.fields.length > 0);
}

function Checkbox({ checked, disabled, onChange, children }: { checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
    return (
        <label className={'ppx:flex ppx:min-w-0 ppx:flex-1 ppx:cursor-pointer ppx:items-center ppx:gap-3 ppx:has-[:disabled]:cursor-not-allowed ppx:has-[:disabled]:opacity-50'}>
            <input type={'checkbox'} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className={'ppx:size-4 ppx:accent-[var(--primary)]'} />
            {children}
        </label>
    );
}

/** Prism Export: every Prism extension's settings, and Prism Themes', to a file and back. */
export default function ExportImport({ section, installed, theme }: { section: string; installed: { extension: PrismExtension; schema: SettingField[] }[]; theme: ThemeSetting[] | undefined }) {
    const sources = useMemo(() => sourcesOf(installed, theme), [installed, theme]);

    return (
        <div className={'ppx:flex ppx:flex-col ppx:gap-4'}>
            <div className={`${box} ppx:flex ppx:items-center ppx:gap-4 ppx:p-4`}>
                <ExtensionMark id={'prism-export'} icon={'package'} />
                <div className={'ppx:min-w-0'}>
                    <h2 className={'ppx:text-lg ppx:font-semibold'}>Prism Export</h2>
                    <p className={'ppx:text-sm ppx:text-muted-foreground'}>Save the settings of your Prism extensions to a file, and load them here or on another panel. Uploaded pictures are not included.</p>
                </div>
            </div>
            {section === 'Import' ? <Import sources={sources} /> : <Export sources={sources} />}
        </div>
    );
}

function Export({ sources }: { sources: Source[] }) {
    const [picked, setPicked] = useState<Set<string>>(() => new Set(sources.map((source) => source.id)));
    const chosen = sources.filter((source) => picked.has(source.id));

    const download = () => {
        const file: ExportFile = {
            prismExport: 1,
            exportedAt: new Date().toISOString(),
            panel: window.location.host,
            sections: Object.fromEntries(chosen.map((source) => [source.id, { name: source.name, settings: Object.fromEntries(source.fields.map((field) => [field.key, field.value])) }])),
        };
        const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `prism-settings-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast.success(`Exported ${chosen.length} ${chosen.length === 1 ? 'section' : 'sections'}.`);
    };

    return (
        <section className={box}>
            <div className={'ppx:flex ppx:items-center ppx:gap-3 ppx:border-b ppx:border-border ppx:px-4 ppx:py-3'}>
                <h3 className={'ppx:flex-1 ppx:text-sm ppx:font-semibold'}>What to export</h3>
                <Button.Text size={'small'} onClick={() => setPicked(new Set(sources.map((source) => source.id)))}>
                    Select all
                </Button.Text>
                <Button.Text size={'small'} onClick={() => setPicked(new Set())}>
                    Select none
                </Button.Text>
            </div>
            <ul className={'ppx:flex ppx:flex-col ppx:divide-y ppx:divide-border'}>
                {sources.map((source) => (
                    <li key={source.id} className={'ppx:flex ppx:items-center ppx:gap-3 ppx:px-4 ppx:py-2.5'}>
                        <Checkbox checked={picked.has(source.id)} onChange={(checked) => setPicked((current) => (checked ? new Set([...current, source.id]) : new Set([...current].filter((id) => id !== source.id))))}>
                            <NamedIcon name={source.icon} size={16} className={'ppx:text-muted-foreground'} />
                            <span className={'ppx:text-sm'}>{source.name}</span>
                        </Checkbox>
                        <span className={'ppx:text-xs ppx:text-muted-foreground'}>{source.fields.length} settings</span>
                    </li>
                ))}
            </ul>
            <div className={'ppx:flex ppx:items-center ppx:gap-3 ppx:border-t ppx:border-border ppx:px-4 ppx:py-3'}>
                <span className={'ppx:flex-1 ppx:text-xs ppx:text-muted-foreground'}>The saved settings are exported; unsaved changes are not.</span>
                <Button disabled={chosen.length === 0} onClick={download}>
                    <NamedIcon name={'download'} size={14} /> Download
                </Button>
            </div>
        </section>
    );
}

interface Planned {
    id: string;
    name: string;
    icon: string;
    installed: boolean;
    changes: { key: string; label: string; from: string; to: string; value: unknown }[];
    unknown: number;
}

function Import({ sources }: { sources: Source[] }) {
    const queryClient = useQueryClient();
    const input = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<{ name: string; data: ExportFile } | null>(null);
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [open, setOpen] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<string[] | null>(null);

    // What each section in the file would change here, compared with the saved settings.
    const plan: Planned[] = useMemo(() => {
        if (!file) return [];

        return Object.entries(file.data.sections).map(([id, section]) => {
            const source = sources.find((item) => item.id === id);
            const settings = section.settings ?? {};
            const changes = source
                ? source.fields
                      .filter((field) => field.key in settings && JSON.stringify(settings[field.key]) !== JSON.stringify(field.value))
                      .map((field) => ({ key: field.key, label: field.label, from: describeValue(field.value, field.options), to: describeValue(settings[field.key], field.options), value: settings[field.key] }))
                : [];

            return { id, name: source?.name ?? section.name ?? id, icon: source?.icon ?? 'package', installed: !!source, changes, unknown: source ? Object.keys(settings).filter((key) => !source.fields.some((field) => field.key === key)).length : 0 };
        });
    }, [file, sources]);

    const read = async (picked: File) => {
        setResult(null);
        try {
            const data = JSON.parse(await picked.text()) as ExportFile;
            if (data?.prismExport !== 1 || typeof data.sections !== 'object' || data.sections === null) throw new Error('This is not a Prism export file.');
            setFile({ name: picked.name, data });
            setPicked(new Set(Object.keys(data.sections).filter((id) => sources.some((source) => source.id === id))));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'The file could not be read.');
        } finally {
            if (input.current) input.current.value = '';
        }
    };

    const apply = async () => {
        setBusy(true);
        const done: string[] = [];
        try {
            for (const section of plan.filter((item) => picked.has(item.id) && item.installed)) {
                if (section.changes.length === 0) {
                    done.push(`${section.name}: already the same.`);
                    continue;
                }
                const values = Object.fromEntries(section.changes.map((change) => [change.key, change.value]));
                if (section.id === THEME_ID) {
                    queryClient.setQueryData(themeKeys.settings, await themeApi.save(values));
                } else {
                    queryClient.setQueryData(settingsKey(section.id as PrismId), await saveSettings(section.id as PrismId, values));
                    await refresh(section.id as PrismId);
                }
                done.push(`${section.name}: ${section.changes.length} ${section.changes.length === 1 ? 'setting' : 'settings'} changed.`);
            }
            toast.success('Imported.');
        } catch (error) {
            done.push(`Stopped: ${httpErrorToHuman(error)}`);
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
            setResult(done);
        }
    };

    const chosen = plan.filter((item) => picked.has(item.id) && item.installed);
    const total = chosen.reduce((sum, item) => sum + item.changes.length, 0);

    return (
        <section className={box}>
            <div className={'ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-3 ppx:border-b ppx:border-border ppx:px-4 ppx:py-3'}>
                <h3 className={'ppx:flex-1 ppx:text-sm ppx:font-semibold'}>{file ? `From ${file.name}` : 'Import a file'}</h3>
                <input ref={input} type={'file'} accept={'.json,application/json'} className={'ppx:hidden'} onChange={(event) => event.target.files?.[0] && void read(event.target.files[0])} />
                <Button isSecondary size={'small'} onClick={() => input.current?.click()}>
                    <NamedIcon name={'upload'} size={14} /> {file ? 'Choose another file' : 'Choose a file'}
                </Button>
            </div>
            {!file ? (
                <p className={'ppx:px-4 ppx:py-6 ppx:text-sm ppx:text-muted-foreground'}>Choose a file made with Export. You pick what to import before anything changes.</p>
            ) : (
                <>
                    <p className={'ppx:px-4 ppx:pt-3 ppx:text-xs ppx:text-muted-foreground'}>
                        Exported {new Date(file.data.exportedAt).toLocaleString()}
                        {file.data.panel && ` from ${file.data.panel}`}.
                    </p>
                    <ul className={'ppx:flex ppx:flex-col ppx:divide-y ppx:divide-border'}>
                        {plan.map((section) => (
                            <li key={section.id} className={'ppx:flex ppx:flex-col ppx:gap-2 ppx:px-4 ppx:py-2.5'}>
                                <div className={'ppx:flex ppx:items-center ppx:gap-3'}>
                                    <Checkbox checked={picked.has(section.id)} disabled={!section.installed} onChange={(checked) => setPicked((current) => (checked ? new Set([...current, section.id]) : new Set([...current].filter((id) => id !== section.id))))}>
                                        <NamedIcon name={section.icon} size={16} className={'ppx:text-muted-foreground'} />
                                        <span className={'ppx:text-sm'}>{section.name}</span>
                                    </Checkbox>
                                    <span className={'ppx:text-xs ppx:text-muted-foreground'}>
                                        {!section.installed ? 'Not installed here' : section.changes.length === 0 ? 'Same as now' : `${section.changes.length} ${section.changes.length === 1 ? 'change' : 'changes'}`}
                                        {section.unknown > 0 && ` · ${section.unknown} unknown skipped`}
                                    </span>
                                    {section.changes.length > 0 && (
                                        <Button.Text size={'small'} onClick={() => setOpen(open === section.id ? null : section.id)}>
                                            {open === section.id ? 'Hide' : 'Details'}
                                        </Button.Text>
                                    )}
                                </div>
                                {open === section.id && (
                                    <ul className={'ppx:ml-7 ppx:flex ppx:flex-col ppx:gap-1 ppx:rounded-md ppx:bg-muted/40 ppx:p-3 ppx:text-xs'}>
                                        {section.changes.map((change) => (
                                            <li key={change.key}>
                                                <span className={'ppx:font-medium'}>{change.label}</span>: <span className={'ppx:text-muted-foreground ppx:line-through'}>{change.from}</span> → {change.to}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        ))}
                    </ul>
                    {result && (
                        <div className={'ppx:px-4 ppx:pb-3'}>
                            <Alert type={'info'}>
                                {result.map((line) => (
                                    <p key={line}>{line}</p>
                                ))}
                            </Alert>
                        </div>
                    )}
                    <div className={'ppx:flex ppx:items-center ppx:gap-3 ppx:border-t ppx:border-border ppx:px-4 ppx:py-3'}>
                        <span className={'ppx:flex-1 ppx:text-xs ppx:text-muted-foreground'}>
                            {chosen.length === 0 ? 'Nothing chosen.' : `${total} ${total === 1 ? 'setting' : 'settings'} in ${chosen.length} ${chosen.length === 1 ? 'section' : 'sections'} will change.`}
                        </span>
                        <Button isLoading={busy} disabled={total === 0} onClick={apply}>
                            Import
                        </Button>
                    </div>
                </>
            )}
        </section>
    );
}
