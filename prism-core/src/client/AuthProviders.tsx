import { useState } from 'react';
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

function markFor(provider: { type: string; name: string }): string {
    if (MARKS[provider.type]) return MARKS[provider.type];
    if (/entra|microsoft|azure/i.test(provider.name)) return 'brand-windows';
    if (/gitlab/i.test(provider.name)) return 'brand-gitlab';
    if (/auth0/i.test(provider.name)) return 'brand-auth0';

    return 'key-round';
}

const helpFor = (provider: { type: string; name: string }) => (PRESETS.find((preset) => preset.type === provider.type && preset.name === provider.name) ?? PRESETS.find((preset) => preset.type === provider.type))?.help;

const API = '/api/admin/extensions/prism-auth/providers';
const KEY = ['prism-core', 'auth-providers'];

/**
 * Prism Auth's sign-in providers. They are saved on their own, straight away, rather than with the
 * page's other settings, because each holds a secret the page never gets back.
 */
export function ProvidersEditor() {
    const client = useQueryClient();
    const query = useQuery({ queryKey: KEY, queryFn: async () => (await http.get<{ data: AuthProvider[] }>(API)).data.data });
    const [adding, setAdding] = useState(false);
    const [open, setOpen] = useState<number | null>(null);
    const providers = query.data ?? [];
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

    const move = async (index: number, by: number) => {
        const ids = providers.map((provider) => provider.id);
        const [moved] = ids.splice(index, 1);
        ids.splice(index + by, 0, moved);
        await http.put(`${API}/order`, { ids }).catch((error) => toast.error(httpErrorToHuman(error)));
        await reload();
    };

    if (query.isLoading) return <Spinner size={'small'} />;
    if (query.isError) return <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>;

    return (
        <div className={'ppx:flex ppx:flex-col ppx:gap-2'}>
            {providers.length === 0 && <p className={'ppx:text-sm ppx:text-muted-foreground'}>No providers yet. Add one, fill in its client ID and secret, then switch it on.</p>}
            {providers.map((provider, index) => (
                <ProviderCard
                    key={provider.id}
                    provider={provider}
                    open={open === provider.id}
                    onToggle={() => setOpen(open === provider.id ? null : provider.id)}
                    onMove={(by) => void move(index, by)}
                    first={index === 0}
                    last={index === providers.length - 1}
                    onSaved={reload}
                />
            ))}
            <div>
                <Button size={'small'} isSecondary onClick={() => setAdding(true)}>
                    <NamedIcon name={'plus'} size={14} /> Add a provider
                </Button>
            </div>

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
                                <NamedIcon name={markFor(preset)} size={22} />
                                <span className={'ppx:min-w-0'}>
                                    <span className={'ppx:block ppx:text-sm ppx:font-medium'}>{preset.name}</span>
                                    <span className={'ppx:block ppx:text-xs ppx:text-muted-foreground'}>{preset.type === 'oidc' ? 'OpenID Connect' : 'OAuth'}</span>
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
    first,
    last,
    onSaved,
}: {
    provider: AuthProvider;
    open: boolean;
    onToggle: () => void;
    onMove: (by: number) => void;
    first: boolean;
    last: boolean;
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
        <div className={'pt-surface ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card'}>
            <div className={'ppx:flex ppx:items-center ppx:gap-3 ppx:p-3'}>
                <button type={'button'} onClick={onToggle} className={'ppx:flex ppx:min-w-0 ppx:flex-1 ppx:items-center ppx:gap-3 ppx:text-left ppx:cursor-pointer'} aria-expanded={open}>
                    <NamedIcon name={markFor(provider)} size={22} />
                    <span className={'ppx:min-w-0'}>
                        <span className={'ppx:block ppx:truncate ppx:text-sm ppx:font-medium'}>{provider.name}</span>
                        <span className={'ppx:block ppx:truncate ppx:text-xs ppx:text-muted-foreground'}>{provider.enabled ? provider.label : ready ? 'Off' : 'Needs its client ID and secret'}</span>
                    </span>
                    <NamedIcon name={open ? 'chevron-up' : 'chevron-down'} size={16} className={'ppx:ml-auto ppx:text-muted-foreground'} />
                </button>
                <Button.Text size={'small'} disabled={first} onClick={() => onMove(-1)} aria-label={'Move up'}>
                    <NamedIcon name={'arrow-up'} size={14} />
                </Button.Text>
                <Button.Text size={'small'} disabled={last} onClick={() => onMove(1)} aria-label={'Move down'}>
                    <NamedIcon name={'arrow-down'} size={14} />
                </Button.Text>
                <Switch checked={provider.enabled} disabled={!provider.enabled && !ready} onChange={(enabled) => void save({ enabled })} aria-label={`Use ${provider.name}`} />
            </div>

            {open && (
                <div className={'ppx:flex ppx:flex-col ppx:gap-3 ppx:border-t ppx:border-border ppx:p-3'}>
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
                                <input type={'color'} value={draft.color ?? '#888888'} onChange={(event) => set({ color: event.target.value })} aria-label={'Button border color'} />
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
