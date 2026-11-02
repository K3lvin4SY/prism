import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert as Notice, Badge, Button, fromNow, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { alertsKey, getAlerts, readAlerts, type Alert } from '../api';
import { NamedIcon } from '../icons';

const RULES: Record<Alert['rule'], string> = {
    new_ip: 'New address',
    failed: 'Failed sign-ins',
    two_factor: 'Two-factor off',
    admin: 'Admin action',
};

/** The alerts the rules raised, newest first, folded away until there is something unread. */
export default function AlertsPanel({ enabled }: { enabled: boolean }) {
    const client = useQueryClient();
    const query = useQuery({ queryKey: alertsKey, queryFn: getAlerts, refetchInterval: 60_000 });
    const [open, setOpen] = useState<boolean | null>(null);
    const unread = query.data?.meta.unread ?? 0;
    const shown = open ?? unread > 0;

    const markRead = async () => {
        try {
            await readAlerts();
            await client.invalidateQueries({ queryKey: alertsKey });
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        }
    };

    return (
        <section className={'pt-surface pad:overflow-hidden pad:rounded-xl pad:border pad:border-border pad:bg-card'}>
            <header className={'pad:flex pad:flex-wrap pad:items-center pad:gap-3 pad:px-5 pad:py-3'}>
                <button type={'button'} className={'pad:flex pad:min-w-0 pad:flex-1 pad:items-center pad:gap-2 pad:text-left'} aria-expanded={shown} onClick={() => setOpen(!shown)}>
                    <NamedIcon name={shown ? 'chevron-down' : 'chevron-right'} size={16} />
                    <NamedIcon name={'bell'} size={16} />
                    <span className={'pad:font-semibold'}>Alerts</span>
                    {unread > 0 && (
                        <Badge size={'sm'} variant={'solid'} tone={'danger'}>
                            {unread} new
                        </Badge>
                    )}
                    {!enabled && <span className={'pad:text-sm pad:text-muted-foreground'}>Off in Prism Properties</span>}
                </button>
                {unread > 0 && (
                    <Button.Text size={'small'} onClick={() => void markRead()}>
                        Mark all read
                    </Button.Text>
                )}
            </header>

            {shown && (
                <div className={'pad:border-t pad:border-border'}>
                    {query.isError && (
                        <div className={'pad:p-4'}>
                            <Notice type={'danger'}>{httpErrorToHuman(query.error)}</Notice>
                        </div>
                    )}
                    {query.data?.data.length === 0 && <p className={'pad:px-5 pad:py-6 pad:text-center pad:text-sm pad:text-muted-foreground'}>{enabled ? 'Nothing risky spotted yet.' : 'Turn alerts on in Prism Properties, under Prism Audit.'}</p>}
                    <ul className={'pad:max-h-80 pad:overflow-y-auto'}>
                        {query.data?.data.map((alert) => (
                            <li key={alert.id} className={'pad:flex pad:items-start pad:gap-3 pad:border-b pad:border-border pad:px-5 pad:py-2.5 pad:text-sm pad:last:border-b-0 ' + (alert.read ? 'pad:opacity-70' : '')}>
                                <Badge size={'sm'} variant={'soft'} tone={alert.rule === 'admin' ? 'warning' : 'danger'} className={'pad:shrink-0'}>
                                    {RULES[alert.rule] ?? alert.rule}
                                </Badge>
                                <span className={'pad:min-w-0 pad:flex-1'}>{alert.summary}</span>
                                <span className={'pad:shrink-0 pad:text-xs pad:text-muted-foreground'}>{fromNow(alert.created_at)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}
