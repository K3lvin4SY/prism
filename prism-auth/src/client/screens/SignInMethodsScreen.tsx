import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, ButtonStyle, Dialog, PageContentBlock, Spinner, fromNow, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { methodsQuery, redirectUrl, unlink, type Methods } from '../api';
import { ProviderTile } from '../components/ProviderMark';
import { NamedIcon } from '../icons';
import { clearStatus, failureMessage, peekStatus } from '../lib/messages';

type Row = Methods['providers'][number];

/** The account page's "Sign-in methods": each provider, linked or not, and the password. */
export default function SignInMethodsScreen() {
    const query = useQuery(methodsQuery);
    const client = useQueryClient();
    const [status] = useState(() => {
        const found = peekStatus('linked', 'error');
        clearStatus();

        return found;
    });
    const [unlinking, setUnlinking] = useState<Row | null>(null);
    const [busy, setBusy] = useState(false);

    const data = query.data;
    const only = (data?.methods ?? 0) <= 1;
    const nameOf = (slug: string | null) => data?.providers.find((provider) => provider.slug === slug)?.name ?? null;

    return (
        <PageContentBlock title={'Sign-in methods'}>
            <div className={'pau:mx-auto pau:flex pau:max-w-3xl pau:flex-col pau:gap-4'}>
                {status?.status === 'linked' && <Alert type={'success'}>{nameOf(status.provider) ?? 'The provider'} is linked. You can sign in with it now.</Alert>}
                {status?.status === 'error' && <Alert type={'danger'}>{failureMessage(status.reason, nameOf(status.provider))}</Alert>}

                {query.isLoading && (
                    <div className={'pau:flex pau:justify-center pau:py-10'}>
                        <Spinner />
                    </div>
                )}
                {query.isError && <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>}

                {data && (
                    <>
                        <div className={'pt-surface pau:overflow-hidden pau:rounded-lg pau:border pau:border-border pau:bg-card'}>
                            <div className={'pau:px-5 pau:py-4'}>
                                <h1 className={'pau:font-header pau:text-lg pau:font-semibold'}>Sign-in methods</h1>
                                <p className={'pau:text-sm pau:text-muted-foreground'}>Account · {data.username}</p>
                            </div>

                            <MethodRow
                                tile={
                                    <span className={'pau:flex pau:size-10 pau:shrink-0 pau:items-center pau:justify-center pau:rounded-lg pau:border pau:border-border pau:bg-muted/40 pau:text-muted-foreground'}>
                                        <NamedIcon name={'lock'} size={20} />
                                    </span>
                                }
                                name={'Password'}
                                detail={data.password ? 'Your username or email and password' : 'Set one under Account to sign in without a provider'}
                                status={data.password ? <Status on label={'Set'} /> : <Status label={'Not set'} />}
                            />

                            {data.providers.length === 0 && <p className={'pau:border-t pau:border-border pau:px-5 pau:py-6 pau:text-center pau:text-sm pau:text-muted-foreground'}>No sign-in providers have been set up on this panel yet.</p>}

                            {data.providers.map((provider) => (
                                <MethodRow
                                    key={provider.slug}
                                    tile={<ProviderTile provider={provider} />}
                                    name={provider.name}
                                    detail={
                                        provider.identity
                                            ? (provider.identity.email ?? provider.identity.name ?? (provider.identity.last_used_at ? `Last used ${fromNow(provider.identity.last_used_at)}` : `Linked ${fromNow(provider.identity.linked_at)}`))
                                            : 'Not linked'
                                    }
                                    title={provider.identity ? (provider.identity.last_used_at ? `Last used ${fromNow(provider.identity.last_used_at)}` : `Linked ${fromNow(provider.identity.linked_at)}`) : undefined}
                                    status={provider.identity ? <Status on label={'Linked'} /> : null}
                                    action={
                                        provider.identity ? (
                                            <Button.Text size={'small'} disabled={only} title={only ? 'This is your only way to sign in. Set a password or link another provider first.' : undefined} onClick={() => setUnlinking(provider)}>
                                                Unlink
                                            </Button.Text>
                                        ) : provider.enabled ? (
                                            <ButtonStyle as={'a'} href={redirectUrl(provider.slug, 'link')} size={'small'} className={'pau:no-underline'}>
                                                Link
                                            </ButtonStyle>
                                        ) : null
                                    }
                                />
                            ))}
                        </div>

                        {only && data.providers.some((provider) => provider.identity) && <p className={'pau:-mt-2 pau:text-xs pau:text-muted-foreground'}>You need at least one way to sign in, so your only one cannot be unlinked.</p>}

                        {(data.matched_by_email || data.admin_unmatched) && (
                            <div className={'pt-surface pau:flex pau:items-center pau:gap-3 pau:rounded-lg pau:border pau:border-primary/25 pau:bg-primary/10 pau:px-5 pau:py-4 pau:text-sm'}>
                                <NamedIcon name={'mail'} size={20} className={'pau:shrink-0 pau:text-primary'} />
                                <span>
                                    {data.matched_by_email
                                        ? 'Signing in with a provider that has confirmed this account\'s email links it here by itself.'
                                        : 'Providers are matched to accounts by email, but not admin accounts: link yours here.'}
                                </span>
                            </div>
                        )}

                        <p className={'pau:text-xs pau:text-muted-foreground'}>Your two-factor code is still asked for when you have it turned on.</p>
                    </>
                )}
            </div>

            {unlinking?.identity && (
                <Dialog.Confirm
                    open
                    title={`Unlink ${unlinking.name}?`}
                    confirm={'Unlink'}
                    pending={busy}
                    onClose={() => setUnlinking(null)}
                    onConfirmed={async () => {
                        setBusy(true);
                        try {
                            await unlink(unlinking.identity!.id);
                            toast.success(`${unlinking.name} is unlinked.`);
                            setUnlinking(null);
                            await client.invalidateQueries({ queryKey: methodsQuery.queryKey });
                        } catch (error) {
                            toast.error(httpErrorToHuman(error));
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    You will not be able to sign in with {unlinking.name} until you link it again.
                </Dialog.Confirm>
            )}
        </PageContentBlock>
    );
}

/** A row of the sign-in methods card: tile, name and detail, status, action. */
function MethodRow({ tile, name, detail, title, status, action }: { tile: ReactNode; name: string; detail: string; title?: string; status: ReactNode; action?: ReactNode }) {
    return (
        <div className={'pau:grid pau:grid-cols-[auto_minmax(0,1fr)_auto] pau:items-center pau:gap-x-4 pau:gap-y-1 pau:border-t pau:border-border pau:px-5 pau:py-3 pau:sm:grid-cols-[auto_minmax(0,1fr)_8rem_auto]'}>
            {tile}
            <div className={'pau:min-w-0'} title={title}>
                <div className={'pau:truncate pau:font-semibold'}>{name}</div>
                <div className={'pau:truncate pau:text-sm pau:text-muted-foreground'}>{detail}</div>
            </div>
            <div className={'pau:hidden pau:sm:block'}>{status}</div>
            <div className={'pau:flex pau:justify-end'}>{action}</div>
        </div>
    );
}

function Status({ on = false, label }: { on?: boolean; label: string }) {
    return (
        <span className={on ? 'pau:inline-flex pau:items-center pau:gap-2 pau:text-sm pau:text-success' : 'pau:inline-flex pau:items-center pau:gap-2 pau:text-sm pau:text-muted-foreground'}>
            <span className={on ? 'pau:size-2 pau:rounded-full pau:bg-success' : 'pau:size-2 pau:rounded-full pau:bg-muted-foreground/50'} />
            {label}
        </span>
    );
}
