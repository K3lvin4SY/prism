import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Dialog, Input, NamedIcon, Select, Spinner, cn, http, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { ToggleRow } from '../editors';
import { THEME_ID, optionsOf, themeApi, themeKeys, type ThemeSetting } from './api';
import { CATPPUCCIN_ACCENTS, LOOKS, PALETTES, swatch, type Look } from './looks';

const PREVIEW = 'prism-themes:preview';
const READY = 'prism-themes:ready';
const WINDOW = 'prism-themes-preview';

type Device = 'desktop' | 'tablet' | 'phone';
const SIZES: Record<Device, [number, number]> = { desktop: [1366, 860], tablet: [820, 1180], phone: [390, 844] };
type Page = 'dashboard' | 'server' | 'admin' | 'account';

const pill = (active: boolean) =>
    cn('ppx:inline-flex ppx:items-center ppx:gap-1.5 ppx:rounded-full ppx:px-3 ppx:py-1 ppx:text-xs ppx:font-medium ppx:cursor-pointer', active ? 'ppx:bg-primary ppx:text-primary-foreground' : 'ppx:text-muted-foreground ppx:hover:bg-muted ppx:hover:text-foreground');

/**
 * Prism Themes' live editor: the settings, and a preview window of the real panel that shows each
 * change before it is saved. The panel refuses to be shown in a frame, so the preview is a window.
 */
export default function ThemeEditor() {
    const queryClient = useQueryClient();
    const themes = useQuery({ queryKey: themeKeys.themes, queryFn: themeApi.themes });
    const settings = useQuery({ queryKey: themeKeys.settings, queryFn: themeApi.settings });
    const firstServer = useQuery({ queryKey: ['prism-extensions', 'first-server'], queryFn: async () => (await http.get<{ data: { attributes: { identifier: string } }[] }>('/api/client', { params: { per_page: 1 } })).data.data[0]?.attributes.identifier ?? null });
    const [draft, setDraft] = useState<Record<string, unknown>>({});
    const [tab, setTab] = useState('Looks');
    const [search, setSearch] = useState('');
    const [device, setDevice] = useState<Device>('desktop');
    const [turned, setTurned] = useState(false);
    const [page, setPage] = useState<Page>('dashboard');
    const [saving, setSaving] = useState(false);
    const [activating, setActivating] = useState(false);
    const preview = useRef<Window | null>(null);
    const [open, setOpen] = useState(false);
    const importer = useRef<HTMLInputElement>(null);

    const list = settings.data ?? [];
    const values = useMemo(() => Object.fromEntries(list.map((setting) => [setting.key, setting.key in draft ? draft[setting.key] : setting.value])), [list, draft]);
    const dirty = Object.keys(draft).length > 0;
    const info = themes.data?.themes.find((theme) => theme.id === THEME_ID);
    const live = themes.data?.active === THEME_ID;
    const previewing = themes.data?.preview === THEME_ID;
    const tabs = ['Looks', ...new Set(list.map((setting) => setting.tab ?? 'General').filter((name) => name !== 'Look'))];

    // The frame gets every value whenever one changes, and again when it says it is ready.
    const send = () => {
        const target = preview.current;
        if (target && !target.closed) target.postMessage({ type: PREVIEW, settings: values }, window.location.origin);
    };
    useEffect(send, [values]);
    useEffect(() => {
        const listener = (event: MessageEvent) => {
            if (event.origin === window.location.origin && event.source === preview.current && (event.data as { type?: string })?.type === READY) send();
        };
        window.addEventListener('message', listener);

        return () => window.removeEventListener('message', listener);
    });

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

    // Notices the preview window being closed.
    useEffect(() => {
        if (!open) return;
        const timer = window.setInterval(() => preview.current?.closed && setOpen(false), 1000);

        return () => window.clearInterval(timer);
    }, [open]);

    const show = (next: { page?: Page; device?: Device; turned?: boolean } = {}) => {
        const where = next.page ?? page;
        const size = SIZES[next.device ?? device];
        const [w, h] = (next.turned ?? turned) ? [size[1], size[0]] : size;
        const url = where === 'dashboard' ? '/' : where === 'admin' ? '/panel' : where === 'account' ? '/account' : firstServer.data ? `/server/${firstServer.data}` : '/';
        const target = preview.current && !preview.current.closed ? preview.current : null;
        if (target && !next.device && next.turned === undefined) {
            target.location.href = url;
            target.focus();
        } else {
            target?.close();
            preview.current = window.open(url, WINDOW, `popup=yes,width=${Math.min(w, window.screen.availWidth)},height=${Math.min(h, window.screen.availHeight)}`);
        }
        setOpen(!!preview.current);
    };

    useEffect(() => () => preview.current?.close(), []);

    const refreshThemes = async () => {
        await queryClient.invalidateQueries({ queryKey: themeKeys.themes });
        if (preview.current && !preview.current.closed) preview.current.location.reload();
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

    const query = search.trim().toLowerCase();
    const shown = query ? list.filter((setting) => `${setting.label} ${setting.help ?? ''} ${setting.tab ?? ''}`.toLowerCase().includes(query)) : list.filter((setting) => (setting.tab ?? 'General') === tab);

    return (
        <div className={'ppx:flex ppx:flex-col ppx:gap-4'}>
            <div className={'ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-3 ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card ppx:p-4'}>
                <div className={'ppx:flex ppx:size-11 ppx:shrink-0 ppx:items-center ppx:justify-center ppx:rounded-lg ppx:bg-primary/15 ppx:text-primary'}>
                    <NamedIcon name={'palette'} size={22} />
                </div>
                <div className={'ppx:min-w-56 ppx:flex-1'}>
                    <h2 className={'ppx:text-lg ppx:font-semibold'}>Prism Themes</h2>
                    <p className={'ppx:text-sm ppx:text-muted-foreground'}>
                        {live ? 'Active for everyone.' : previewing ? 'Not active. You are previewing it; only you see it.' : 'Not active. Preview it for yourself, or activate it for everyone.'}
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

            <div className={'ppx:grid ppx:gap-4 ppx:xl:grid-cols-[26rem_minmax(0,1fr)]'}>
                <div className={'ppx:flex ppx:min-w-0 ppx:flex-col ppx:gap-3'}>
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${list.length} settings`} />
                    {!query && (
                        <div className={'ppx:flex ppx:flex-wrap ppx:gap-1 ppx:rounded-xl ppx:border ppx:border-border ppx:bg-card ppx:p-1'}>
                            {tabs.map((name) => (
                                <button key={name} type={'button'} className={pill(name === tab)} onClick={() => setTab(name)}>
                                    {name}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className={'ppx:flex ppx:max-h-[70vh] ppx:flex-col ppx:gap-3 ppx:overflow-y-auto ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card ppx:p-4'}>
                        {!query && tab === 'Looks' ? (
                            <div className={'ppx:grid ppx:grid-cols-2 ppx:gap-2'}>
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
                            <p className={'ppx:text-sm ppx:text-muted-foreground'}>No setting matches.</p>
                        ) : (
                            shown.map((setting) => (
                                <div key={setting.key} className={'ppx:border-b ppx:border-border ppx:pb-3 ppx:last:border-b-0'}>
                                    <Field setting={setting} value={values[setting.key]} onChange={(value) => change(setting.key, value)} onSchema={(fresh) => queryClient.setQueryData(themeKeys.settings, fresh)} />
                                </div>
                            ))
                        )}
                    </div>

                    <div className={'ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-2'}>
                        <input ref={importer} type={'file'} accept={'.json,application/json'} className={'ppx:hidden'} onChange={(event) => event.target.files?.[0] && void importLook(event.target.files[0])} />
                        <Button.Text size={'small'} onClick={() => importer.current?.click()}>
                            <NamedIcon name={'upload'} size={14} /> Import
                        </Button.Text>
                        <Button.Text size={'small'} onClick={exportLook}>
                            <NamedIcon name={'download'} size={14} /> Export
                        </Button.Text>
                        <span className={'ppx:flex-1'} />
                        <Button.Text disabled={!dirty || saving} onClick={() => setDraft({})}>
                            Discard
                        </Button.Text>
                        <Button isLoading={saving} disabled={!dirty} onClick={save}>
                            {dirty ? `Save ${Object.keys(draft).length} ${Object.keys(draft).length === 1 ? 'change' : 'changes'}` : 'Saved'}
                        </Button>
                    </div>
                </div>

                <div className={'ppx:flex ppx:min-w-0 ppx:flex-col ppx:gap-3'}>
                    <div className={'ppx:flex ppx:flex-col ppx:gap-3 ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card ppx:p-4'}>
                        <p className={'ppx:text-sm ppx:font-semibold'}>Live preview</p>
                        <p className={'ppx:text-sm ppx:text-muted-foreground'}>The real panel in its own window, sized like the device you pick. Each change shows there at once; nobody else sees anything until you save.</p>
                        <div className={'ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-2'}>
                            <div className={'ppx:flex ppx:gap-1 ppx:rounded-full ppx:border ppx:border-border ppx:p-1'}>
                                {(['dashboard', 'server', 'admin', 'account'] as Page[]).map((name) => (
                                    <button
                                        key={name}
                                        type={'button'}
                                        className={pill(page === name)}
                                        onClick={() => {
                                            setPage(name);
                                            if (open) show({ page: name });
                                        }}
                                    >
                                        {name.charAt(0).toUpperCase() + name.slice(1)}
                                    </button>
                                ))}
                            </div>
                            <div className={'ppx:flex ppx:gap-1 ppx:rounded-full ppx:border ppx:border-border ppx:p-1'}>
                                {(['desktop', 'tablet', 'phone'] as Device[]).map((name) => (
                                    <button
                                        key={name}
                                        type={'button'}
                                        className={pill(device === name)}
                                        title={name}
                                        onClick={() => {
                                            setDevice(name);
                                            if (open) show({ device: name });
                                        }}
                                    >
                                        <NamedIcon name={name === 'desktop' ? 'monitor' : name === 'tablet' ? 'tablet' : 'smartphone'} size={13} />
                                    </button>
                                ))}
                                <button
                                    type={'button'}
                                    className={pill(turned)}
                                    title={'Turn sideways'}
                                    onClick={() => {
                                        setTurned(!turned);
                                        if (open) show({ turned: !turned });
                                    }}
                                >
                                    <NamedIcon name={'rotate-cw-square'} size={13} />
                                </button>
                            </div>
                        </div>
                        <div className={'ppx:flex ppx:flex-wrap ppx:gap-2'}>
                            <Button onClick={() => show()}>
                                <NamedIcon name={'app-window'} size={14} /> {open ? 'Show the preview window' : 'Open preview window'}
                            </Button>
                            {open && (
                                <Button.Text onClick={() => preview.current?.location.reload()}>
                                    <NamedIcon name={'refresh-cw'} size={14} /> Reload it
                                </Button.Text>
                            )}
                        </div>
                        {!live && !previewing && <Alert type={'info'}>The window shows the active theme until you choose Preview for me. Only you see a preview.</Alert>}
                    </div>
                    <div className={'ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card ppx:p-4'}>
                        <p className={'ppx:mb-2 ppx:text-sm ppx:font-semibold'}>Now set</p>
                        <dl className={'ppx:grid ppx:grid-cols-2 ppx:gap-x-4 ppx:gap-y-1 ppx:text-sm'}>
                            {(['look', 'palette', 'bars', 'cards', 'background', 'font'] as const).map((key) => {
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

/** A small picture of a look: its colour, bars and cards. */
function LookSwatch({ look, colours }: { look: Record<string, unknown>; colours?: Look['swatch'] }) {
    const colour = colours?.accent ?? swatch(String(look.palette));
    const card = colours ? colours.surface : look.cards === 'outline' ? 'none' : '#ffffff18';
    const bars = String(look.bars);
    const side = bars === 'sidebar' || bars === 'sidebar_top' ? 18 : bars === 'rail' || bars === 'rail_top' ? 7 : 0;
    const top = bars === 'top' || bars.endsWith('_top') || bars === 'top_dock';
    const dock = bars === 'dock' || bars === 'top_dock';

    return (
        <svg viewBox={'0 0 100 56'} className={'ppx:h-16 ppx:w-full'} aria-hidden style={{ background: colours?.base ?? (look.background === 'mesh' ? 'radial-gradient(circle at 20% 20%, #8b5cf6aa, transparent 60%), radial-gradient(circle at 80% 80%, #ec4899aa, transparent 60%), #141821' : look.palette === 'stone' ? '#f4efe6' : '#141821') }}>
            {side > 0 && <rect x={0} y={0} width={side} height={56} fill={'#ffffff10'} />}
            {top && <rect x={side} y={0} width={100 - side} height={8} fill={'#ffffff14'} />}
            {[0, 1, 2].map((index) => (
                <rect key={index} x={side + 6 + index * ((94 - side) / 3)} y={top ? 14 : 8} width={(94 - side) / 3 - 4} height={look.cards === 'rows' || look.cards === 'compact' ? 12 : 22} rx={Math.min(6, Number(look.radius ?? 8) / 3)} fill={card} stroke={look.cards === 'outline' || look.cards === 'neon' ? colour : 'none'} />
            ))}
            <rect x={side + 6} y={top ? 14 : 8} width={14} height={4} rx={1} fill={colour} />
            {dock && <rect x={30} y={47} width={40} height={6} rx={3} fill={'#ffffff26'} />}
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
                        <div className={'ppx:flex ppx:flex-wrap ppx:gap-1 ppx:rounded-lg ppx:bg-muted/40 ppx:p-1'}>
                            {options.map((option) => (
                                <button key={option.value} type={'button'} onClick={() => onChange(option.value)} className={cn('ppx:rounded-md ppx:px-3 ppx:py-1.5 ppx:text-sm ppx:cursor-pointer', option.value === value ? 'ppx:bg-card ppx:font-semibold ppx:shadow-sm' : 'ppx:text-muted-foreground ppx:hover:text-foreground')}>
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
