import { useState, type ReactNode } from 'react';
import { Alert, Button, Dialog, Input, Switch, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { createLink, shareUrl, updateLink, type Links, type ShareLink, type ShareOption } from '../api';
import { NamedIcon } from '../icons';
import { OPTIONS, toggleOption } from '../lib/options';
import BackupChooser from './BackupChooser';
import ExpiryPicker, { initialHours } from './ExpiryPicker';
import FileChooser from './FileChooser';
import PickDialog from './PickDialog';

const eyebrow = 'psh:font-mono psh:text-xs psh:font-medium psh:uppercase psh:tracking-[0.18em] psh:text-muted-foreground';

/**
 * Making or changing a link: its name and what it allows on the left, how long it works and the
 * link itself on the right. A new link's address appears there once, after it is made. Options
 * the person cannot give are shown switched off with the reason; the server checks the same again.
 */
export default function LinkDialog({ server, data, link, onClose, onSaved }: { server: string; data: Links; link: ShareLink | null; onClose: () => void; onSaved: (saved: ShareLink) => void }) {
    const [label, setLabel] = useState(link?.label ?? '');
    const [options, setOptions] = useState<ShareOption[]>(link?.permissions ?? ['console']);
    const [paths, setPaths] = useState<string[]>(link?.paths ?? []);
    const [backups, setBackups] = useState<string[]>(link?.backups ?? []);
    // Changing a link keeps its expiry unless a new one is picked.
    const [hours, setHours] = useState<number | null>(link ? null : initialHours(data.max_hours));
    const [picking, setPicking] = useState<'files' | 'backups' | null>(null);
    const [made, setMade] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const locked = made !== null;

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
            if (link) {
                onSaved(await updateLink(server, link.id, input));
            } else {
                const saved = await createLink(server, input);
                setMade(shareUrl(saved.token));
                onSaved(saved);
            }
        } catch (caught) {
            setError(httpErrorToHuman(caught));
        } finally {
            setBusy(false);
        }
    };

    // Closing the picker with nothing picked switches the option back off.
    const cancelPick = (key: 'files' | 'backups', count: number) => {
        setPicking(null);
        if (count === 0) setOptions((current) => toggleOption(current, key, false));
    };

    const copy = () =>
        void navigator.clipboard.writeText(made!).then(
            () => toast.success('Copied.'),
            () => toast.error('Could not copy. Select the link and copy it yourself.')
        );

    // The row's words, with what it shares once something is picked.
    const title = (key: ShareOption, fallback: string): ReactNode => {
        if (!options.includes(key)) return fallback;
        if (key === 'files' && paths.length === 1) return <>Download <code className={'psh:font-mono psh:text-primary'}>{paths[0]}</code></>;
        if (key === 'files' && paths.length > 1) return `Download ${paths.length} folders and files`;
        const names = data.backups.filter((backup) => backups.includes(backup.uuid));
        if (key === 'backups' && names.length === 1) return <>Download backup <span className={'psh:text-primary'}>{names[0].name}</span></>;
        if (key === 'backups' && names.length > 1) return names.length === data.backups.length ? 'Download all backups' : `Download ${names.length} backups`;

        return fallback;
    };

    return (
        <Dialog open onClose={onClose} preventExternalClose title={link ? 'Change share link' : 'New share link'}>
            <div className={'psh-link-editor psh:grid psh:gap-6 psh:md:grid-cols-[minmax(0,1fr)_21rem]'}>
                <div className={'psh:flex psh:min-w-0 psh:flex-col psh:gap-5'}>
                    {error && <Alert type={'danger'}>{error}</Alert>}

                    <Input value={label} maxLength={64} disabled={locked} aria-label={'Name'} placeholder={'Who it is for, like "For Alex"'} onChange={(event) => setLabel(event.target.value)} />

                    <div className={'psh:flex psh:flex-col psh:gap-1'}>
                        <span className={eyebrow}>This link can</span>
                        {OPTIONS.map((option) => {
                            const reason = data.grantable[option.key];
                            const on = options.includes(option.key);

                            return (
                                <div key={option.key} className={'psh:flex psh:flex-col psh:gap-2 psh:py-1.5'}>
                                    <div className={'psh:flex psh:items-center psh:gap-3'}>
                                        <div className={'psh:min-w-0 psh:flex-1'}>
                                            <p className={'psh:truncate psh:text-sm ' + (reason !== null && !on ? 'psh:text-muted-foreground' : 'psh:text-foreground')}>{title(option.key, option.label)}</p>
                                            {reason !== null && !on && <p className={'psh:text-xs psh:text-muted-foreground'}>{reason}</p>}
                                        </div>
                                        <Switch
                                            aria-label={option.label}
                                            checked={on}
                                            disabled={locked || (reason !== null && !on)}
                                            onChange={(value) => {
                                                setOptions((current) => toggleOption(current, option.key, value));
                                                // Switching on files or backups goes straight to picking them.
                                                if (value && (option.key === 'files' || option.key === 'backups')) setPicking(option.key);
                                            }}
                                        />
                                    </div>
                                    {on && reason !== null && <p className={'psh:text-xs psh:text-destructive'}>{reason} Switch it off to save the link.</p>}
                                    {on && option.warning && (
                                        <p className={'psh:flex psh:items-center psh:gap-1 psh:text-xs psh:text-warning'}>
                                            <NamedIcon name={'triangle-alert'} size={14} /> {option.warning}
                                        </p>
                                    )}
                                    {on && !locked && (option.key === 'files' || option.key === 'backups') && (
                                        <Picks
                                            names={option.key === 'files' ? paths : data.backups.filter((backup) => backups.includes(backup.uuid)).map((backup) => backup.name)}
                                            mono={option.key === 'files'}
                                            what={option.key === 'files' ? 'files' : 'backups'}
                                            onPick={() => setPicking(option.key as 'files' | 'backups')}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <aside className={'pt-surface psh:flex psh:flex-col psh:gap-5 psh:self-start psh:rounded-xl psh:md:sticky psh:md:top-0 psh:border psh:border-border psh:bg-muted/30 psh:p-4'}>
                    <div className={'psh:flex psh:flex-col psh:gap-2'}>
                        <span className={eyebrow}>Expires</span>
                        <ExpiryPicker maxHours={data.max_hours} keepUntil={link?.expires_at ?? null} disabled={locked} onChange={setHours} />
                    </div>

                    <div className={'psh:flex psh:flex-col psh:gap-2'}>
                        <span className={eyebrow}>Link · shown once</span>
                        {link ? (
                            <p className={'psh:text-xs psh:text-muted-foreground'}>The link stays the same. It was shown once, when it was made.</p>
                        ) : (
                            <>
                                <div className={'psh:flex psh:items-center psh:gap-2 psh:rounded-lg psh:border psh:p-1.5 psh:pl-3 ' + (made ? 'psh:border-primary psh:bg-background/60' : 'psh:border-dashed psh:border-border')}>
                                    <input
                                        readOnly
                                        aria-label={'Share link'}
                                        value={made ?? `${window.location.host}/share#…`}
                                        onFocus={(event) => made && event.target.select()}
                                        className={'psh:min-w-0 psh:flex-1 psh:bg-transparent psh:py-1 psh:font-mono psh:text-sm psh:outline-none ' + (made ? 'psh:text-foreground' : 'psh:text-muted-foreground/60')}
                                    />
                                    {made && (
                                        <button type={'button'} onClick={copy} className={'psh:inline-flex psh:cursor-pointer psh:items-center psh:gap-1 psh:rounded-md psh:bg-primary psh:px-3 psh:py-1.5 psh:text-sm psh:font-semibold psh:text-primary-foreground psh:hover:opacity-90'}>
                                            <NamedIcon name={'copy'} size={14} /> Copy
                                        </button>
                                    )}
                                </div>
                                <p className={'psh:text-xs psh:text-muted-foreground'}>{made ? 'Copy it now: it is not shown again.' : 'Appears here when you make the link.'}</p>
                            </>
                        )}
                    </div>

                    <div className={'psh:flex psh:gap-3 psh:rounded-lg psh:bg-background/50 psh:p-3 psh:text-sm psh:text-muted-foreground'}>
                        <NamedIcon name={'shield'} size={18} className={'psh:mt-0.5 psh:shrink-0 psh:text-primary'} />
                        <p>No account needed. It can never do more than you can. Revoke it and anyone using it is cut off at once.</p>
                    </div>
                </aside>
            </div>

            <Dialog.Footer>
                {locked ? (
                    <Button onClick={onClose}>Done</Button>
                ) : (
                    <>
                        <Button.Text onClick={onClose}>Cancel</Button.Text>
                        <Button disabled={!ready} isLoading={busy} onClick={() => void save()}>
                            {link ? 'Save' : 'Make link'}
                        </Button>
                    </>
                )}
            </Dialog.Footer>

            {picking === 'files' && (
                <PickDialog<string>
                    title={'Files to share'}
                    description={'Tick folders and files. Everything inside a shared folder can be downloaded.'}
                    initial={paths}
                    done={(picked) => `Share ${picked.length} ${picked.length === 1 ? 'item' : 'items'}`}
                    onDone={(picked) => {
                        setPaths(picked);
                        setPicking(null);
                    }}
                    onCancel={() => cancelPick('files', paths.length)}
                >
                    {(picked, setPicked) => <FileChooser server={server} paths={picked} onChange={setPicked} />}
                </PickDialog>
            )}
            {picking === 'backups' && (
                <PickDialog<string>
                    title={'Backups to share'}
                    description={'A backup is the way to share a whole world. Only finished backups can be shared.'}
                    initial={backups}
                    done={(picked) => `Share ${picked.length} ${picked.length === 1 ? 'backup' : 'backups'}`}
                    onDone={(picked) => {
                        setBackups(picked);
                        setPicking(null);
                    }}
                    onCancel={() => cancelPick('backups', backups.length)}
                >
                    {(picked, setPicked) => <BackupChooser backups={data.backups} picked={picked} onChange={setPicked} />}
                </PickDialog>
            )}
        </Dialog>
    );
}

/** Under a files or backups row: what it shares, and the button that opens the picker. */
function Picks({ names, mono, what, onPick }: { names: string[]; mono: boolean; what: string; onPick: () => void }) {
    const shown = names.slice(0, 3);

    return (
        <div className={'psh:flex psh:min-w-0 psh:flex-wrap psh:items-center psh:gap-1.5'}>
            {names.length === 0 && <span className={'psh:text-xs psh:text-destructive'}>Nothing picked yet.</span>}
            {shown.map((name) => (
                <span key={name} className={'psh:max-w-full psh:truncate psh:rounded-md psh:bg-primary/15 psh:px-2 psh:py-0.5 psh:text-xs psh:text-primary ' + (mono ? 'psh:font-mono' : '')}>
                    {name}
                </span>
            ))}
            {names.length > shown.length && <span className={'psh:text-xs psh:text-muted-foreground'}>and {names.length - shown.length} more</span>}
            <Button.Text size={'xsmall'} onClick={onPick}>
                <NamedIcon name={'pencil'} size={12} className={'psh:mr-1'} /> {names.length === 0 ? `Pick ${what}` : `Change ${what}`}
            </Button.Text>
        </div>
    );
}
