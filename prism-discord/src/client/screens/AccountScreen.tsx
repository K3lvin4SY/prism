import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Input, PageContentBlock, Spinner, fromNow, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { accountKey, getAccount, linkAccount, unlinkAccount } from '../api';
import { NamedIcon } from '../icons';

const eyebrow = 'pdc:font-mono pdc:text-xs pdc:font-medium pdc:uppercase pdc:tracking-[0.18em] pdc:text-muted-foreground';
const card = 'pt-surface pdc:rounded-xl pdc:border pdc:border-border pdc:bg-card pdc:px-5 pdc:py-4';

/** The account's "Discord" page: linking a Discord account to use /start, /stop, /restart and /status. */
export default function AccountScreen() {
    const client = useQueryClient();
    const query = useQuery({ queryKey: accountKey, queryFn: getAccount });
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const data = query.data;

    const run = async (action: () => Promise<unknown>, done: string) => {
        setBusy(true);
        try {
            await action();
            toast.success(done);
            setCode('');
            await client.invalidateQueries({ queryKey: accountKey });
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <PageContentBlock title={'Discord'}>
            <div className={'pdc:mx-auto pdc:flex pdc:max-w-3xl pdc:flex-col pdc:gap-4'}>
                {query.isLoading && <Spinner centered />}
                {query.isError && <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>}

                {data && !data.available && <Alert type={'info'}>Your administrator has not set up Discord commands on this panel yet.</Alert>}

                {data && data.available && (
                    <section className={card + ' pdc:flex pdc:flex-col pdc:gap-3'}>
                        <div>
                            <h2 className={'pdc:font-header pdc:text-lg pdc:font-semibold'}>Discord commands</h2>
                            <p className={'pdc:text-sm pdc:text-muted-foreground'}>
                                Use <code>/start</code>, <code>/stop</code>, <code>/restart</code> and <code>/status</code> in Discord on the servers you can reach here, with the same permissions as on the panel.
                            </p>
                        </div>

                        {data.linked ? (
                            <div className={'pdc:flex pdc:flex-wrap pdc:items-center pdc:gap-3'}>
                                <NamedIcon name={'message-circle'} size={18} className={'pdc:text-primary'} />
                                <div className={'pdc:min-w-0 pdc:flex-1'}>
                                    <p className={'pdc:font-semibold'}>{data.linked.name || 'Your Discord account'}</p>
                                    <p className={'pdc:text-xs pdc:text-muted-foreground'}>
                                        Linked {fromNow(data.linked.since)}
                                        {data.linked.last_used_at ? `, last command ${fromNow(data.linked.last_used_at)}` : ''}
                                    </p>
                                </div>
                                <Button.Danger size={'small'} isSecondary disabled={busy} onClick={() => void run(unlinkAccount, 'Unlinked. Discord commands no longer work for you.')}>
                                    Unlink
                                </Button.Danger>
                            </div>
                        ) : data.via_auth ? (
                            <p className={'pdc:flex pdc:items-center pdc:gap-2 pdc:text-sm'}>
                                <Badge size={'sm'} variant={'soft'} tone={'success'}>
                                    Linked
                                </Badge>
                                Through signing in with Discord as {data.via_auth}.
                            </p>
                        ) : (
                            <div className={'pdc:flex pdc:flex-col pdc:gap-2'}>
                                <span className={eyebrow}>Link your Discord account</span>
                                <p className={'pdc:text-sm pdc:text-muted-foreground'}>
                                    Type <code>/link</code> in Discord where the panel's commands are, then enter the code it gives you here. It works for 10 minutes.
                                </p>
                                <div className={'pdc:flex pdc:gap-2'}>
                                    <Input value={code} maxLength={9} placeholder={'ABCD-1234'} aria-label={'Code from /link'} onChange={(event) => setCode(event.target.value.toUpperCase())} />
                                    <Button disabled={!/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(code.trim())} isLoading={busy} onClick={() => void run(() => linkAccount(code.trim()), 'Linked. Try /status in Discord.')}>
                                        Link
                                    </Button>
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {data?.commands && (
                    <section className={card + ' pdc:flex pdc:flex-col pdc:gap-2'}>
                        <span className={eyebrow}>For administrators</span>
                        {!data.commands.configured ? (
                            <p className={'pdc:text-sm pdc:text-muted-foreground'}>Fill in the application id, public key and bot token in Prism Properties, under Prism Discord, Slash commands.</p>
                        ) : data.commands.registered ? (
                            <p className={'pdc:text-sm'}>The commands are on your Discord application.</p>
                        ) : data.commands.error ? (
                            <Alert type={'danger'}>{data.commands.error} Fix the settings in Prism Properties; it is tried again within an hour, or at once after a change.</Alert>
                        ) : (
                            <p className={'pdc:text-sm pdc:text-muted-foreground'}>The commands go on your Discord application within a minute.</p>
                        )}
                        <p className={'pdc:text-sm pdc:text-muted-foreground'}>
                            Interactions Endpoint URL for the Discord Developer Portal: <code className={'pdc:break-all'}>{data.endpoint}</code>
                        </p>
                    </section>
                )}
            </div>
        </PageContentBlock>
    );
}
