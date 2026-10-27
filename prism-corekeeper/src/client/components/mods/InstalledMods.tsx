import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Dialog, Spinner, Switch, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { getUpdates, modKeys, remove, toggle, type InstalledMod, type ModsState } from '../../api/mods';
import { NamedIcon } from '../../icons';
import { Chip, ItemIcon } from '../content/ui';
import SourceBadge from './SourceBadge';

interface Props {
    identifier: string;
    state: ModsState;
    onChanged: () => void;
    onUpdate: (ids: string[]) => void;
    onRestart: () => void;
    busy: boolean;
}

const REQUIRED_ON: Record<number, string> = { 1: 'Players need it too', 2: 'Server only', 3: 'Players need it too' };

/** The mods in the server's mods folder, with where they came from, updates, on/off and remove. */
export default function InstalledMods({ identifier, state, onChanged, onUpdate, onRestart, busy }: Props) {
    const updates = useQuery({ queryKey: modKeys.updates(identifier), queryFn: () => getUpdates(identifier), staleTime: 300_000, enabled: state.mods.some((mod) => mod.id !== null) });
    const [removing, setRemoving] = useState<InstalledMod | null>(null);
    const [working, setWorking] = useState<string | null>(null);

    const pending = state.mods.filter((mod) => mod.pending);
    const withUpdates = state.mods.filter((mod) => mod.id && updates.data?.[mod.id]);

    const run = async (key: string, action: () => Promise<void>, done: string) => {
        setWorking(key);
        try {
            await action();
            toast.success(done);
            onChanged();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setWorking(null);
        }
    };

    if (state.mods.length === 0) {
        return <p className={'cks:py-8 cks:text-center cks:text-sm cks:text-muted-foreground'}>No mods yet. Find some on the Browse tab.</p>;
    }

    return (
        <div className={'cks:flex cks:flex-col cks:gap-3'}>
            {pending.length > 0 && (
                <Alert type={'info'}>
                    <div className={'cks:flex cks:flex-wrap cks:items-center cks:gap-3'}>
                        <span className={'cks:flex-1'}>
                            {pending.length === 1 ? `${pending[0].title} is` : `${pending.length} Workshop mods are`} downloaded when the server next starts.
                        </span>
                        <Button size={'small'} isLoading={busy} onClick={onRestart}>
                            {state.running ? 'Restart now' : 'Start now'}
                        </Button>
                    </div>
                </Alert>
            )}
            {withUpdates.length > 0 && (
                <div className={'cks:flex cks:items-center cks:justify-between cks:gap-3 cks:rounded-lg cks:border cks:border-primary/40 cks:bg-primary/10 cks:px-4 cks:py-2 cks:text-sm'}>
                    <span>{withUpdates.length === 1 ? 'An update is' : `${withUpdates.length} updates are`} available.</span>
                    <Button size={'small'} isLoading={busy} onClick={() => onUpdate(withUpdates.map((mod) => mod.id!))}>
                        Update all
                    </Button>
                </div>
            )}

            {state.mods.map((mod) => {
                const key = mod.id ?? mod.folder ?? mod.title;
                const update = mod.id ? updates.data?.[mod.id] : undefined;

                return (
                    <div key={key} className={'pt-surface cks:flex cks:flex-wrap cks:items-center cks:gap-3 cks:rounded-lg cks:border cks:border-border cks:bg-card cks:p-3'}>
                        <ItemIcon src={mod.icon} className={'cks:size-12 cks:shrink-0'} />
                        <div className={'cks:min-w-0 cks:flex-1'}>
                            <div className={'cks:flex cks:flex-wrap cks:items-center cks:gap-2'}>
                                {mod.url ? (
                                    <a href={mod.url} target={'_blank'} rel={'noreferrer'} className={'cks:font-semibold cks:hover:underline'}>
                                        {mod.title}
                                    </a>
                                ) : (
                                    <span className={'cks:font-semibold'}>{mod.title}</span>
                                )}
                                {mod.source ? <SourceBadge source={mod.source} /> : <Chip>Added by hand</Chip>}
                                {mod.version && <Chip>{mod.version}</Chip>}
                                {mod.dependency && <Chip title={'Installed because another mod needs it'}>Needed by another mod</Chip>}
                            </div>
                            <div className={'cks:mt-1 cks:flex cks:flex-wrap cks:gap-1.5'}>
                                {mod.pending && (
                                    <Chip tone={'warning'}>
                                        <NamedIcon name={'clock'} size={12} /> Downloads at next start
                                    </Chip>
                                )}
                                {mod.missing && (
                                    <Chip tone={'warning'} title={'The files are not in the mods folder'}>
                                        <NamedIcon name={'triangle-alert'} size={12} /> Files missing
                                    </Chip>
                                )}
                                {!mod.manifest && !mod.pending && !mod.missing && <Chip tone={'warning'}>No ModManifest.json: the game ignores it</Chip>}
                                {!mod.linux && <Chip tone={'warning'} title={'This mod only has Windows asset bundles, so the Linux server cannot load its assets.'}>No Linux build</Chip>}
                                {mod.requiredOn !== null && REQUIRED_ON[mod.requiredOn] && <Chip>{REQUIRED_ON[mod.requiredOn]}</Chip>}
                                {update && (
                                    <Chip tone={'success'}>
                                        <NamedIcon name={'arrow-up'} size={12} /> {update} available
                                    </Chip>
                                )}
                                {mod.folder && <span className={'cks:text-xs cks:text-muted-foreground'}>{mod.folder}</span>}
                            </div>
                        </div>
                        <div className={'cks:flex cks:items-center cks:gap-2'}>
                            {update && mod.id && (
                                <Button size={'small'} isSecondary isLoading={busy} onClick={() => onUpdate([mod.id!])}>
                                    Update
                                </Button>
                            )}
                            {mod.folder && !mod.pending && !mod.missing && (
                                <Switch
                                    checked={mod.enabled}
                                    disabled={working === key}
                                    onChange={(enabled) => void run(key, () => toggle(identifier, mod.folder!, enabled), enabled ? `${mod.title} is on.` : `${mod.title} is off.`)}
                                    aria-label={mod.enabled ? `Turn ${mod.title} off` : `Turn ${mod.title} on`}
                                />
                            )}
                            <Button.Text size={'small'} onClick={() => setRemoving(mod)} aria-label={`Remove ${mod.title}`}>
                                <NamedIcon name={'trash-2'} size={16} />
                            </Button.Text>
                        </div>
                    </div>
                );
            })}

            <p className={'cks:text-xs cks:text-muted-foreground'}>
                Mods live in {state.folder}. Changes load when the server restarts. Players need the same mods that need to be on their side, at the same versions.
            </p>
            {updates.isFetching && <Spinner size={'small'} />}

            {removing && (
                <Dialog.Confirm
                    open
                    title={`Remove ${removing.title}?`}
                    confirm={'Remove'}
                    pending={working === 'remove'}
                    onClose={() => setRemoving(null)}
                    onConfirmed={() => void run('remove', () => remove(identifier, removing), `${removing.title} is removed.`).then(() => setRemoving(null))}
                >
                    Its folder is deleted from the server. Its settings in the mods config folder stay.
                </Dialog.Confirm>
            )}
        </div>
    );
}
