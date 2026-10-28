import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Dialog, Input, ServerContentBlock, Spinner, formatDate, fromNow, httpErrorToHuman, toast, useCurrentServerRequired } from '@pterodactyl/sdk';
import { getLinks, linksKey, revokeLink, shareUrl, type ShareLink } from '../api';
import LinkDialog from '../components/LinkDialog';
import { NamedIcon } from '../icons';
import { optionLabel } from '../lib/options';

/** The server's "Share links" page: guest links, what each allows, and revoking them. */
export default function LinksScreen() {
    const server = useCurrentServerRequired();
    const id = server.attributes.identifier;
    const client = useQueryClient();
    const query = useQuery({ queryKey: linksKey(id), queryFn: () => getLinks(id) });
    const [editing, setEditing] = useState<ShareLink | 'new' | null>(null);
    const [revoking, setRevoking] = useState<ShareLink | null>(null);
    const [made, setMade] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const refresh = () => client.invalidateQueries({ queryKey: linksKey(id) });

    return (
        <ServerContentBlock title={'Share links'}>
            <div className={'psh:flex psh:flex-col psh:gap-4'}>
                <div className={'psh:flex psh:flex-wrap psh:items-start psh:gap-3'}>
                    <div className={'psh:min-w-0 psh:flex-1'}>
                        <h1 className={'psh:font-header psh:text-xl psh:font-semibold'}>Share links</h1>
                        <p className={'psh:text-sm psh:text-muted-foreground'}>
                            Let someone watch the console or download chosen files and backups without an account, for as long as you choose. A link never allows more than you can do, and stops
                            working the moment you revoke it.
                        </p>
                    </div>
                    <Button disabled={!query.data} onClick={() => setEditing('new')}>
                        <NamedIcon name={'plus'} size={16} className={'psh:mr-1'} /> New link
                    </Button>
                </div>

                {query.isLoading && (
                    <div className={'psh:flex psh:justify-center psh:py-10'}>
                        <Spinner />
                    </div>
                )}
                {query.isError && <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>}
                {query.data?.links.length === 0 && <p className={'psh:py-8 psh:text-center psh:text-sm psh:text-muted-foreground'}>No share links yet.</p>}

                {query.data?.links.map((link) => {
                    const lost = link.active ? link.permissions.filter((option) => !link.effective.includes(option)) : [];

                    return (
                        <div key={link.id} className={'pt-surface psh:flex psh:flex-col psh:gap-2 psh:rounded-lg psh:border psh:border-border psh:bg-card psh:p-4' + (link.active ? '' : ' psh:opacity-60')}>
                            <div className={'psh:flex psh:flex-wrap psh:items-center psh:gap-2'}>
                                <NamedIcon name={'link'} size={16} />
                                <span className={'psh:min-w-0 psh:flex-1 psh:truncate psh:font-medium'}>{link.label}</span>
                                {link.revoked_at ? (
                                    <Badge variant={'soft'} tone={'neutral'}>Revoked</Badge>
                                ) : !link.active ? (
                                    <Badge variant={'soft'} tone={'neutral'}>Expired</Badge>
                                ) : (
                                    <Badge variant={'soft'} tone={'success'}>Until {formatDate(link.expires_at, 'MMM d, HH:mm')}</Badge>
                                )}
                                {link.active && (
                                    <>
                                        <Button.Text size={'small'} onClick={() => setEditing(link)}>
                                            <NamedIcon name={'pencil'} size={14} className={'psh:mr-1'} /> Change
                                        </Button.Text>
                                        <Button.Text size={'small'} onClick={() => setRevoking(link)}>
                                            <NamedIcon name={'trash-2'} size={14} className={'psh:mr-1'} /> Revoke
                                        </Button.Text>
                                    </>
                                )}
                            </div>
                            <div className={'psh:flex psh:flex-wrap psh:gap-1'}>
                                {link.permissions.map((option) => (
                                    <Badge key={option} variant={'soft'} tone={lost.includes(option) ? 'danger' : 'neutral'}>
                                        {optionLabel(option)}
                                    </Badge>
                                ))}
                            </div>
                            {lost.length > 0 && (
                                <p className={'psh:text-xs psh:text-destructive'}>
                                    No longer allowed: {lost.map(optionLabel).join(', ')}. The person who saved the link lost that permission, or your administrator turned it off.
                                </p>
                            )}
                            {link.paths.length > 0 && <p className={'psh:truncate psh:text-xs psh:text-muted-foreground'}>Files from {link.paths.join(', ')}</p>}
                            <p className={'psh:text-xs psh:text-muted-foreground'}>
                                Saved by {link.by} · {link.uses === 0 ? 'not opened yet' : `opened ${link.uses} ${link.uses === 1 ? 'time' : 'times'}, last ${fromNow(link.last_used_at!)}`}
                            </p>
                        </div>
                    );
                })}
            </div>

            {editing && query.data && (
                <LinkDialog
                    server={id}
                    data={query.data}
                    link={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={(saved) => {
                        setEditing(null);
                        if (saved.token) setMade(shareUrl(saved.token));
                        else toast.success('Saved. Anyone on the page now has only what the link allows.');
                        void refresh();
                    }}
                />
            )}

            {made && (
                <Dialog open onClose={() => setMade(null)} title={'Your share link'} description={'Copy it now: it is shown only this once. Anyone with it can use it until it expires or you revoke it.'}>
                    <div className={'psh:flex psh:gap-2'}>
                        <Input readOnly value={made} onFocus={(event) => event.target.select()} className={'psh:font-mono'} />
                        <Button
                            onClick={() =>
                                void navigator.clipboard.writeText(made).then(
                                    () => toast.success('Copied.'),
                                    () => toast.error('Could not copy. Select the link and copy it yourself.')
                                )
                            }
                        >
                            <NamedIcon name={'copy'} size={16} className={'psh:mr-1'} /> Copy
                        </Button>
                    </div>
                    <Dialog.Footer>
                        <Button onClick={() => setMade(null)}>Done</Button>
                    </Dialog.Footer>
                </Dialog>
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
