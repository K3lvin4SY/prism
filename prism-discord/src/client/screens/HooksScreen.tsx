import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Dialog, ServerContentBlock, Spinner, Switch, fromNow, httpErrorToHuman, toast, useCurrentServerRequired } from '@pterodactyl/sdk';
import { deleteHook, getHooks, hooksKey, testHook, updateHook, type Hook, type Hooks } from '../api';
import HookDialog from '../components/HookDialog';
import { NamedIcon } from '../icons';

const eyebrow = 'pdc:font-mono pdc:text-xs pdc:font-medium pdc:uppercase pdc:tracking-[0.18em] pdc:text-muted-foreground';

/** The server's "Discord" page: the webhooks it posts to and what each posts. */
export default function HooksScreen() {
    const server = useCurrentServerRequired();
    const id = server.attributes.identifier;
    const client = useQueryClient();
    const query = useQuery({ queryKey: hooksKey(id), queryFn: () => getHooks(id) });
    const [editing, setEditing] = useState<Hook | 'new' | null>(null);
    const [removing, setRemoving] = useState<Hook | null>(null);
    const [busy, setBusy] = useState<number | null>(null);

    const data = query.data;
    const refresh = () => client.invalidateQueries({ queryKey: hooksKey(id) });

    const test = async (hook: Hook) => {
        setBusy(hook.id);
        try {
            await testHook(id, hook.id, hook.events[0] ?? 'start');
            toast.success(`Sent a test message to ${hook.name}.`);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(null);
            void refresh();
        }
    };

    const toggle = async (hook: Hook, enabled: boolean) => {
        try {
            await updateHook(id, hook.id, { enabled });
            await refresh();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        }
    };

    return (
        <ServerContentBlock title={'Discord'}>
            <section className={'pt-surface pdc:overflow-hidden pdc:rounded-xl pdc:border pdc:border-border pdc:bg-card'}>
                <header className={'pdc:flex pdc:flex-wrap pdc:items-center pdc:gap-3 pdc:border-b pdc:border-border pdc:px-5 pdc:py-4'}>
                    <div className={'pdc:min-w-0 pdc:flex-1'}>
                        <div className={'pdc:flex pdc:flex-wrap pdc:items-baseline pdc:gap-x-3'}>
                            <h1 className={'pdc:font-header pdc:text-lg pdc:font-semibold'}>Discord</h1>
                            <span className={eyebrow + ' pdc:truncate'}>{server.attributes.name}</span>
                        </div>
                        <p className={'pdc:text-sm pdc:text-muted-foreground'}>Post to Discord channels when this server starts, stops or crashes, a backup finishes, or players come and go.</p>
                    </div>
                    <Button disabled={!data || data.hooks.length >= data.max} title={data && data.hooks.length >= data.max ? `This server has ${data.max} webhooks, the most it may have.` : undefined} onClick={() => setEditing('new')}>
                        <NamedIcon name={'plus'} size={16} className={'pdc:mr-1'} /> New webhook
                    </Button>
                </header>

                {query.isLoading && (
                    <div className={'pdc:flex pdc:justify-center pdc:py-10'}>
                        <Spinner />
                    </div>
                )}
                {query.isError && (
                    <div className={'pdc:p-5'}>
                        <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>
                    </div>
                )}
                {data?.hooks.length === 0 && (
                    <div className={'pdc:flex pdc:flex-col pdc:items-center pdc:gap-2 pdc:py-12 pdc:text-center pdc:text-sm pdc:text-muted-foreground'}>
                        <NamedIcon name={'message-circle'} size={24} />
                        No webhooks yet. Make one in a Discord channel's settings, under Integrations.
                    </div>
                )}
                {data?.hooks.map((hook) => <HookRow key={hook.id} hook={hook} data={data} busy={busy === hook.id} onTest={() => void test(hook)} onToggle={(on) => void toggle(hook, on)} onChange={() => setEditing(hook)} onRemove={() => setRemoving(hook)} />)}
            </section>

            {editing && data && (
                <HookDialog
                    server={id}
                    serverName={server.attributes.name}
                    data={data}
                    hook={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={(saved) => {
                        setEditing(null);
                        toast.success(editing === 'new' ? `Added ${saved.name}. Send a test message to check it.` : 'Saved.');
                        void refresh();
                    }}
                />
            )}

            {removing && (
                <Dialog.Confirm
                    open
                    title={`Remove ${removing.name}?`}
                    confirm={'Remove'}
                    pending={busy === removing.id}
                    onClose={() => setRemoving(null)}
                    onConfirmed={async () => {
                        setBusy(removing.id);
                        try {
                            await deleteHook(id, removing.id);
                            setRemoving(null);
                            await refresh();
                        } catch (error) {
                            toast.error(httpErrorToHuman(error));
                        } finally {
                            setBusy(null);
                        }
                    }}
                >
                    This server stops posting to it. The webhook itself stays in Discord until you delete it there.
                </Dialog.Confirm>
            )}
        </ServerContentBlock>
    );
}

function HookRow({ hook, data, busy, onTest, onToggle, onChange, onRemove }: { hook: Hook; data: Hooks; busy: boolean; onTest: () => void; onToggle: (on: boolean) => void; onChange: () => void; onRemove: () => void }) {
    const labels = Object.fromEntries(data.events.map((event) => [event.key, event.label]));

    return (
        <div className={'pdc:grid pdc:items-center pdc:gap-x-4 pdc:gap-y-2 pdc:border-b pdc:border-border pdc:px-5 pdc:py-3.5 pdc:last:border-b-0 pdc:md:grid-cols-[auto_minmax(10rem,1fr)_minmax(0,2fr)_auto] ' + (hook.enabled ? '' : 'pdc:opacity-60')}>
            <Switch checked={hook.enabled} onChange={onToggle} aria-label={hook.enabled ? `Pause ${hook.name}` : `Resume ${hook.name}`} />
            <div className={'pdc:min-w-0'}>
                <p className={'pdc:truncate pdc:font-semibold'}>{hook.name}</p>
                <p className={'pdc:truncate pdc:font-mono pdc:text-xs pdc:text-muted-foreground'}>{hook.webhook || 'Address unreadable: enter it again'}</p>
                <p className={'pdc:text-xs pdc:text-muted-foreground'}>{hook.last_sent_at ? `Last message ${fromNow(hook.last_sent_at)}` : 'Nothing sent yet'}</p>
            </div>
            <div className={'pdc:flex pdc:min-w-0 pdc:flex-wrap pdc:gap-1.5'}>
                {hook.events.map((event) => (
                    <Badge key={event} size={'sm'} variant={'soft'} tone={event.startsWith('player.') && !data.players ? 'danger' : 'neutral'} title={event.startsWith('player.') && !data.players ? 'Your administrator turned off player messages.' : undefined}>
                        {labels[event] ?? event}
                    </Badge>
                ))}
                {hook.mention_role && (
                    <Badge size={'sm'} variant={'soft'} tone={'neutral'}>
                        Mentions a role
                    </Badge>
                )}
            </div>
            <div className={'pdc:flex pdc:justify-end pdc:gap-2'}>
                <Button.Text size={'small'} disabled={busy || !hook.enabled} onClick={onTest}>
                    <NamedIcon name={'send'} size={14} className={'pdc:mr-1'} /> Test
                </Button.Text>
                <Button.Text size={'small'} onClick={onChange}>
                    <NamedIcon name={'pencil'} size={14} className={'pdc:mr-1'} /> Change
                </Button.Text>
                <Button.Danger size={'small'} isSecondary onClick={onRemove}>
                    Remove
                </Button.Danger>
            </div>
            {hook.last_error && <p className={'pdc:text-xs pdc:text-destructive pdc:md:col-span-4'}>{hook.last_error}</p>}
        </div>
    );
}
