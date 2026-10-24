import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Dialog, Input, NamedIcon, Select, Spinner, cn, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { ToggleRow } from '../editors';
import { PreviewControls, reloadPreview, usePreviewDraft } from '../preview';
import SaveBar, { describeValue } from '../SaveBar';
import { THEME_ID, optionsOf, themeApi, themeKeys, type ThemeSetting } from './api';
import { CATPPUCCIN_ACCENTS, LOOKS, PALETTES, swatch, type Look } from './looks';

/** The editor's sections, as Prism Properties lists them: the looks, then each settings tab. */
export const themeSections = (list: ThemeSetting[]) => ['Looks', ...new Set(list.map((setting) => setting.tab ?? 'General').filter((name) => name !== 'Look'))];

/**
 * Prism Themes' live editor: the settings of one section, and the preview window of the real panel
 * that shows each change before it is saved.
 */
export default function ThemeEditor({ section, focus, onDirty }: { section: string; focus?: string | null; onDirty?: (dirty: boolean) => void }) {
    const queryClient = useQueryClient();
    const themes = useQuery({ queryKey: themeKeys.themes, queryFn: themeApi.themes });
    const settings = useQuery({ queryKey: themeKeys.settings, queryFn: themeApi.settings });
    const [draft, setDraft] = useState<Record<string, unknown>>({});
    const [saving, setSaving] = useState(false);
    const [activating, setActivating] = useState(false);
    const importer = useRef<HTMLInputElement>(null);

    const list = settings.data ?? [];
    const values = useMemo(() => Object.fromEntries(list.map((setting) => [setting.key, setting.key in draft ? draft[setting.key] : setting.value])), [list, draft]);
    const dirty = Object.keys(draft).length > 0;
    const info = themes.data?.themes.find((theme) => theme.id === THEME_ID);
    const live = themes.data?.active === THEME_ID;
    const previewing = themes.data?.preview === THEME_ID;

    usePreviewDraft(THEME_ID, values);
    useEffect(() => onDirty?.(dirty), [dirty, onDirty]);

    // Leaving with unsaved changes asks first.
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);

        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const change = (key: string, value: unknown) =>
        setDraft((current) => {
            const original = list.find((setting) => setting.key === key)?.value;
            const next = { ...current };
            if (JSON.stringify(original) === JSON.stringify(value)) delete next[key];
            else next[key] = value;

            return next;
        });

    const applyLook = (settings: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(settings)) if (list.some((setting) => setting.key === key)) change(key, value);
    };

    const save = async () => {
        setSaving(true);
        try {
            queryClient.setQueryData(themeKeys.settings, await themeApi.save(draft));
            setDraft({});
            toast.success(live ? 'Saved. Everyone sees it on their next page load.' : 'Saved.');
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setSaving(false);
        }
    };

    const refreshThemes = async () => {
        await queryClient.invalidateQueries({ queryKey: themeKeys.themes });
        reloadPreview();
    };

    const exportLook = () => {
        const blob = new Blob([JSON.stringify({ prismTheme: 1, settings: Object.fromEntries(list.filter((setting) => setting.type !== 'image').map((setting) => [setting.key, values[setting.key]])) }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `prism-look-${String(values.look ?? 'custom')}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    const importLook = async (file: File) => {
        try {
            const parsed = JSON.parse(await file.text()) as { settings?: Record<string, unknown> };
            if (!parsed.settings || typeof parsed.settings !== 'object') throw new Error('This is not a Prism Themes export.');
            applyLook(parsed.settings);
            toast.success('Imported. Check the preview, then save.');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'The file could not be read.');
        }
    };

    if (themes.isLoading || settings.isLoading) return <Spinner centered />;
    if (themes.isError || settings.isError) return <Alert type={'danger'}>{httpErrorToHuman(themes.error ?? settings.error)}</Alert>;

    const shown = list.filter((setting) => (setting.tab ?? 'General') === section);

    return (
        <div className={'ppx:flex ppx:flex-col ppx:gap-4'}>
            <div className={'ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-3 ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card ppx:p-4'}>
                <div className={'ppx:flex ppx:size-11 ppx:shrink-0 ppx:items-center ppx:justify-center ppx:rounded-lg ppx:bg-primary/15 ppx:text-primary'}>
                    <NamedIcon name={'palette'} size={22} />
                </div>
                <div className={'ppx:min-w-56 ppx:flex-1'}>
                    <h2 className={'ppx:text-lg ppx:font-semibold'}>Prism Themes</h2>
                    <p className={'ppx:text-sm ppx:text-muted-foreground'}>
                        The look: colours, Catppuccin, fonts, glass and backgrounds. {live ? 'Active for everyone.' : previewing ? 'Not active. You are previewing it; only you see it.' : 'Not active. Preview it for yourself, or activate it for everyone.'}
                        {info?.problem && ` ${info.problem}`}
                    </p>
                </div>
                {!live && (
                    <Button
                        isSecondary
                        onClick={async () => {
                            try {
                                await (previewing ? themeApi.stopPreview() : themeApi.preview());
                                await refreshThemes();
                                if (!previewing) toast.success('Previewing. Only you see Prism Themes until you stop.');
                            } catch (error) {
                                toast.error(httpErrorToHuman(error));
                            }
                        }}
                    >
                        <NamedIcon name={previewing ? 'eye-off' : 'eye'} size={14} /> {previewing ? 'Stop previewing' : 'Preview for me'}
                    </Button>
                )}
                {!live && (
                    <Button disabled={!!info?.problem} onClick={() => setActivating(true)}>
                        Activate for everyone
                    </Button>
                )}
            </div>

            <div className={'ppx:grid ppx:gap-4 ppx:2xl:grid-cols-[minmax(0,1fr)_22rem]'}>
                <div className={'ppx:flex ppx:min-w-0 ppx:flex-col ppx:gap-3'}>
                    <section className={'ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card'}>
                        <h3 className={'ppx:border-b ppx:border-border ppx:px-4 ppx:py-3 ppx:text-sm ppx:font-semibold'}>{section}</h3>
                        <div className={'ppx:flex ppx:flex-col ppx:gap-3 ppx:p-4'}>
                            {section === 'Looks' ? (
                                <div className={'ppx:grid ppx:grid-cols-2 ppx:gap-2 ppx:md:grid-cols-3 ppx:xl:grid-cols-4'}>
                                    {LOOKS.map((look) => (
                                        <button
                                            key={look.id}
                                            type={'button'}
                                            onClick={() => applyLook(look.settings)}
                                            className={cn('ppx:flex ppx:cursor-pointer ppx:flex-col ppx:overflow-hidden ppx:rounded-lg ppx:border ppx:text-left ppx:transition-colors', values.look === look.settings.look && (!look.settings.catppuccin || values.catppuccin_flavor === look.settings.catppuccin_flavor) && values.catppuccin === look.settings.catppuccin ? 'ppx:border-primary ppx:ring-1 ppx:ring-primary' : 'ppx:border-border ppx:hover:border-primary')}
                                        >
                                            <LookSwatch look={look.settings} colours={look.swatch} />
                                            <span className={'ppx:px-2.5 ppx:pt-2 ppx:text-sm ppx:font-medium'}>{look.name}</span>
                                            <span className={'ppx:px-2.5 ppx:pb-2 ppx:text-xs ppx:text-muted-foreground'}>{look.description}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : shown.length === 0 ? (
                                <p className={'ppx:text-sm ppx:text-muted-foreground'}>Nothing to set here.</p>
                            ) : (
                                shown.map((setting) => (
                                    <div key={setting.key} id={`ppx-setting-${THEME_ID}-${setting.key}`} className={cn('ppx:scroll-mt-24 ppx:rounded-md ppx:border-b ppx:border-border ppx:pb-3 ppx:last:border-b-0', focus === setting.key && 'ppx:ring-2 ppx:ring-primary ppx:ring-offset-4 ppx:ring-offset-card')}>
                                        <Field setting={setting} value={values[setting.key]} onChange={(value) => change(setting.key, value)} onSchema={(fresh) => queryClient.setQueryData(themeKeys.settings, fresh)} />
                                    </div>
                                ))
                            )}
                        </div>
                    </section>

                    <SaveBar
                        always
                        changes={list
                            .filter((setting) => setting.key in draft)
                            .map((setting) => ({ key: setting.key, label: setting.label, section: setting.tab ?? 'General', from: describeValue(setting.value, optionsOf(setting)), to: describeValue(draft[setting.key], optionsOf(setting)) }))}
                        saving={saving}
                        onSave={save}
                        onDiscard={() => setDraft({})}
                        onUndo={(key) =>
                            setDraft((current) => {
                                const { [key]: _undone, ...rest } = current;

                                return rest;
                            })
                        }
                        extra={
                            <>
                                <input ref={importer} type={'file'} accept={'.json,application/json'} className={'ppx:hidden'} onChange={(event) => event.target.files?.[0] && void importLook(event.target.files[0])} />
                                <Button.Text size={'small'} onClick={() => importer.current?.click()}>
                                    <NamedIcon name={'upload'} size={14} /> Import
                                </Button.Text>
                                <Button.Text size={'small'} onClick={exportLook}>
                                    <NamedIcon name={'download'} size={14} /> Export
                                </Button.Text>
                            </>
                        }
                    />
                </div>

                <div className={'ppx:flex ppx:min-w-0 ppx:flex-col ppx:gap-3'}>
                    <PreviewControls>{!live && !previewing && <Alert type={'info'}>The window shows the active theme until you choose Preview for me. Only you see a preview.</Alert>}</PreviewControls>
                    <div className={'ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card ppx:p-4'}>
                        <p className={'ppx:mb-2 ppx:text-sm ppx:font-semibold'}>Now set</p>
                        <dl className={'ppx:grid ppx:grid-cols-2 ppx:gap-x-4 ppx:gap-y-1 ppx:text-sm'}>
                            {(['look', 'palette', 'background', 'font', 'motion'] as const).map((key) => {
                                const setting = list.find((item) => item.key === key);
                                const label = setting ? (optionsOf(setting).find((option) => option.value === values[key])?.label ?? String(values[key])) : '';

                                return (
                                    <div key={key} className={'ppx:contents'}>
                                        <dt className={'ppx:text-muted-foreground'}>{setting?.label}</dt>
                                        <dd className={'ppx:flex ppx:items-center ppx:gap-2'}>
                                            {key === 'palette' && <span className={'ppx:size-3 ppx:rounded-full'} style={{ background: swatch(String(values.palette)) }} />}
                                            {label}
                                        </dd>
                                    </div>
                                );
                            })}
                        </dl>
                    </div>
                </div>
            </div>

            {activating && (
                <Dialog.Confirm
                    open
                    title={'Activate Prism Themes for everyone?'}
                    confirm={'Activate'}
                    onClose={() => setActivating(false)}
                    onConfirmed={async () => {
                        try {
                            if (dirty) await save();
                            await themeApi.activate(THEME_ID);
                            await refreshThemes();
                            toast.success('Prism Themes is active.');
                        } catch (error) {
                            toast.error(httpErrorToHuman(error));
                        } finally {
                            setActivating(false);
                        }
                    }}
                >
                    Every visitor sees it on their next page load. You can go back to the panel&apos;s own look under Admin, Themes, by activating Classic.
                </Dialog.Confirm>
            )}
        </div>
    );
}

/** A small picture of a look: its background, surfaces, colour and corners. */
function LookSwatch({ look, colours }: { look: Record<string, unknown>; colours?: Look['swatch'] }) {
    const colour = colours?.accent ?? swatch(String(look.palette));
    const card = colours ? colours.surface : look.look === 'mono' || look.look === 'contrast' || look.look === 'terminal' ? 'none' : '#ffffff18';
    const radius = Math.min(6, Number(look.radius ?? 8) / 3);
    const backdrop =
        colours?.base ??
        (look.background === 'mesh'
            ? 'radial-gradient(circle at 20% 20%, #8b5cf6aa, transparent 60%), radial-gradient(circle at 80% 80%, #ec4899aa, transparent 60%), #141821'
            : look.background === 'aurora' || look.background === 'gradient'
              ? `radial-gradient(circle at 0% 0%, color-mix(in oklab, ${colour} 35%, transparent), transparent 60%), ${look.palette === 'stone' ? '#f4efe6' : '#141821'}`
              : look.palette === 'stone'
                ? '#f4efe6'
                : '#141821');

    return (
        <svg viewBox={'0 0 100 56'} className={'ppx:h-16 ppx:w-full'} aria-hidden style={{ background: backdrop }}>
            <rect x={0} y={0} width={18} height={56} fill={'#ffffff10'} />
            {[0, 1, 2].map((index) => (
                <rect key={index} x={24 + index * 25} y={8} width={21} height={22} rx={radius} fill={card} stroke={card === 'none' || look.look === 'neon' ? colour : 'none'} />
            ))}
            <rect x={24} y={8} width={14} height={4} rx={1} fill={colour} />
            <rect x={24} y={36} width={46} height={12} rx={radius} fill={card === 'none' ? '#ffffff10' : card} />
            {look.background === 'stars' && [12, 40, 66, 88].map((x, index) => <circle key={x} cx={x} cy={index % 2 ? 48 : 50} r={0.8} fill={'#fff'} opacity={0.7} />)}
            {look.background === 'waves' && <path d={'M0 50 Q25 42 50 50 T100 50 V56 H0 Z'} fill={colour} opacity={0.3} />}
            {look.glass === true && <circle cx={80} cy={45} r={14} fill={colour} opacity={0.25} />}
        </svg>
    );
}

function Field({ setting, value, onChange, onSchema }: { setting: ThemeSetting; value: unknown; onChange: (value: unknown) => void; onSchema: (schema: ThemeSetting[]) => void }) {
    const upload = useRef<HTMLInputElement>(null);
    const label = (
        <div className={'ppx:mb-1.5'}>
            <p className={'ppx:text-sm ppx:font-medium'}>{setting.label}</p>
            {setting.help && <p className={'ppx:text-xs ppx:text-muted-foreground'}>{setting.help}</p>}
        </div>
    );

    switch (setting.type) {
        case 'toggle':
            return <ToggleRow label={setting.label} help={setting.help} checked={value === true} onChange={onChange} />;
        case 'color':
            return (
                <>
                    {label}
                    <input type={'color'} value={typeof value === 'string' ? value : '#000000'} onChange={(event) => onChange(event.target.value)} aria-label={setting.label} />
                </>
            );
        case 'number': {
            const number = Number(value ?? setting.min ?? 0);

            return (
                <>
                    <div className={'ppx:flex ppx:items-start ppx:justify-between ppx:gap-2'}>
                        {label}
                        <span className={'ppx:font-mono ppx:text-sm ppx:tabular-nums'}>
                            {number}
                            {setting.unit}
                        </span>
                    </div>
                    <input type={'range'} min={setting.min ?? 0} max={setting.max ?? 100} step={setting.step ?? 1} value={number} onChange={(event) => onChange(Number(event.target.value))} className={'ppx:w-full ppx:cursor-pointer'} style={{ accentColor: 'var(--primary)' }} aria-label={setting.label} />
                </>
            );
        }
        case 'select': {
            const options = optionsOf(setting);
            if (setting.key === 'catppuccin_accent') {
                return (
                    <>
                        {label}
                        <div className={'ppx:grid ppx:grid-cols-7 ppx:gap-1.5'}>
                            {options.map((option) => (
                                <button key={option.value} type={'button'} title={option.label} onClick={() => onChange(option.value)} className={cn('ppx:h-8 ppx:cursor-pointer ppx:rounded-md ppx:border-2', value === option.value ? 'ppx:border-foreground' : 'ppx:border-transparent')} style={{ background: CATPPUCCIN_ACCENTS[option.value] }}>
                                    <span className={'ppx:sr-only'}>{option.label}</span>
                                </button>
                            ))}
                        </div>
                        <p className={'ppx:mt-1 ppx:text-xs ppx:text-muted-foreground'}>{options.find((option) => option.value === value)?.label}</p>
                    </>
                );
            }
            if (setting.key === 'switches') {
                return (
                    <>
                        {label}
                        <div className={'ppx:grid ppx:grid-cols-2 ppx:gap-2'}>
                            {options.map((option) => {
                                const round = option.value === 'rounded';

                                return (
                                    <button key={option.value} type={'button'} onClick={() => onChange(option.value)} className={cn('ppx:flex ppx:cursor-pointer ppx:flex-col ppx:items-center ppx:gap-2 ppx:rounded-lg ppx:border ppx:p-3', value === option.value ? 'ppx:border-primary ppx:ring-1 ppx:ring-primary' : 'ppx:border-border ppx:hover:border-primary')}>
                                        <span className={cn('ppx:flex ppx:gap-0.5 ppx:border ppx:border-border ppx:bg-muted/40 ppx:p-0.5 ppx:text-xs', round ? 'ppx:rounded-full' : 'ppx:rounded-md')}>
                                            <span className={cn('ppx:bg-primary ppx:px-2 ppx:py-0.5 ppx:text-primary-foreground', round ? 'ppx:rounded-full' : 'ppx:rounded')}>Files</span>
                                            <span className={'ppx:px-2 ppx:py-0.5 ppx:text-muted-foreground'}>Editor</span>
                                        </span>
                                        <span className={'ppx:text-sm'}>{option.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </>
                );
            }
            if (setting.key === 'palette') {
                return (
                    <>
                        {label}
                        <div className={'ppx:grid ppx:grid-cols-6 ppx:gap-1.5'}>
                            {options.map((option) => (
                                <button key={option.value} type={'button'} title={option.label} onClick={() => onChange(option.value)} className={cn('ppx:flex ppx:h-9 ppx:cursor-pointer ppx:items-center ppx:justify-center ppx:rounded-md ppx:border-2', value === option.value ? 'ppx:border-foreground' : 'ppx:border-transparent')} style={{ background: option.value === 'custom' ? 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' : swatch(option.value) }}>
                                    <span className={'ppx:sr-only'}>{option.label}</span>
                                </button>
                            ))}
                        </div>
                        <p className={'ppx:mt-1 ppx:text-xs ppx:text-muted-foreground'}>{PALETTES[String(value)]?.[0] ?? 'Custom'}</p>
                    </>
                );
            }

            return (
                <>
                    {label}
                    {options.length <= 4 ? (
                        <div className={'prism-switch ppx:flex ppx:flex-wrap ppx:gap-1 ppx:rounded-lg ppx:bg-muted/40 ppx:p-1'}>
                            {options.map((option) => (
                                <button key={option.value} type={'button'} onClick={() => onChange(option.value)} className={cn('prism-switch-item ppx:rounded-md ppx:px-3 ppx:py-1.5 ppx:text-sm ppx:cursor-pointer', option.value === value ? 'ppx:bg-card ppx:font-semibold ppx:shadow-sm' : 'ppx:text-muted-foreground ppx:hover:text-foreground')}>
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <Select value={String(value ?? '')} onChange={(next) => onChange(next)} options={options} />
                    )}
                </>
            );
        }
        case 'image': {
            const current = typeof value === 'string' && value !== '' ? value : null;
            const send = async (file: File | null) => {
                try {
                    onSchema(await themeApi.image(setting.key, file));
                    toast.success(file ? 'Picture uploaded.' : 'Picture removed.');
                } catch (error) {
                    toast.error(httpErrorToHuman(error));
                }
            };

            return (
                <>
                    {label}
                    <div className={'ppx:flex ppx:items-center ppx:gap-2'}>
                        <div className={'ppx:flex ppx:h-12 ppx:w-20 ppx:items-center ppx:justify-center ppx:overflow-hidden ppx:rounded ppx:border ppx:border-dashed ppx:border-border'}>{current ? <img src={current} alt={''} className={'ppx:h-full ppx:w-full ppx:object-cover'} /> : <NamedIcon name={'image'} size={18} className={'ppx:text-muted-foreground'} />}</div>
                        <input ref={upload} type={'file'} accept={'image/*'} className={'ppx:hidden'} onChange={(event) => event.target.files?.[0] && void send(event.target.files[0])} />
                        <Button isSecondary size={'small'} onClick={() => upload.current?.click()}>
                            {current ? 'Replace' : 'Upload'}
                        </Button>
                        {current && (
                            <Button.Text size={'small'} onClick={() => void send(null)}>
                                Remove
                            </Button.Text>
                        )}
                    </div>
                </>
            );
        }
        default:
            return (
                <>
                    {label}
                    <Input value={typeof value === 'string' ? value : ''} maxLength={setting.max_length ?? undefined} onChange={(event) => onChange(event.target.value)} />
                </>
            );
    }
}
