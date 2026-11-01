import { useState, type DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Dialog, Input, Spinner, Switch, cn, http, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { NamedIcon } from './icons';

type ProviderType = 'google' | 'discord' | 'github' | 'steam' | 'oidc';

/** A sign-in provider as Prism Auth's admin API gives it: the secret only as a mask. */
interface AuthProvider {
    id: number;
    type: ProviderType;
    slug: string;
    name: string;
    label: string;
    icon: string | null;
    color: string | null;
    client_id: string | null;
    secret: string;
    issuer: string | null;
    scopes: string | null;
    enabled: boolean;
    allow_signup: boolean;
    callback: string;
}

interface Preset {
    type: ProviderType;
    name: string;
    /** For OpenID Connect: the issuer's shape, to fill in. */
    issuer?: string;
    /** Where the admin makes the app and finds the client ID and secret. */
    help: string;
}

const PRESETS: Preset[] = [
    { type: 'google', name: 'Google', help: 'Google Cloud console, APIs and services, Credentials: an OAuth client ID of type "Web application".' },
    { type: 'discord', name: 'Discord', help: 'Discord Developer Portal, your application, OAuth2: the client ID and secret.' },
    { type: 'github', name: 'GitHub', help: 'GitHub, Settings, Developer settings, OAuth Apps: a new OAuth app.' },
    { type: 'steam', name: 'Steam', help: 'Steam needs no app. Put a Steam Web API key in the secret to show names and avatars.' },
    { type: 'oidc', name: 'Authentik', issuer: 'https://auth.example.com/application/o/<application-slug>', help: 'Authentik, Applications, Providers: an OAuth2/OpenID provider with a confidential client.' },
    { type: 'oidc', name: 'Keycloak', issuer: 'https://keycloak.example.com/realms/<realm>', help: 'Keycloak, your realm, Clients: an OpenID Connect client with client authentication on.' },
    { type: 'oidc', name: 'Authelia', issuer: 'https://auth.example.com', help: 'Authelia configuration, identity_providers.oidc.clients: a client with this redirect URI.' },
    { type: 'oidc', name: 'Zitadel', issuer: 'https://<instance>.zitadel.cloud', help: 'Zitadel, your project: a Web application using Code with a client secret.' },
    { type: 'oidc', name: 'Microsoft Entra ID', issuer: 'https://login.microsoftonline.com/<tenant-id>/v2.0', help: 'Azure portal, Entra ID, App registrations: a Web redirect URI and a client secret.' },
    { type: 'oidc', name: 'Okta', issuer: 'https://<org>.okta.com', help: 'Okta admin, Applications: an OIDC Web Application.' },
    { type: 'oidc', name: 'Auth0', issuer: 'https://<tenant>.auth0.com', help: 'Auth0 dashboard, Applications: a Regular Web Application.' },
    { type: 'oidc', name: 'GitLab', issuer: 'https://gitlab.com', help: 'GitLab, Preferences, Applications: scopes openid, email and profile.' },
    { type: 'oidc', name: 'OpenID Connect', issuer: 'https://', help: 'Any provider with a discovery document at <issuer>/.well-known/openid-configuration.' },
];

const MARKS: Record<string, string> = { google: 'brand-google', discord: 'brand-discord', github: 'brand-github', steam: 'brand-steam' };

/** The provider's Tabler brand icon, or null for an OpenID Connect provider without one. */
function brandFor(provider: { type: string; name: string }): string | null {
    if (MARKS[provider.type]) return MARKS[provider.type];
    if (/entra|microsoft|azure/i.test(provider.name)) return 'brand-windows';
    if (/gitlab/i.test(provider.name)) return 'brand-gitlab';
    if (/auth0/i.test(provider.name)) return 'brand-auth0';

    return null;
}

const kindOf = (type: ProviderType) => (type === 'oidc' ? 'OpenID Connect' : type === 'steam' ? 'OpenID' : 'OAuth');

/** A provider's mark as Prism Auth draws it: the brand on a white tile, others a shield. */
function Tile({ provider, size = 36 }: { provider: { type: string; name: string; icon?: string | null }; size?: number }) {
    const brand = brandFor(provider);
    const icon = Math.round(size * 0.5);

    if (provider.icon || brand) {
        return (
            <span style={{ width: size, height: size }} className={'ppx:flex ppx:shrink-0 ppx:items-center ppx:justify-center ppx:overflow-hidden ppx:rounded-lg ppx:bg-white ppx:text-neutral-900 ppx:shadow-sm'}>
                {provider.icon ? <img src={provider.icon} alt={''} width={icon} height={icon} className={'ppx:object-contain'} /> : <NamedIcon name={brand!} size={icon} />}
            </span>
        );
    }

    return (
        <span style={{ width: size, height: size }} className={'ppx:flex ppx:shrink-0 ppx:items-center ppx:justify-center ppx:rounded-lg ppx:border ppx:border-border ppx:bg-muted/40 ppx:text-primary'}>
            <NamedIcon name={'shield'} size={icon} />
        </span>
    );
}

const helpFor = (provider: { type: string; name: string }) => (PRESETS.find((preset) => preset.type === provider.type && preset.name === provider.name) ?? PRESETS.find((preset) => preset.type === provider.type))?.help;

const API = '/api/admin/extensions/prism-auth/providers';
const KEY = ['prism-core', 'auth-providers'];

/**
 * Prism Auth's sign-in providers. They are saved on their own, straight away, rather than with the
 * page's other settings, because each holds a secret the page never gets back.
 */
export function ProvidersEditor({ help }: { help?: string | null }) {
    const client = useQueryClient();
    const query = useQuery({ queryKey: KEY, queryFn: async () => (await http.get<{ data: AuthProvider[] }>(API)).data.data });
    const [adding, setAdding] = useState(false);
    const [open, setOpen] = useState<number | null>(null);
    // While a row is dragged: the order as it is being shown.
    const [dragging, setDragging] = useState<{ id: number; ids: number[] } | null>(null);
    const loaded = query.data ?? [];
    const providers = dragging ? dragging.ids.map((id) => loaded.find((provider) => provider.id === id)).filter((provider) => provider !== undefined) : loaded;
    const reload = () => client.invalidateQueries({ queryKey: KEY });

    const add = async (preset: Preset) => {
        try {
            const { data } = await http.post<{ data: AuthProvider }>(API, {
                type: preset.type,
                name: preset.name,
                label: `Continue with ${preset.name === 'OpenID Connect' ? 'SSO' : preset.name}`,
                issuer: preset.issuer && !preset.issuer.includes('<') && preset.issuer !== 'https://' ? preset.issuer : null,
                enabled: false,
            });
            setAdding(false);
            setOpen(data.data.id);
            await reload();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        }
    };

    const saveOrder = async (ids: number[]) => {
        if (ids.join() === loaded.map((provider) => provider.id).join()) return;
        // Shown in the new order straight away; the server's answer follows.
        client.setQueryData<AuthProvider[]>(KEY, ids.map((id) => loaded.find((provider) => provider.id === id)).filter((provider) => provider !== undefined));
        await http.put(`${API}/order`, { ids }).catch((error) => toast.error(httpErrorToHuman(error)));
        await reload();
    };

    const move = (index: number, by: number) => {
        const ids = loaded.map((provider) => provider.id);
        if (index + by < 0 || index + by >= ids.length) return;
        const [moved] = ids.splice(index, 1);
        ids.splice(index + by, 0, moved);
        void saveOrder(ids);
    };

    const dragOver = (event: DragEvent, over: number) => {
        if (!dragging) return;
        event.preventDefault();
        if (over === dragging.id) return;
        const ids = dragging.ids.filter((id) => id !== dragging.id);
        ids.splice(dragging.ids.indexOf(over), 0, dragging.id);
        setDragging({ ...dragging, ids });
    };

    return (
        <div className={'pt-surface ppx:overflow-hidden ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card'}>
            <div className={'ppx:flex ppx:items-center ppx:gap-3 ppx:px-4 ppx:py-3'}>
                <div className={'ppx:min-w-0 ppx:flex-1'}>
                    <h3 className={'ppx:text-base ppx:font-semibold'}>Sign-in providers</h3>
                    {help && <p className={'ppx:text-xs ppx:text-muted-foreground'}>{help}</p>}
                </div>
                <Button size={'small'} onClick={() => setAdding(true)}>
                    <NamedIcon name={'plus'} size={14} /> Add provider
                </Button>
            </div>

            {query.isLoading && (
                <div className={'ppx:border-t ppx:border-border ppx:p-4'}>
                    <Spinner size={'small'} />
                </div>
            )}
            {query.isError && (
                <div className={'ppx:border-t ppx:border-border ppx:p-4'}>
                    <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>
                </div>
            )}
            {query.isSuccess && providers.length === 0 && (
                <p className={'ppx:border-t ppx:border-border ppx:px-4 ppx:py-6 ppx:text-center ppx:text-sm ppx:text-muted-foreground'}>No providers yet. Add one, fill in its client ID and secret, then switch it on.</p>
            )}

            {providers.map((provider, index) => (
                <ProviderCard
                    key={provider.id}
                    provider={provider}
                    open={open === provider.id}
                    onToggle={() => setOpen(open === provider.id ? null : provider.id)}
                    onMove={(by) => move(index, by)}
                    dragged={dragging?.id === provider.id}
                    onDragStart={() => setDragging({ id: provider.id, ids: loaded.map((item) => item.id) })}
                    onDragOver={(event) => dragOver(event, provider.id)}
                    onDragEnd={() => {
                        if (dragging) void saveOrder(dragging.ids);
                        setDragging(null);
                    }}
                    onSaved={reload}
                />
            ))}

            {adding && (
                <Dialog open onClose={() => setAdding(false)} title={'Add a sign-in provider'}>
                    <div className={'ppx:grid ppx:gap-2 ppx:sm:grid-cols-2'}>
                        {PRESETS.map((preset) => (
                            <button
                                key={preset.name}
                                type={'button'}
                                onClick={() => void add(preset)}
                                className={'pt-surface ppx:flex ppx:items-center ppx:gap-3 ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card ppx:p-3 ppx:text-left ppx:hover:border-primary ppx:cursor-pointer'}
                            >
                                <Tile provider={preset} size={32} />
                                <span className={'ppx:min-w-0'}>
                                    <span className={'ppx:block ppx:text-sm ppx:font-medium'}>{preset.name}</span>
                                    <span className={'ppx:block ppx:text-xs ppx:text-muted-foreground'}>{kindOf(preset.type)}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </Dialog>
            )}
        </div>
    );
}

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
    return (
        <label className={cn('ppx:flex ppx:flex-col ppx:gap-1 ppx:text-sm', wide && 'ppx:sm:col-span-2')}>
            <span className={'ppx:font-medium'}>{label}</span>
            {children}
            {hint && <span className={'ppx:text-xs ppx:text-muted-foreground'}>{hint}</span>}
        </label>
    );
}

function ProviderCard({
    provider,
    open,
    onToggle,
    onMove,
    dragged,
    onDragStart,
    onDragOver,
    onDragEnd,
    onSaved,
}: {
    provider: AuthProvider;
    open: boolean;
    onToggle: () => void;
    onMove: (by: number) => void;
    dragged: boolean;
    onDragStart: () => void;
    onDragOver: (event: DragEvent) => void;
    onDragEnd: () => void;
    onSaved: () => Promise<unknown>;
}) {
    const [draft, setDraft] = useState(provider);
    const [secret, setSecret] = useState('');
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [test, setTest] = useState<{ ok: boolean; problems: string[] } | null>(null);
    const set = (patch: Partial<AuthProvider>) => setDraft((current) => ({ ...current, ...patch }));
    const changed = secret !== '' || (['name', 'label', 'icon', 'color', 'client_id', 'issuer', 'scopes', 'allow_signup'] as const).some((key) => (draft[key] ?? '') !== (provider[key] ?? ''));
    const steam = provider.type === 'steam';
    const ready = steam || (!!(draft.client_id ?? '').trim() && (provider.secret !== '' || secret !== '') && (provider.type !== 'oidc' || /^https:\/\/[^<>]+$/.test(draft.issuer ?? '')));

    const save = async (patch: Record<string, unknown> = {}) => {
        setBusy(true);
        try {
            await http.patch(`${API}/${provider.id}`, {
                name: draft.name,
                label: draft.label,
                icon: draft.icon || null,
                color: draft.color || null,
                client_id: draft.client_id || null,
                issuer: draft.issuer || null,
                scopes: draft.scopes || null,
                allow_signup: draft.allow_signup,
                ...(secret ? { secret } : {}),
                ...patch,
            });
            setSecret('');
            await onSaved();
            toast.success(`${draft.name} is saved.`);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    const runTest = async () => {
        try {
            setTest((await http.post<{ data: { ok: boolean; problems: string[] } }>(`${API}/${provider.id}/test`)).data.data);
        } catch (error) {
            setTest({ ok: false, problems: [httpErrorToHuman(error)] });
        }
    };

    return (
        <div onDragOver={onDragOver} onDrop={(event) => event.preventDefault()} className={cn('ppx:border-t ppx:border-border', dragged && 'ppx:bg-muted/40 ppx:opacity-60')}>
            <div className={'ppx:flex ppx:items-center ppx:gap-3 ppx:px-4 ppx:py-3'}>
                <span
                    draggable
                    tabIndex={0}
                    role={'button'}
                    aria-label={`Move ${provider.name}. Drag, or use the arrow keys.`}
                    title={'Drag to change the order'}
                    onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', String(provider.id));
                        const row = event.currentTarget.parentElement;
                        if (row) event.dataTransfer.setDragImage(row, 16, row.offsetHeight / 2);
                        onDragStart();
                    }}
                    onDragEnd={onDragEnd}
                    onKeyDown={(event) => {
                        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                            event.preventDefault();
                            onMove(event.key === 'ArrowUp' ? -1 : 1);
                        }
                    }}
                    className={'ppx:-ml-1 ppx:flex ppx:shrink-0 ppx:cursor-grab ppx:rounded ppx:p-0.5 ppx:text-muted-foreground ppx:hover:text-foreground ppx:active:cursor-grabbing'}
                >
                    <NamedIcon name={'grip-vertical'} size={16} />
                </span>
                <button
                    type={'button'}
                    onClick={onToggle}
                    aria-expanded={open}
                    className={'ppx:grid ppx:min-w-0 ppx:flex-1 ppx:grid-cols-[auto_minmax(0,1fr)] ppx:items-center ppx:gap-3 ppx:text-left ppx:cursor-pointer ppx:sm:grid-cols-[auto_minmax(0,14rem)_minmax(0,1fr)]'}
                >
                    <Tile provider={provider} />
                    <span className={'ppx:min-w-0'}>
                        <span className={'ppx:block ppx:truncate ppx:text-sm ppx:font-semibold'}>{provider.name}</span>
                        {!provider.enabled && <span className={'ppx:block ppx:truncate ppx:text-xs ppx:text-muted-foreground'}>{ready ? 'Off' : 'Needs its client ID and secret'}</span>}
                    </span>
                    <span className={'ppx:hidden ppx:truncate ppx:text-sm ppx:text-muted-foreground ppx:sm:block'}>{kindOf(provider.type)}</span>
                </button>
                <NamedIcon name={open ? 'chevron-up' : 'chevron-down'} size={16} className={'ppx:shrink-0 ppx:text-muted-foreground'} />
                <Switch checked={provider.enabled} disabled={!provider.enabled && !ready} onChange={(enabled) => void save({ enabled })} aria-label={`Use ${provider.name}`} />
            </div>

            {open && (
                <div className={'ppx:flex ppx:flex-col ppx:gap-3 ppx:border-t ppx:border-border ppx:bg-muted/20 ppx:px-4 ppx:py-3'}>
                    {helpFor(provider) && <p className={'ppx:text-xs ppx:text-muted-foreground'}>{helpFor(provider)}</p>}
                    <Field label={'Redirect URL'} hint={'Paste this into the provider\'s app settings.'}>
                        <div className={'ppx:flex ppx:gap-2'}>
                            <Input readOnly value={provider.callback} className={'ppx:flex-1 ppx:font-mono ppx:text-xs'} onFocus={(event) => event.target.select()} />
                            <Button
                                size={'small'}
                                isSecondary
                                onClick={() =>
                                    void navigator.clipboard
                                        .writeText(provider.callback)
                                        .then(() => toast.success('Copied.'))
                                        .catch(() => toast.error('Could not copy.'))
                                }
                                aria-label={'Copy redirect URL'}
                            >
                                <NamedIcon name={'copy'} size={14} />
                            </Button>
                        </div>
                    </Field>
                    <div className={'ppx:grid ppx:gap-3 ppx:sm:grid-cols-2'}>
                        <Field label={'Name'}>
                            <Input value={draft.name} onChange={(event) => set({ name: event.target.value })} />
                        </Field>
                        <Field label={'Button text'}>
                            <Input value={draft.label} onChange={(event) => set({ label: event.target.value })} />
                        </Field>
                        {provider.type === 'oidc' && (
                            <Field label={'Issuer'} hint={'The address before /.well-known/openid-configuration.'} wide>
                                <Input value={draft.issuer ?? ''} onChange={(event) => set({ issuer: event.target.value })} placeholder={PRESETS.find((preset) => preset.name === provider.name)?.issuer ?? 'https://'} className={'ppx:font-mono'} />
                            </Field>
                        )}
                        {!steam && (
                            <Field label={'Client ID'}>
                                <Input value={draft.client_id ?? ''} onChange={(event) => set({ client_id: event.target.value })} autoComplete={'off'} className={'ppx:font-mono'} />
                            </Field>
                        )}
                        <Field label={steam ? 'Steam Web API key (optional)' : 'Client secret'} hint={provider.secret ? 'Stored encrypted. Type a new one to replace it.' : undefined}>
                            <Input type={'password'} value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={provider.secret ? '••••••••' : ''} autoComplete={'new-password'} className={'ppx:font-mono'} />
                        </Field>
                        {!steam && (
                            <Field label={'Scopes'} hint={'Empty uses the usual ones for this provider.'}>
                                <Input value={draft.scopes ?? ''} onChange={(event) => set({ scopes: event.target.value })} className={'ppx:font-mono'} />
                            </Field>
                        )}
                        <Field label={'Button picture'} hint={'An image address instead of the icon. Empty uses the icon.'}>
                            <Input value={draft.icon ?? ''} onChange={(event) => set({ icon: event.target.value })} placeholder={'https://'} />
                        </Field>
                        <Field label={'Button border color'}>
                            <div className={'ppx:flex ppx:items-center ppx:gap-2'}>
                                <input type={'color'} value={draft.color ?? '#888888'} onChange={(event) => set({ color: event.target.value })} aria-label={'Button border color'} className={'ppx-color-input ppx:h-8 ppx:w-10'} />
                                {draft.color && (
                                    <Button.Text size={'small'} onClick={() => set({ color: null })}>
                                        None
                                    </Button.Text>
                                )}
                            </div>
                        </Field>
                    </div>
                    <Switch
                        checked={draft.allow_signup}
                        onChange={(allow_signup) => set({ allow_signup })}
                        label={'New people may sign up with it'}
                        description={'When sign-up or "Make an account on first sign-in" is on in Prism Auth\'s settings.'}
                        controlPosition={'end'}
                        className={'ppx:w-full'}
                    />
                    {test && (
                        <Alert type={test.ok ? 'success' : 'warning'}>
                            {test.ok ? 'Everything that can be checked without signing in looks right. Sign in with it to be sure.' : test.problems.join(' ')}
                        </Alert>
                    )}
                    <div className={'ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-2'}>
                        <Button size={'small'} disabled={!changed} isLoading={busy} onClick={() => void save()}>
                            Save
                        </Button>
                        <Button.Text size={'small'} onClick={() => void runTest()}>
                            Check the setup
                        </Button.Text>
                        <Button.Danger size={'small'} isSecondary className={'ppx:ml-auto'} onClick={() => setDeleting(true)}>
                            Remove
                        </Button.Danger>
                    </div>
                </div>
            )}

            {deleting && (
                <Dialog.Confirm
                    open
                    title={`Remove ${provider.name}?`}
                    confirm={'Remove'}
                    onClose={() => setDeleting(false)}
                    onConfirmed={async () => {
                        try {
                            await http.delete(`${API}/${provider.id}`);
                            setDeleting(false);
                            await onSaved();
                        } catch (error) {
                            toast.error(httpErrorToHuman(error));
                        }
                    }}
                >
                    Everyone who linked {provider.name} is unlinked, and its sign-in button goes away.
                </Dialog.Confirm>
            )}
        </div>
    );
}
