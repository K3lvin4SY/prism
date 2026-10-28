import { useState } from 'react';
import { Alert, Button, Checkbox, Dialog, Input, Select, Switch, bytesToString, formatDate, httpErrorToHuman } from '@pterodactyl/sdk';
import { createLink, updateLink, type Links, type ShareLink, type ShareOption } from '../api';
import { NamedIcon } from '../icons';
import { OPTIONS, expiryChoices, toggleOption } from '../lib/options';
import FolderPicker from './FolderPicker';

/**
 * Making or changing a link. Options the person cannot give are shown switched off with the
 * reason; the server checks the same again on saving.
 */
export default function LinkDialog({ server, data, link, onClose, onSaved }: { server: string; data: Links; link: ShareLink | null; onClose: () => void; onSaved: (saved: ShareLink & { token?: string }) => void }) {
    const choices = expiryChoices(data.max_hours);
    const [label, setLabel] = useState(link?.label ?? '');
    const [options, setOptions] = useState<ShareOption[]>(link?.permissions ?? ['console']);
    const [paths, setPaths] = useState<string[]>(link?.paths ?? []);
    const [backups, setBackups] = useState<string[]>(link?.backups ?? []);
    // Editing keeps the expiry unless a new one is picked.
    const [hours, setHours] = useState<number | null>(link ? null : (choices.find((choice) => choice.hours === 24) ?? choices[0]).hours);
    const [picking, setPicking] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // A kept option its saver may no longer give would be refused, so it shows as a problem.
    const blocked = options.filter((option) => data.grantable[option] !== null);
    const ready =
        label.trim() !== '' &&
        options.length > 0 &&
        blocked.length === 0 &&
        (!options.includes('files') || paths.length > 0) &&
        (!options.includes('backups') || backups.length > 0);

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            const input = { label: label.trim(), permissions: options, paths, backups, ...(hours !== null ? { hours } : {}) };
            onSaved(link ? await updateLink(server, link.id, input) : await createLink(server, input));
        } catch (caught) {
            setError(httpErrorToHuman(caught));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} preventExternalClose title={link ? 'Change share link' : 'New share link'} description={'People with the link need no account. It can never do more than you can.'}>
            <div className={'psh:flex psh:flex-col psh:gap-4'}>
                {error && <Alert type={'danger'}>{error}</Alert>}

                <label className={'psh:flex psh:flex-col psh:gap-1 psh:text-sm'}>
                    <span className={'psh:font-medium'}>Name</span>
                    <Input value={label} maxLength={64} placeholder={'For example: Alex, watching the event'} onChange={(event) => setLabel(event.target.value)} />
                    <span className={'psh:text-xs psh:text-muted-foreground'}>Only you see it; the activity log uses it for what the link does.</span>
                </label>

                <div className={'psh:flex psh:flex-col psh:gap-2'}>
                    <span className={'psh:text-sm psh:font-medium'}>The link allows</span>
                    {OPTIONS.map((option) => {
                        const reason = data.grantable[option.key];
                        const on = options.includes(option.key);

                        return (
                            <div key={option.key} className={'pt-surface psh:rounded-lg psh:border psh:border-border psh:p-3'}>
                                <Switch
                                    checked={on}
                                    disabled={reason !== null && !on}
                                    label={option.label}
                                    description={reason ?? option.description}
                                    onChange={(value) => setOptions((current) => toggleOption(current, option.key, value))}
                                />
                                {on && reason !== null && <p className={'psh:mt-2 psh:text-xs psh:text-destructive'}>{reason} Switch it off to save the link.</p>}
                                {on && option.warning && <p className={'psh:mt-2 psh:flex psh:items-center psh:gap-1 psh:text-xs psh:text-warning'}><NamedIcon name={'triangle-alert'} size={14} /> {option.warning}</p>}

                                {on && option.key === 'files' && (
                                    <div className={'psh:mt-3 psh:flex psh:flex-col psh:gap-2'}>
                                        {paths.map((path) => (
                                            <div key={path} className={'psh:flex psh:items-center psh:gap-2 psh:text-sm'}>
                                                <NamedIcon name={'folder'} size={14} />
                                                <code className={'psh:min-w-0 psh:flex-1 psh:truncate'}>{path}</code>
                                                <Button.Text size={'small'} aria-label={`Stop sharing ${path}`} onClick={() => setPaths((current) => current.filter((entry) => entry !== path))}>
                                                    <NamedIcon name={'x'} size={14} />
                                                </Button.Text>
                                            </div>
                                        ))}
                                        <Button.Text size={'small'} onClick={() => setPicking(true)}>
                                            <NamedIcon name={'plus'} size={14} className={'psh:mr-1'} /> Add a folder or file
                                        </Button.Text>
                                    </div>
                                )}

                                {on && option.key === 'backups' && (
                                    <div className={'psh:mt-3 psh:flex psh:flex-col psh:gap-2'}>
                                        {data.backups.length === 0 && <p className={'psh:text-xs psh:text-muted-foreground'}>This server has no finished backups yet.</p>}
                                        {data.backups.map((backup) => (
                                            <label key={backup.uuid} className={'psh:flex psh:items-center psh:gap-2 psh:text-sm'}>
                                                <Checkbox checked={backups.includes(backup.uuid)} onChange={(value) => setBackups((current) => (value ? [...current, backup.uuid] : current.filter((uuid) => uuid !== backup.uuid)))} />
                                                <span className={'psh:min-w-0 psh:flex-1 psh:truncate'}>{backup.name}</span>
                                                <span className={'psh:text-xs psh:text-muted-foreground'}>
                                                    {bytesToString(backup.size)}
                                                    {backup.completed_at && ` · ${formatDate(backup.completed_at, 'MMM D, YYYY')}`}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <label className={'psh:flex psh:flex-col psh:gap-1 psh:text-sm'}>
                    <span className={'psh:font-medium'}>{link ? 'Works until' : 'Works for'}</span>
                    <Select
                        value={hours}
                        placeholder={link ? `Keep: ${formatDate(link.expires_at, 'MMM D, YYYY HH:mm')}` : undefined}
                        options={choices.map((choice) => ({ value: choice.hours, label: link ? `${choice.label} from now` : choice.label }))}
                        onChange={(value) => setHours(Number(value))}
                    />
                </label>
            </div>

            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button disabled={!ready} isLoading={busy} onClick={() => void save()}>
                    {link ? 'Save' : 'Make link'}
                </Button>
            </Dialog.Footer>

            {picking && (
                <FolderPicker
                    server={server}
                    onClose={() => setPicking(false)}
                    onPick={(path) => {
                        setPaths((current) => [...new Set([...current, path])]);
                        setPicking(false);
                    }}
                />
            )}
        </Dialog>
    );
}
