import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Dialog, Input, Select, Spinner, cn, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { ToggleRow } from '../editors';
import { reloadPreview, usePreviewDraft, usePreviewNote } from '../preview';
import ExtensionMark from '../ExtensionMark';
import SaveBar, { describeValue } from '../SaveBar';
import { THEME_ID, optionsOf, themeApi, themeKeys, type ThemeSetting } from './api';
import { contrast, normaliseColor, toHex, toOklch } from './color';
import { asSettings, generatePalette, type Tint } from './generate';
import { BUILT_IN, ROLES, isLook, lookOf, matches, newId, readCustom, writeCustom, type Mode, type Preset, type Values } from './presets';

const SECTIONS = ['Presets', 'Colors', 'Type and shape', 'Surfaces', 'Background', 'Motion'];

/** The editor's sections, as Prism Properties lists them. */
export const themeSections = (_list?: ThemeSetting[]) => SECTIONS;

/** The section a setting is edited in: both color tabs are the one Colors section. */
export const sectionOf = (setting: Pick<ThemeSetting, 'tab'>) => (setting.tab === 'Dark colors' || setting.tab === 'Light colors' ? 'Colors' : (setting.tab ?? 'Presets'));

const box = 'pt-surface ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card';
const MODES: [Mode, string][] = [
    ['d', 'Dark'],
    ['l', 'Light'],
];

/**
 * Prism Themes' tool: a theme is built from colors for dark and light, type and shape,
 * surfaces, background and motion. Presets are the same values with a name, built in or your own.
 */
export default function ThemeEditor({ section, focus, onDirty }: { section: string; focus?: string | null; onDirty?: (dirty: boolean) => void }) {
    const queryClient = useQueryClient();
    const themes = useQuery({ queryKey: themeKeys.themes, queryFn: themeApi.themes });
    const settings = useQuery({ queryKey: themeKeys.settings, queryFn: themeApi.settings });
    const [draft, setDraft] = useState<Values>({});
    const [saving, setSaving] = useState(false);
    const [activating, setActivating] = useState(false);

    const list = settings.data ?? [];
    const values = useMemo(() => Object.fromEntries(list.map((setting) => [setting.key, setting.key in draft ? draft[setting.key] : setting.value])), [list, draft]);
    const dirty = Object.keys(draft).length > 0;
    const info = themes.data?.themes.find((theme) => theme.id === THEME_ID);
    const live = themes.data?.active === THEME_ID;
    const previewing = themes.data?.preview === THEME_ID;

    usePreviewDraft(THEME_ID, values);
    // In the preview controls: how the theme's preview works, and the look being built.
    usePreviewNote(
        THEME_ID,
        <>
            {!live && !previewing && <Alert type={'info'}>The window shows the active theme until you choose Preview for me. Only you see a preview.</Alert>}
            <div className={'ppx:flex ppx:flex-col ppx:gap-2 ppx:border-t ppx:border-border ppx:pt-3'}>
                <p className={'ppx:text-xs ppx:font-semibold ppx:tracking-wide ppx:text-muted-foreground ppx:uppercase'}>Now</p>
                <Swatch values={values} />
                <p className={'ppx:text-sm ppx:text-muted-foreground'}>{currentName(values)}</p>
            </div>
        </>
    );
    useEffect(() => onDirty?.(dirty), [dirty, onDirty]);

    // Leaving with unsaved changes asks first.
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);

        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    /** Sets values as unsaved changes; a value back at its saved one is no change. */
    const apply = (changes: Values) =>
        setDraft((current) => {
            const next = { ...current };
            for (const [key, value] of Object.entries(changes)) {
                const setting = list.find((item) => item.key === key);
                if (!setting) continue;
                if (JSON.stringify(setting.value) === JSON.stringify(value)) delete next[key];
                else next[key] = value;
            }

            return next;
        });
    const change = (key: string, value: unknown) => apply({ [key]: value });

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

    if (themes.isLoading || settings.isLoading) return <Spinner centered />;
    if (themes.isError || settings.isError) return <Alert type={'danger'}>{httpErrorToHuman(themes.error ?? settings.error)}</Alert>;

    const fields = list.filter((setting) => isLook(setting.key) && sectionOf(setting) === section);

    return (
        <div className={'ppx:flex ppx:flex-col ppx:gap-4'}>
            <div className={cn(box, 'ppx:flex ppx:flex-wrap ppx:items-start ppx:gap-3 ppx:p-4')}>
                <ExtensionMark id={THEME_ID} icon={'palette'} />
                <div className={'ppx:min-w-56 ppx:flex-1'}>
                    <h2 className={'ppx:text-lg ppx:font-semibold'}>Prism Themes</h2>
                    <p className={'ppx:text-sm ppx:text-muted-foreground'}>
                        Build the look from colors, type, surfaces and a background, or start from a preset. {live ? 'Active for everyone.' : previewing ? 'Not active. You are previewing it; only you see it.' : 'Not active. Preview it for yourself, or activate it for everyone.'}
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

            <div className={'ppx:flex ppx:min-w-0 ppx:flex-col ppx:gap-4'}>
                <div className={'ppx:flex ppx:min-w-0 ppx:flex-col ppx:gap-3'}>
                    {section === 'Presets' ? (
                        <Presets values={values} apply={apply} />
                    ) : section === 'Colors' ? (
                        <Colors values={values} apply={apply} focus={focus ?? null} />
                    ) : (
                        <section className={box}>
                            <h3 className={'ppx:border-b ppx:border-border ppx:px-4 ppx:py-3 ppx:text-sm ppx:font-semibold'}>{section}</h3>
                            <div className={'ppx:flex ppx:flex-col ppx:gap-3 ppx:p-4'}>
                                {fields.length === 0 ? (
                                    <p className={'ppx:text-sm ppx:text-muted-foreground'}>Nothing to set here.</p>
                                ) : (
                                    fields.map((setting) => (
                                        <div key={setting.key} id={`ppx-setting-${THEME_ID}-${setting.key}`} className={cn('ppx:scroll-mt-24 ppx:rounded-md ppx:border-b ppx:border-border ppx:pb-3 ppx:last:border-b-0', focus === setting.key && 'ppx:ring-2 ppx:ring-primary ppx:ring-offset-4 ppx:ring-offset-card')}>
                                            <Field setting={setting} value={values[setting.key]} onChange={(value) => change(setting.key, value)} onSchema={(fresh) => queryClient.setQueryData(themeKeys.settings, fresh)} />
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>
                    )}

                    <SaveBar
                        changes={list
                            .filter((setting) => setting.key in draft)
                            .map((setting) => ({ key: setting.key, label: setting.key === 'presets' ? 'Your presets' : setting.label, section: sectionOf(setting), from: describeValue(setting.value, optionsOf(setting)), to: describeValue(draft[setting.key], optionsOf(setting)) }))}
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

/** Which preset the values are, or which they started from. */
function currentName(values: Values): string {
    const all = [...BUILT_IN, ...readCustom(values.presets)];
    const exact = all.find((preset) => matches(preset, values));
    if (exact) return `Preset: ${exact.name}`;

    return typeof values.preset === 'string' && values.preset ? `Custom, based on ${values.preset}` : 'Custom';
}

/** A small picture of a theme: its dark half beside its light half. */
function Swatch({ values, className }: { values: Values; className?: string }) {
    const half = (mode: Mode, x: number) => {
        const get = (role: string) => String(values[`${mode}_${role}`] ?? 'transparent');

        return (
            <g>
                <rect x={x} y={0} width={50} height={56} fill={get('background')} />
                <rect x={x} y={0} width={11} height={56} fill={get('sidebar')} />
                <rect x={x + 15} y={7} width={31} height={22} rx={3} fill={get('surface')} stroke={get('border')} strokeWidth={0.6} />
                <rect x={x + 19} y={11} width={14} height={3} rx={1} fill={get('text')} />
                <rect x={x + 19} y={17} width={20} height={2} rx={1} fill={get('muted_text')} />
                <rect x={x + 19} y={22} width={10} height={4} rx={1.5} fill={get('primary')} />
                {['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'].map((role, index) => (
                    <circle key={role} cx={x + 18 + index * 5} cy={42} r={1.8} fill={get(role)} />
                ))}
                <rect x={x + 15} y={47} width={31} height={4} rx={1.5} fill={get('deep')} />
            </g>
        );
    };

    return (
        <svg viewBox={'0 0 100 56'} className={cn('ppx:h-20 ppx:w-full ppx:overflow-hidden ppx:rounded-md', className)} aria-hidden>
            {half('d', 0)}
            {half('l', 50)}
        </svg>
    );
}

/* #region Presets */

function Presets({ values, apply }: { values: Values; apply: (changes: Values) => void }) {
    const own = readCustom(values.presets);
    const [naming, setNaming] = useState<{ id: string | null; name: string } | null>(null);
    const store = (next: Preset[]) => apply({ presets: writeCustom(next) });

    const use = (preset: Preset) => apply({ ...preset.values, preset: preset.name });
    const saveName = () => {
        if (!naming) return;
        const name = naming.name.trim();
        if (!name) return;
        if (naming.id === null) {
            store([...own, { id: newId(), name, values: lookOf(values) }]);
            apply({ preset: name });
            toast.success(`"${name}" is in your presets. Save to keep it.`);
        } else {
            store(own.map((preset) => (preset.id === naming.id ? { ...preset, name } : preset)));
        }
        setNaming(null);
    };

    const card = (preset: Preset) => {
        const active = matches(preset, values);

        return (
            <div key={preset.id} className={cn('ppx:flex ppx:flex-col ppx:overflow-hidden ppx:rounded-lg ppx:border ppx:transition-colors', active ? 'ppx:border-primary ppx:ring-1 ppx:ring-primary' : 'ppx:border-border')}>
                <button type={'button'} onClick={() => use(preset)} className={'ppx:flex ppx:cursor-pointer ppx:flex-col ppx:text-left ppx:hover:bg-muted/40'} aria-pressed={active}>
                    <Swatch values={preset.values} className={'ppx:rounded-none'} />
                    <span className={'ppx:flex ppx:items-center ppx:gap-1.5 ppx:px-2.5 ppx:pt-2 ppx:text-sm ppx:font-medium'}>
                        {preset.name}
                        {active && <NamedIcon name={'check'} size={13} className={'ppx:text-primary'} />}
                    </span>
                    <span className={'ppx:px-2.5 ppx:pb-1 ppx:text-xs ppx:text-muted-foreground'}>{preset.description ?? 'Your preset.'}</span>
                </button>
                <div className={'ppx:mt-auto ppx:flex ppx:gap-1 ppx:border-t ppx:border-border ppx:px-1.5 ppx:py-1.5'}>
                    <IconAction icon={'copy'} label={`Duplicate ${preset.name}`} onClick={() => store([...own, { id: newId(), name: `${preset.name} copy`, values: { ...preset.values } }])} />
                    {!preset.builtIn && (
                        <>
                            <IconAction icon={'pencil'} label={`Rename ${preset.name}`} onClick={() => setNaming({ id: preset.id, name: preset.name })} />
                            <IconAction icon={'refresh-cw'} label={`Update ${preset.name} to the look set now`} onClick={() => store(own.map((item) => (item.id === preset.id ? { ...item, values: lookOf(values) } : item)))} />
                            <span className={'ppx:flex-1'} />
                            <IconAction icon={'trash-2'} label={`Delete ${preset.name}`} danger onClick={() => store(own.filter((item) => item.id !== preset.id))} />
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <>
            <section className={box}>
                <div className={'ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-3 ppx:border-b ppx:border-border ppx:px-4 ppx:py-3'}>
                    <h3 className={'ppx:flex-1 ppx:text-sm ppx:font-semibold'}>Your presets</h3>
                    <Button size={'small'} onClick={() => setNaming({ id: null, name: '' })}>
                        <NamedIcon name={'plus'} size={14} /> Save the current look as a preset
                    </Button>
                </div>
                {naming && (
                    <form
                        className={'ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-2 ppx:border-b ppx:border-border ppx:px-4 ppx:py-3'}
                        onSubmit={(event) => {
                            event.preventDefault();
                            saveName();
                        }}
                    >
                        <Input autoFocus value={naming.name} onChange={(event) => setNaming({ ...naming, name: event.target.value })} placeholder={'Name, such as Night shift'} maxLength={40} aria-label={'Preset name'} className={'ppx:max-w-xs ppx:flex-1'} />
                        <Button type={'submit'} size={'small'} disabled={!naming.name.trim()}>
                            {naming.id === null ? 'Add' : 'Rename'}
                        </Button>
                        <Button.Text size={'small'} onClick={() => setNaming(null)}>
                            Cancel
                        </Button.Text>
                    </form>
                )}
                <div className={'ppx:p-4'}>
                    {own.length === 0 ? (
                        <p className={'ppx:text-sm ppx:text-muted-foreground'}>None yet. Change the colors and the rest, then save the look here; or duplicate a built-in preset to start from it.</p>
                    ) : (
                        <div className={'ppx:grid ppx:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] ppx:gap-3'}>{own.map(card)}</div>
                    )}
                </div>
            </section>
            <section className={box}>
                <h3 className={'ppx:border-b ppx:border-border ppx:px-4 ppx:py-3 ppx:text-sm ppx:font-semibold'}>Built-in presets</h3>
                <div className={'ppx:grid ppx:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] ppx:gap-3 ppx:p-4'}>{BUILT_IN.map(card)}</div>
                <p className={'ppx:border-t ppx:border-border ppx:px-4 ppx:py-3 ppx:text-xs ppx:text-muted-foreground'}>
                    A preset sets every color, the type, surfaces, background and motion. Change anything after; it stays unsaved until you save.
                </p>
            </section>
        </>
    );
}

/** A small icon button; its label shows as a tooltip and is read out. */
function IconAction({ icon, label, danger = false, onClick }: { icon: string; label: string; danger?: boolean; onClick: () => void }) {
    return (
        <button type={'button'} onClick={onClick} title={label} aria-label={label} className={cn('ppx:flex ppx:size-8 ppx:cursor-pointer ppx:items-center ppx:justify-center ppx:rounded-md ppx:text-muted-foreground ppx:transition-colors', danger ? 'ppx:hover:bg-destructive/15 ppx:hover:text-destructive' : 'ppx:hover:bg-muted ppx:hover:text-foreground')}>
            <NamedIcon name={icon} size={15} />
        </button>
    );
}

/* #endregion Presets */

/* #region Colors */

const GROUPS = [...new Set(ROLES.map((role) => role.group))];
/** Which roles show a contrast hint, against which background. */
const AGAINST: Record<string, string> = { text: 'background', muted_text: 'background', on_primary: 'primary' };

function Colors({ values, apply, focus }: { values: Values; apply: (changes: Values) => void; focus: string | null }) {
    const [mode, setMode] = useState<Mode>(() => (focus?.startsWith('l_') ? 'l' : 'd'));
    const [seed, setSeed] = useState(() => toHex(String(values.d_primary)));
    const [tint, setTint] = useState<Tint>('subtle');
    const other: Mode = mode === 'd' ? 'l' : 'd';
    const get = (role: string) => String(values[`${mode}_${role}`] ?? '');

    useEffect(() => {
        if (focus?.startsWith('l_')) setMode('l');
        else if (focus?.startsWith('d_')) setMode('d');
    }, [focus]);

    const generate = () => {
        const { h, c } = toOklch(seed);
        apply(asSettings(mode, generatePalette(mode, h, Math.max(0.02, Math.min(0.3, c)), tint)));
    };
    const copy = () => apply(Object.fromEntries(ROLES.map((role) => [`${other}_${role.key}`, values[`${mode}_${role.key}`]])));

    return (
        <>
            <section className={box}>
                <div className={'ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-3 ppx:border-b ppx:border-border ppx:px-4 ppx:py-3'}>
                    <h3 className={'ppx:flex-1 ppx:text-sm ppx:font-semibold'}>Colors</h3>
                    <div className={'prism-switch ppx:flex ppx:gap-1 ppx:rounded-lg ppx:bg-muted/40 ppx:p-1'} role={'group'} aria-label={'Mode'}>
                        {MODES.map(([value, label]) => (
                            <button key={value} type={'button'} aria-pressed={mode === value} onClick={() => setMode(value)} className={cn('prism-switch-item ppx:flex ppx:cursor-pointer ppx:items-center ppx:gap-1.5 ppx:rounded-md ppx:px-3 ppx:py-1 ppx:text-sm', mode === value ? 'ppx:bg-card ppx:font-semibold ppx:shadow-sm' : 'ppx:text-muted-foreground ppx:hover:text-foreground')}>
                                <NamedIcon name={value === 'd' ? 'moon' : 'sun'} size={13} /> {label}
                            </button>
                        ))}
                    </div>
                    <Button.Text size={'small'} onClick={copy}>
                        <NamedIcon name={'copy'} size={13} /> Copy {mode === 'd' ? 'dark to light' : 'light to dark'}
                    </Button.Text>
                </div>

                <div className={'ppx:flex ppx:flex-wrap ppx:items-end ppx:gap-3 ppx:border-b ppx:border-border ppx:bg-muted/20 ppx:px-4 ppx:py-3'}>
                    <div className={'ppx:min-w-48 ppx:flex-1'}>
                        <p className={'ppx:text-sm ppx:font-medium'}>Make a palette from one color</p>
                        <p className={'ppx:text-xs ppx:text-muted-foreground'}>Fills every {mode === 'd' ? 'dark' : 'light'} color from it. Fine-tune them below afterwards.</p>
                    </div>
                    <input type={'color'} value={seed} onChange={(event) => setSeed(event.target.value)} aria-label={'The color to start from'} className={'ppx:h-9 ppx:w-12 ppx:cursor-pointer ppx:rounded ppx:border ppx:border-border ppx:bg-transparent'} />
                    <div className={'prism-switch ppx:flex ppx:gap-1 ppx:rounded-lg ppx:bg-muted/40 ppx:p-1'} role={'group'} aria-label={'Tint the greys'}>
                        {(['none', 'subtle', 'strong'] as Tint[]).map((value) => (
                            <button key={value} type={'button'} aria-pressed={tint === value} title={'How much of the color the greys take on'} onClick={() => setTint(value)} className={cn('prism-switch-item ppx:cursor-pointer ppx:rounded-md ppx:px-2.5 ppx:py-1 ppx:text-xs ppx:capitalize', tint === value ? 'ppx:bg-card ppx:font-semibold ppx:shadow-sm' : 'ppx:text-muted-foreground')}>
                                {value === 'none' ? 'Plain greys' : `${value} tint`}
                            </button>
                        ))}
                    </div>
                    <Button size={'small'} onClick={generate}>
                        <NamedIcon name={'wand-sparkles'} size={14} /> Fill {mode === 'd' ? 'dark' : 'light'} colors
                    </Button>
                </div>

                <div className={'ppx:grid ppx:gap-4 ppx:p-4 ppx:xl:grid-cols-[minmax(0,1fr)_16rem]'}>
                    <div className={'ppx:flex ppx:flex-col ppx:gap-4'}>
                        {GROUPS.map((group) => (
                            <div key={group} className={'ppx:flex ppx:flex-col ppx:gap-1'}>
                                <p className={'ppx:text-[11px] ppx:font-semibold ppx:tracking-wider ppx:text-muted-foreground ppx:uppercase'}>{group}</p>
                                {ROLES.filter((role) => role.group === group).map((role) => (
                                    <RoleRow key={`${mode}-${role.key}`} id={`${mode}_${role.key}`} label={role.label} help={role.help} value={get(role.key)} against={AGAINST[role.key] ? get(AGAINST[role.key]) : null} focused={focus === `${mode}_${role.key}`} onChange={(value) => apply({ [`${mode}_${role.key}`]: value })} />
                                ))}
                            </div>
                        ))}
                    </div>
                    <MiniPanel get={get} />
                </div>
            </section>
        </>
    );
}

function RoleRow({ id, label, help, value, against, focused, onChange }: { id: string; label: string; help: string | null; value: string; against: string | null; focused: boolean; onChange: (value: string) => void }) {
    const [text, setText] = useState(value);
    const [bad, setBad] = useState(false);
    useEffect(() => {
        setText(value);
        setBad(false);
    }, [value]);
    const ratio = against ? contrast(value, against) : null;
    const commit = () => {
        const normal = normaliseColor(text);
        if (normal) {
            setBad(false);
            if (normal !== value) onChange(normal);
        } else setBad(true);
    };

    return (
        <div id={`ppx-setting-${THEME_ID}-${id}`} className={cn('ppx:flex ppx:scroll-mt-24 ppx:flex-wrap ppx:items-center ppx:gap-3 ppx:rounded-md ppx:px-2 ppx:py-1.5 ppx:hover:bg-muted/30', focused && 'ppx:ring-2 ppx:ring-primary')}>
            <input type={'color'} value={toHex(value)} onChange={(event) => onChange(event.target.value)} aria-label={label} className={'ppx:h-8 ppx:w-10 ppx:shrink-0 ppx:cursor-pointer ppx:rounded ppx:border ppx:border-border ppx:bg-transparent'} />
            <div className={'ppx:min-w-36 ppx:flex-1'}>
                <p className={'ppx:text-sm'}>{label}</p>
                {help && <p className={'ppx:text-xs ppx:text-muted-foreground'}>{help}</p>}
            </div>
            {ratio !== null && (
                <span className={cn('ppx:rounded ppx:px-1.5 ppx:py-0.5 ppx:font-mono ppx:text-xs', ratio >= 4.5 ? 'ppx:bg-success/15 ppx:text-success' : ratio >= 3 ? 'ppx:bg-warning/15 ppx:text-warning' : 'ppx:bg-destructive/15 ppx:text-destructive')} title={'Contrast against its background: 4.5 or more reads well (AA)'}>
                    {ratio.toFixed(1)}:1 {ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'low'}
                </span>
            )}
            <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => event.key === 'Enter' && commit()}
                spellCheck={false}
                aria-label={`${label}, as hex or oklch`}
                aria-invalid={bad}
                title={bad ? 'Use #rrggbb or oklch(L C H)' : undefined}
                className={cn('ppx:w-52 ppx:rounded-md ppx:border ppx:bg-input ppx:px-2 ppx:py-1 ppx:font-mono ppx:text-xs', bad ? 'ppx:border-destructive' : 'ppx:border-input-border')}
            />
        </div>
    );
}

/** A small piece of the panel in the palette being edited. */
function MiniPanel({ get }: { get: (role: string) => string }) {
    return (
        <div className={'ppx:sticky ppx:top-4 ppx:flex ppx:h-fit ppx:overflow-hidden ppx:rounded-lg ppx:border ppx:text-[11px]'} style={{ background: get('background'), borderColor: get('border'), color: get('text') }} aria-hidden>
            <div className={'ppx:flex ppx:w-16 ppx:flex-col ppx:gap-1 ppx:p-2'} style={{ background: get('sidebar') }}>
                <span className={'ppx:rounded ppx:px-1.5 ppx:py-1'} style={{ background: `color-mix(in oklab, ${get('primary')} 20%, transparent)` }}>
                    Home
                </span>
                <span className={'ppx:px-1.5 ppx:py-1'} style={{ color: get('muted_text') }}>
                    Files
                </span>
                <span className={'ppx:px-1.5 ppx:py-1'} style={{ color: get('muted_text') }}>
                    Logs
                </span>
            </div>
            <div className={'ppx:flex ppx:flex-1 ppx:flex-col ppx:gap-2 ppx:p-2'}>
                <div className={'ppx:flex ppx:flex-col ppx:gap-1.5 ppx:rounded ppx:border ppx:p-2'} style={{ background: get('surface'), borderColor: get('border') }}>
                    <span className={'ppx:font-semibold'}>A card</span>
                    <span style={{ color: get('muted_text') }}>Quiet text under it.</span>
                    <div className={'ppx:flex ppx:flex-wrap ppx:gap-1'}>
                        <span className={'ppx:rounded ppx:px-1.5 ppx:py-0.5'} style={{ background: get('primary'), color: get('on_primary') }}>
                            Button
                        </span>
                        {(['success', 'warning', 'danger'] as const).map((role) => (
                            <span key={role} className={'ppx:rounded ppx:px-1.5 ppx:py-0.5 ppx:capitalize'} style={{ background: `color-mix(in oklab, ${get(role)} 18%, transparent)`, color: get(role) }}>
                                {role}
                            </span>
                        ))}
                    </div>
                </div>
                <div className={'ppx:rounded ppx:p-1.5 ppx:font-mono ppx:leading-relaxed'} style={{ background: get('deep') }}>
                    <span style={{ color: get('magenta') }}>if</span> (<span style={{ color: get('blue') }}>ready</span>()) <span style={{ color: get('cyan') }}>=</span> <span style={{ color: get('green') }}>&quot;go&quot;</span>
                    <br />
                    <span style={{ color: get('yellow') }}>[WARN]</span> <span style={{ color: get('red') }}>[ERROR]</span> done
                </div>
                <div className={'ppx:rounded ppx:p-1.5'} style={{ background: get('raised') }}>
                    A menu, raised
                </div>
            </div>
        </div>
    );
}

/* #endregion Colors */

function Label({ setting }: { setting: ThemeSetting }) {
    return (
        <div className={'ppx:mb-1.5'}>
            <p className={'ppx:text-sm ppx:font-medium'}>{setting.label}</p>
            {setting.help && <p className={'ppx:text-xs ppx:text-muted-foreground'}>{setting.help}</p>}
        </div>
    );
}

function Choice({ options, value, onChange, children }: { options: { value: string; label: string }[]; value: unknown; onChange: (value: string) => void; children?: (option: { value: string; label: string }) => ReactNode }) {
    return (
        <div className={'ppx:grid ppx:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] ppx:gap-2'}>
            {options.map((option) => (
                <button key={option.value} type={'button'} aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={cn('ppx:flex ppx:cursor-pointer ppx:flex-col ppx:items-center ppx:gap-2 ppx:rounded-lg ppx:border ppx:p-3', value === option.value ? 'ppx:border-primary ppx:ring-1 ppx:ring-primary' : 'ppx:border-border ppx:hover:border-primary')}>
                    {children?.(option)}
                    <span className={'ppx:text-sm'}>{option.label}</span>
                </button>
            ))}
        </div>
    );
}

function Field({ setting, value, onChange, onSchema }: { setting: ThemeSetting; value: unknown; onChange: (value: unknown) => void; onSchema: (schema: ThemeSetting[]) => void }) {
    const upload = useRef<HTMLInputElement>(null);

    switch (setting.type) {
        case 'toggle':
            return <ToggleRow label={setting.label} help={setting.help} checked={value === true} onChange={onChange} />;
        case 'number': {
            const number = Number(value ?? setting.min ?? 0);

            return (
                <>
                    <div className={'ppx:flex ppx:items-start ppx:justify-between ppx:gap-2'}>
                        <Label setting={setting} />
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
            if (setting.key === 'switches') {
                return (
                    <>
                        <Label setting={setting} />
                        <Choice options={options} value={value} onChange={onChange}>
                            {(option) => (
                                <span className={cn('ppx:flex ppx:gap-0.5 ppx:border ppx:border-border ppx:bg-muted/40 ppx:p-0.5 ppx:text-xs', option.value === 'rounded' ? 'ppx:rounded-full' : 'ppx:rounded-md')}>
                                    <span className={cn('ppx:bg-primary ppx:px-2 ppx:py-0.5 ppx:text-primary-foreground', option.value === 'rounded' ? 'ppx:rounded-full' : 'ppx:rounded')}>Files</span>
                                    <span className={'ppx:px-2 ppx:py-0.5 ppx:text-muted-foreground'}>Editor</span>
                                </span>
                            )}
                        </Choice>
                    </>
                );
            }
            if (setting.key === 'surface_style') {
                return (
                    <>
                        <Label setting={setting} />
                        <Choice options={options} value={value} onChange={onChange}>
                            {(option) => (
                                <span
                                    className={'ppx:h-10 ppx:w-full ppx:rounded-md ppx:border'}
                                    style={{
                                        background: option.value === 'glass' ? 'color-mix(in oklab, var(--card) 55%, transparent)' : 'var(--card)',
                                        borderColor: option.value === 'outlined' ? 'var(--muted-foreground)' : option.value === 'glow' ? 'color-mix(in oklab, var(--primary) 50%, transparent)' : 'var(--border)',
                                        boxShadow: option.value === 'raised' ? '0 4px 14px rgb(0 0 0 / 0.25)' : option.value === 'glow' ? '0 0 16px color-mix(in oklab, var(--primary) 30%, transparent)' : 'none',
                                        backdropFilter: option.value === 'glass' ? 'blur(6px)' : undefined,
                                    }}
                                />
                            )}
                        </Choice>
                    </>
                );
            }
            if (setting.key === 'font') {
                const families: Record<string, string> = { plex: "'IBM Plex Sans', sans-serif", inter: "'Inter Variable', 'Inter', sans-serif", system: 'system-ui, sans-serif', rounded: "ui-rounded, 'Nunito', sans-serif", serif: 'ui-serif, Georgia, serif', mono: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace" };

                return (
                    <>
                        <Label setting={setting} />
                        <Choice options={options} value={value} onChange={onChange}>
                            {(option) => (
                                <span className={'ppx:text-2xl'} style={{ fontFamily: families[option.value] }}>
                                    Aa
                                </span>
                            )}
                        </Choice>
                    </>
                );
            }

            return (
                <>
                    <Label setting={setting} />
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
                    <Label setting={setting} />
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
                    <Label setting={setting} />
                    <Input value={typeof value === 'string' ? value : ''} maxLength={setting.max_length ?? undefined} onChange={(event) => onChange(event.target.value)} />
                </>
            );
    }
}
