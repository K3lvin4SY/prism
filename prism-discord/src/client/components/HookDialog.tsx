import { useState } from 'react';
import { Alert, Button, Checkbox, Dialog, Input, TextArea, httpErrorToHuman } from '@pterodactyl/sdk';
import { createHook, updateHook, type Hook, type Hooks } from '../api';
import { NamedIcon } from '../icons';
import { PLACEHOLDERS, ROLE_ID, WEBHOOK, fill, usable } from '../lib/template';

const eyebrow = 'pdc:font-mono pdc:text-xs pdc:font-medium pdc:uppercase pdc:tracking-[0.18em] pdc:text-muted-foreground';

/** Adding or changing a webhook: its name and address, what it posts, a role to mention and its own message texts. */
export default function HookDialog({ server, serverName, data, hook, onClose, onSaved }: { server: string; serverName: string; data: Hooks; hook: Hook | null; onClose: () => void; onSaved: (saved: Hook) => void }) {
    const events = usable(data.events, data.players);
    const [name, setName] = useState(hook?.name ?? '');
    const [webhook, setWebhook] = useState('');
    const [picked, setPicked] = useState<string[]>(hook?.events ?? ['start', 'stop', 'crash', 'backup.fail']);
    const [role, setRole] = useState(hook?.mention_role ?? '');
    const [templates, setTemplates] = useState<Record<string, string>>(hook?.templates ?? {});
    const [texts, setTexts] = useState(Object.keys(hook?.templates ?? {}).length > 0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const addressOk = webhook.trim() === '' ? hook !== null : WEBHOOK.test(webhook.trim());
    const roleOk = role.trim() === '' || ROLE_ID.test(role.trim());
    const ready = name.trim() !== '' && addressOk && roleOk && picked.length > 0;

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            const input = { name: name.trim(), events: picked, templates, mention_role: role.trim() || null, ...(webhook.trim() ? { webhook: webhook.trim() } : {}) };
            onSaved(hook ? await updateHook(server, hook.id, input) : await createHook(server, input));
        } catch (caught) {
            setError(httpErrorToHuman(caught));
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} preventExternalClose title={hook ? `Change ${hook.name}` : 'New Discord webhook'}>
            <div className={'pdc-hook-editor pdc:flex pdc:flex-col pdc:gap-4'}>
                {error && <Alert type={'danger'}>{error}</Alert>}

                <label className={'pdc:flex pdc:flex-col pdc:gap-1.5'}>
                    <span className={eyebrow}>Name</span>
                    <Input value={name} maxLength={64} placeholder={'#server-status'} onChange={(event) => setName(event.target.value)} />
                </label>

                <label className={'pdc:flex pdc:flex-col pdc:gap-1.5'}>
                    <span className={eyebrow}>Webhook address</span>
                    <Input value={webhook} type={'password'} autoComplete={'off'} placeholder={hook ? `Kept: ${hook.webhook}` : 'https://discord.com/api/webhooks/…'} $hasError={!addressOk && webhook !== ''} onChange={(event) => setWebhook(event.target.value)} />
                    <span className={'pdc:text-xs pdc:text-muted-foreground'}>
                        {hook ? 'Leave it empty to keep the one saved. ' : ''}In Discord: the channel's settings, Integrations, Webhooks, New Webhook, Copy Webhook URL. It is stored encrypted and never shown again.
                    </span>
                </label>

                <fieldset className={'pdc:flex pdc:flex-col pdc:gap-1.5'}>
                    <legend className={eyebrow + ' pdc:mb-1.5'}>Post when</legend>
                    <div className={'pdc:grid pdc:gap-1.5 pdc:sm:grid-cols-2'}>
                        {events.map((event) => (
                            <label key={event.key} className={'pdc:flex pdc:items-center pdc:gap-2 pdc:text-sm'}>
                                <Checkbox checked={picked.includes(event.key)} onChange={(on: boolean) => setPicked((list) => (on ? [...list, event.key] : list.filter((key) => key !== event.key)))} />
                                {event.label}
                            </label>
                        ))}
                    </div>
                    {data.players && <span className={'pdc:text-xs pdc:text-muted-foreground'}>Players joining and leaving are read from the console once a minute, for Minecraft, Factorio and Terraria.</span>}
                </fieldset>

                <label className={'pdc:flex pdc:flex-col pdc:gap-1.5'}>
                    <span className={eyebrow}>Role to mention (optional)</span>
                    <Input value={role} inputMode={'numeric'} placeholder={'Role id, like 112233445566778899'} $hasError={!roleOk} onChange={(event) => setRole(event.target.value)} />
                    <span className={'pdc:text-xs pdc:text-muted-foreground'}>With Developer Mode on in Discord, right-click the role and Copy Role ID. Nobody else is ever mentioned.</span>
                </label>

                <div className={'pdc:flex pdc:flex-col pdc:gap-2'}>
                    <Button.Text size={'small'} className={'pdc:self-start'} onClick={() => setTexts((open) => !open)}>
                        <NamedIcon name={texts ? 'chevron-down' : 'chevron-right'} size={14} className={'pdc:mr-1'} /> Message texts
                    </Button.Text>
                    {texts && (
                        <div className={'pdc:flex pdc:flex-col pdc:gap-3'}>
                            <p className={'pdc:text-xs pdc:text-muted-foreground'}>Leave a text empty for the usual one. You can use {PLACEHOLDERS.join(', ')}.</p>
                            {events
                                .filter((event) => picked.includes(event.key))
                                .map((event) => {
                                    const text = templates[event.key] ?? '';

                                    return (
                                        <label key={event.key} className={'pdc:flex pdc:flex-col pdc:gap-1'}>
                                            <span className={'pdc:text-sm pdc:font-medium'}>{event.label}</span>
                                            <TextArea rows={2} maxLength={1000} value={text} placeholder={event.default} onChange={(change) => setTemplates((all) => ({ ...all, [event.key]: change.target.value }))} />
                                            <span className={'pdc:truncate pdc:text-xs pdc:text-muted-foreground'}>
                                                Looks like: {fill(text.trim() || event.default, { server: serverName, player: 'Steve', backup: 'Nightly backup', event: event.label })}
                                            </span>
                                        </label>
                                    );
                                })}
                        </div>
                    )}
                </div>
            </div>

            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button disabled={!ready} isLoading={busy} onClick={() => void save()}>
                    {hook ? 'Save' : 'Add webhook'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
