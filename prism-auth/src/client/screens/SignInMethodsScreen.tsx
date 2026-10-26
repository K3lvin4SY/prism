import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, ButtonStyle, Dialog, PageContentBlock, Spinner, fromNow, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { methodsQuery, redirectUrl, unlink, type Methods } from '../api';
import ProviderMark from '../components/ProviderMark';
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
                <div>
                    <h1 className={'pau:font-header pau:text-xl pau:font-semibold'}>Sign-in methods</h1>
                    <p className={'pau:text-sm pau:text-muted-foreground'}>Link an account from another service to sign in with it. Your two-factor code is still asked for when you have it turned on.</p>
                </div>

                {status?.status === 'linked' && <Alert type={'success'}>{nameOf(status.provider) ?? 'The provider'} is linked. You can sign in with it now.</Alert>}
                {status?.status === 'error' && <Alert type={'danger'}>{failureMessage(status.reason, nameOf(status.provider))}</Alert>}

                {query.isLoading && (
                    <div className={'pau:flex pau:justify-center pau:py-10'}>
                        <Spinner />
                    </div>
                )}
                {query.isError && <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>}

                {data && (
                    <div className={'pau:flex pau:flex-col pau:gap-2'}>
                        <div className={'pt-surface pau:flex pau:items-center pau:gap-3 pau:rounded-lg pau:border pau:border-border pau:bg-card pau:p-4'}>
                            <div className={'pau:flex pau:size-10 pau:shrink-0 pau:items-center pau:justify-center pau:rounded-lg pau:bg-muted'}>
                                <NamedIcon name={'lock'} size={20} />
                            </div>
                            <div className={'pau:min-w-0 pau:flex-1'}>
                                <div className={'pau:font-medium'}>Password</div>
                                <div className={'pau:text-sm pau:text-muted-foreground'}>
                                    {data.password ? 'You can sign in with your username or email and password.' : 'Not set yet. Set one under Account to sign in without a provider.'}
                                </div>
                            </div>
                            <Badge variant={'soft'} tone={data.password ? 'success' : 'neutral'}>{data.password ? 'Set' : 'Not set'}</Badge>
                        </div>

                        {data.providers.length === 0 && <p className={'pau:py-6 pau:text-center pau:text-sm pau:text-muted-foreground'}>No sign-in providers have been set up on this panel yet.</p>}

                        {data.providers.map((provider) => (
                            <div key={provider.slug} className={'pt-surface pau:flex pau:flex-wrap pau:items-center pau:gap-3 pau:rounded-lg pau:border pau:border-border pau:bg-card pau:p-4'}>
                                <div className={'pau:flex pau:size-10 pau:shrink-0 pau:items-center pau:justify-center pau:overflow-hidden pau:rounded-lg pau:bg-muted'}>
                                    {provider.identity?.avatar ? <img src={provider.identity.avatar} alt={''} className={'pau:size-10 pau:object-cover'} /> : <ProviderMark provider={provider} />}
                                </div>
                                <div className={'pau:min-w-0 pau:flex-1'}>
                                    <div className={'pau:flex pau:items-center pau:gap-2 pau:font-medium'}>
                                        {provider.identity?.avatar && <ProviderMark provider={provider} size={16} />}
                                        {provider.name}
                                    </div>
                                    <div className={'pau:truncate pau:text-sm pau:text-muted-foreground'}>
                                        {provider.identity
                                            ? [provider.identity.name ?? provider.identity.email, provider.identity.last_used_at ? `last used ${fromNow(provider.identity.last_used_at)}` : `linked ${fromNow(provider.identity.linked_at)}`].filter(Boolean).join(' · ')
                                            : 'Not linked'}
                                    </div>
                                </div>
                                {provider.identity ? (
                                    <Button.Text size={'small'} disabled={only} title={only ? 'This is your only way to sign in. Set a password or link another provider first.' : undefined} onClick={() => setUnlinking(provider)}>
                                        <NamedIcon name={'unlink'} size={16} className={'pau:mr-1'} /> Unlink
                                    </Button.Text>
                                ) : provider.enabled ? (
                                    <ButtonStyle as={'a'} href={redirectUrl(provider.slug, 'link')} size={'small'} className={'pau:no-underline'}>
                                        <NamedIcon name={'link'} size={16} className={'pau:mr-1'} /> Link
                                    </ButtonStyle>
                                ) : null}
                            </div>
                        ))}
                        {only && data.providers.some((provider) => provider.identity) && <p className={'pau:text-xs pau:text-muted-foreground'}>You need at least one way to sign in, so your only one cannot be unlinked.</p>}
                    </div>
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
