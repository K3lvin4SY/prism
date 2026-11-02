import { useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Dialog, Input, Spinner, formatDate, fromNow, httpErrorToHuman, toast, useDebouncedCallback } from '@pterodactyl/sdk';
import { clearLog, getLog, logKey, type LogEntry } from '../api';
import { NamedIcon } from '../icons';

const STATUS: Record<LogEntry['status'], { label: string; tone: 'success' | 'neutral' | 'danger'; help: string }> = {
    sent: { label: 'Sent', tone: 'success', help: 'The mail server took it. Whether it reached the inbox is up to the mail server and the recipient.' },
    sending: { label: 'Sending', tone: 'neutral', help: 'Handed to the mailer a moment ago.' },
    unconfirmed: { label: 'Not confirmed', tone: 'danger', help: 'The mail server never took it. Check the mail settings and the panel\'s log.' },
};

/** Every email handed to the mailer, newest first. */
export default function DeliveryLog() {
    const client = useQueryClient();
    const [search, setSearch] = useState('');
    const [typed, setTyped] = useState('');
    const [page, setPage] = useState(1);
    const [clearing, setClearing] = useState(false);
    const [busy, setBusy] = useState(false);
    const query = useQuery({ queryKey: logKey(search, page), queryFn: () => getLog(search, page), placeholderData: keepPreviousData });
    const find = useDebouncedCallback((text: string) => {
        setSearch(text.trim());
        setPage(1);
    }, 300);

    const meta = query.data?.meta;

    return (
        <section className={'pt-surface pml:overflow-hidden pml:rounded-xl pml:border pml:border-border pml:bg-card'}>
            <header className={'pml:flex pml:flex-wrap pml:items-center pml:gap-3 pml:border-b pml:border-border pml:px-5 pml:py-4'}>
                <div className={'pml:min-w-0 pml:flex-1'}>
                    <h2 className={'pml:font-header pml:text-lg pml:font-semibold'}>Delivery log</h2>
                    <p className={'pml:text-sm pml:text-muted-foreground'}>Who each email went to and whether the mail server took it. The emails themselves are not kept.</p>
                </div>
                <div className={'pml:w-64'}>
                    <Input
                        value={typed}
                        placeholder={'Search address or subject'}
                        onChange={(event) => {
                            setTyped(event.target.value);
                            find(event.target.value);
                        }}
                    />
                </div>
                <Button.Danger size={'small'} isSecondary disabled={!meta?.total} onClick={() => setClearing(true)}>
                    Clear log
                </Button.Danger>
            </header>

            {query.isLoading && (
                <div className={'pml:flex pml:justify-center pml:py-10'}>
                    <Spinner />
                </div>
            )}
            {query.isError && (
                <div className={'pml:p-5'}>
                    <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>
                </div>
            )}
            {query.data?.data.length === 0 && (
                <div className={'pml:flex pml:flex-col pml:items-center pml:gap-2 pml:py-12 pml:text-center pml:text-sm pml:text-muted-foreground'}>
                    <NamedIcon name={'mail'} size={24} />
                    {search ? 'Nothing matches that search.' : 'No emails sent yet. Send yourself a test from the Emails tab.'}
                </div>
            )}
            {query.data && query.data.data.length > 0 && (
                <div className={'pml:overflow-x-auto'}>
                    <table className={'pml:w-full pml:text-sm'}>
                        <thead>
                            <tr className={'pml:border-b pml:border-border pml:text-left pml:text-xs pml:uppercase pml:tracking-wide pml:text-muted-foreground'}>
                                <th className={'pml:px-5 pml:py-2 pml:font-medium'}>When</th>
                                <th className={'pml:px-3 pml:py-2 pml:font-medium'}>To</th>
                                <th className={'pml:px-3 pml:py-2 pml:font-medium'}>Subject</th>
                                <th className={'pml:px-3 pml:py-2 pml:font-medium'}>Email</th>
                                <th className={'pml:px-5 pml:py-2 pml:text-right pml:font-medium'}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {query.data.data.map((entry) => (
                                <tr key={entry.id} className={'pml:border-b pml:border-border pml:last:border-b-0'}>
                                    <td className={'pml:whitespace-nowrap pml:px-5 pml:py-2.5'} title={formatDate(entry.created_at, 'MMM D, YYYY HH:mm:ss')}>
                                        {fromNow(entry.created_at)}
                                    </td>
                                    <td className={'pml:max-w-56 pml:truncate pml:px-3 pml:py-2.5 pml:font-mono pml:text-xs'}>{entry.recipient}</td>
                                    <td className={'pml:max-w-80 pml:truncate pml:px-3 pml:py-2.5'}>{entry.subject}</td>
                                    <td className={'pml:whitespace-nowrap pml:px-3 pml:py-2.5 pml:text-muted-foreground'}>{entry.email ?? 'Other'}</td>
                                    <td className={'pml:px-5 pml:py-2.5 pml:text-right'}>
                                        <Badge size={'sm'} variant={'soft'} tone={STATUS[entry.status].tone} title={STATUS[entry.status].help}>
                                            {STATUS[entry.status].label}
                                        </Badge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {meta && meta.pages > 1 && (
                <footer className={'pml:flex pml:items-center pml:justify-end pml:gap-3 pml:border-t pml:border-border pml:px-5 pml:py-3 pml:text-sm'}>
                    <span className={'pml:text-muted-foreground'}>
                        Page {meta.page} of {meta.pages}
                    </span>
                    <Button.Text size={'small'} disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                        Newer
                    </Button.Text>
                    <Button.Text size={'small'} disabled={page >= meta.pages} onClick={() => setPage((current) => current + 1)}>
                        Older
                    </Button.Text>
                </footer>
            )}

            {clearing && (
                <Dialog.Confirm
                    open
                    title={'Clear the delivery log?'}
                    confirm={'Clear log'}
                    pending={busy}
                    onClose={() => setClearing(false)}
                    onConfirmed={async () => {
                        setBusy(true);
                        try {
                            await clearLog();
                            setClearing(false);
                            setPage(1);
                            await client.invalidateQueries({ queryKey: ['prism-mail', 'log'] });
                        } catch (error) {
                            toast.error(httpErrorToHuman(error));
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    Every entry goes. Emails already sent are not affected.
                </Dialog.Confirm>
            )}
        </section>
    );
}
