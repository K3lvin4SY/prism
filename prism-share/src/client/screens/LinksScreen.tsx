import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Dialog, ServerContentBlock, Spinner, formatDate, fromNow, httpErrorToHuman, toast, useCurrentServerRequired } from '@pterodactyl/sdk';
import { activityKey, getActivity, getLinks, linksKey, revokeLink, type Links, type ShareActivity, type ShareLink } from '../api';
import LinkDialog from '../components/LinkDialog';
import { NamedIcon } from '../icons';
import { optionLabel, optionShort, timeLeft } from '../lib/options';

const eyebrow = 'psh:font-mono psh:text-xs psh:font-medium psh:uppercase psh:tracking-[0.18em] psh:text-muted-foreground';
// Name, what it allows, how long it has left, its buttons; one column each from md up.
const columns = 'psh:grid psh:items-center psh:gap-x-4 psh:gap-y-2 psh:md:grid-cols-[minmax(9rem,1.1fr)_minmax(0,2fr)_7.5rem_12rem]';

/** The server's "Share links" page: guest links in a table, what each allows, and what they did. */
export default function LinksScreen() {
    const server = useCurrentServerRequired();
    const id = server.attributes.identifier;
    const client = useQueryClient();
    const query = useQuery({ queryKey: linksKey(id), queryFn: () => getLinks(id) });
    // Hidden for someone who may not read the server's activity.
    const activity = useQuery({ queryKey: activityKey(id), queryFn: () => getActivity(id), retry: false });
    const [editing, setEditing] = useState<ShareLink | 'new' | null>(null);
    const [revoking, setRevoking] = useState<ShareLink | null>(null);
    const [busy, setBusy] = useState(false);

    const refresh = () => Promise.all([client.invalidateQueries({ queryKey: linksKey(id) }), client.invalidateQueries({ queryKey: activityKey(id) })]);

    return (
        <ServerContentBlock title={'Share links'}>
            <div className={'psh:flex psh:flex-col psh:gap-5'}>
                <section className={'pt-surface psh:overflow-hidden psh:rounded-xl psh:border psh:border-border psh:bg-card'}>
                    <header className={'psh:flex psh:flex-wrap psh:items-center psh:gap-3 psh:border-b psh:border-border psh:px-5 psh:py-4'}>
                        <div className={'psh:min-w-0 psh:flex-1'}>
                            <div className={'psh:flex psh:flex-wrap psh:items-baseline psh:gap-x-3'}>
                                <h1 className={'psh:font-header psh:text-lg psh:font-semibold'}>Share links</h1>
                                <span className={eyebrow + ' psh:truncate'}>{server.attributes.name}</span>
                            </div>
                            <p className={'psh:text-sm psh:text-muted-foreground'}>Let someone watch or download without an account. A link never allows more than you can do.</p>
                        </div>
                        <Button disabled={!query.data} onClick={() => setEditing('new')}>
                            <NamedIcon name={'plus'} size={16} className={'psh:mr-1'} /> New link
                        </Button>
                    </header>

                    {query.isLoading && (
                        <div className={'psh:flex psh:justify-center psh:py-10'}>
                            <Spinner />
                        </div>
                    )}
                    {query.isError && (
                        <div className={'psh:p-5'}>
                            <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>
                        </div>
                    )}
                    {query.data?.links.length === 0 && (
                        <div className={'psh:flex psh:flex-col psh:items-center psh:gap-2 psh:py-12 psh:text-center psh:text-sm psh:text-muted-foreground'}>
                            <NamedIcon name={'link'} size={24} />
                            No share links yet.
                        </div>
                    )}

                    {query.data && query.data.links.length > 0 && (
                        <div role={'table'} aria-label={'Share links'}>
                            <div role={'row'} className={columns + ' psh:hidden psh:border-b psh:border-border psh:px-5 psh:py-2 psh:md:grid'}>
                                {['Name', 'Allows', 'Expires', ''].map((heading, index) => (
                                    <span key={index} role={'columnheader'} className={eyebrow}>
                                        {heading}
                                    </span>
                                ))}
                            </div>
                            {query.data.links.map((link) => (
                                <LinkRow key={link.id} link={link} data={query.data} onChange={() => setEditing(link)} onRevoke={() => setRevoking(link)} />
                            ))}
                        </div>
                    )}
                </section>

                {activity.data && activity.data.length > 0 && <ActivityLog entries={activity.data} />}
            </div>

            {editing && query.data && (
                <LinkDialog
                    server={id}
                    data={query.data}
                    link={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        // A new link stays open to show its address; a changed one closes.
                        if (editing !== 'new') {
                            setEditing(null);
                            toast.success('Saved. Anyone on the page now has only what the link allows.');
                        }
                        void refresh();
                    }}
                />
            )}

            {revoking && (
                <Dialog.Confirm
                    open
                    title={`Revoke "${revoking.label}"?`}
                    confirm={'Revoke'}
                    pending={busy}
                    onClose={() => setRevoking(null)}
                    onConfirmed={async () => {
                        setBusy(true);
                        try {
                            await revokeLink(id, revoking.id);
                            toast.success('Revoked. Anyone using it was disconnected.');
                            setRevoking(null);
                            await refresh();
                        } catch (error) {
                            toast.error(httpErrorToHuman(error));
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    The link stops working at once, and anyone watching through it is disconnected.
                </Dialog.Confirm>
            )}
        </ServerContentBlock>
    );
}

function LinkRow({ link, data, onChange, onRevoke }: { link: ShareLink; data: Links; onChange: () => void; onRevoke: () => void }) {
    const lost = link.active ? link.permissions.filter((option) => !link.effective.includes(option)) : [];
    const backups = data.backups.filter((backup) => link.backups.includes(backup.uuid));

    const badge = (option: ShareLink['permissions'][number]) => {
        if (option === 'backups' && backups.length === 1) return `Backup: ${backups[0].name}`;
        if (option === 'backups' && link.backups.length > 1) return `Backups: ${link.backups.length}`;

        return optionShort(option);
    };

    return (
        <div role={'row'} className={columns + ' psh:border-b psh:border-border psh:px-5 psh:py-3.5 psh:last:border-b-0 ' + (link.active ? '' : 'psh:opacity-55')}>
            <div role={'cell'} className={'psh:min-w-0'}>
                <p className={'psh:truncate psh:font-semibold ' + (link.active ? 'psh:text-foreground' : 'psh:text-muted-foreground')}>{link.label}</p>
                <p className={'psh:truncate psh:text-xs psh:text-muted-foreground'}>
                    by {link.by} · {link.uses === 0 ? 'not opened yet' : `opened ${link.uses}×, last ${fromNow(link.last_used_at!)}`}
                </p>
            </div>

            <div role={'cell'} className={'psh:flex psh:min-w-0 psh:flex-wrap psh:gap-1.5'}>
                {link.permissions.map((option) => (
                    <Badge
                        key={option}
                        size={'sm'}
                        variant={'soft'}
                        tone={lost.includes(option) ? 'danger' : 'neutral'}
                        title={lost.includes(option) ? `${optionLabel(option)}: no longer allowed. The person who saved the link lost that permission, or your administrator turned it off.` : option === 'files' ? link.paths.join(', ') : undefined}
                    >
                        {badge(option)}
                    </Badge>
                ))}
            </div>

            <div role={'cell'} className={'psh:text-sm ' + (link.active ? 'psh:text-foreground' : 'psh:text-muted-foreground')} title={formatDate(link.expires_at, 'MMM D, YYYY HH:mm')}>
                {link.revoked_at ? 'Revoked' : !link.active ? 'Expired' : timeLeft(link.expires_at)}
            </div>

            <div role={'cell'} className={'psh:flex psh:justify-end psh:gap-2'}>
                {link.active && (
                    <>
                        <Button.Text size={'small'} onClick={onChange}>
                            <NamedIcon name={'pencil'} size={14} className={'psh:mr-1'} /> Change
                        </Button.Text>
                        <Button.Danger size={'small'} isSecondary onClick={onRevoke}>
                            Revoke
                        </Button.Danger>
                    </>
                )}
            </div>

            {lost.length > 0 && (
                <p className={'psh:text-xs psh:text-destructive psh:md:col-span-4'}>No longer allowed: {lost.map(optionLabel).join(', ')}. The person who saved the link lost that permission, or your administrator turned it off.</p>
            )}
        </div>
    );
}

/** The latest share link activity, from the server's activity log. */
function ActivityLog({ entries }: { entries: ShareActivity[] }) {
    const today = new Date().toDateString();

    return (
        <section className={'pt-surface psh:rounded-xl psh:border psh:border-border psh:bg-card psh:px-5 psh:py-4'}>
            <h2 className={eyebrow + ' psh:mb-3'}>Activity log</h2>
            <div className={'psh:flex psh:flex-col psh:gap-1.5 psh:font-mono psh:text-sm'}>
                {entries.map((entry) => {
                    const detail = ['file', 'backup', 'signal', 'command'].map((key) => entry.properties[key]).find((value) => typeof value === 'string');

                    return (
                        <div key={entry.id} className={'psh:grid psh:grid-cols-[4.5rem_minmax(0,14rem)_minmax(0,1fr)] psh:gap-4'}>
                            <span className={'psh:text-muted-foreground'} title={formatDate(entry.timestamp, 'MMM D, YYYY HH:mm:ss')}>
                                {new Date(entry.timestamp).toDateString() === today ? formatDate(entry.timestamp, 'HH:mm') : formatDate(entry.timestamp, 'MMM D')}
                            </span>
                            <span className={'psh:truncate psh:text-foreground'}>{entry.event}</span>
                            <span className={'psh:truncate psh:text-muted-foreground'}>
                                {String(entry.properties.link ?? '')}
                                {detail ? ` · ${detail as string}` : ''}
                            </span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
