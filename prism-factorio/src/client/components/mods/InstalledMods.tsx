import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Dialog, Spinner, Switch, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { getUpdates, modKeys, remove, toggle, type InstalledMod, type ModsState } from '../../api/mods';
import { NamedIcon } from '../../icons';
import { Chip, ItemIcon } from '../content/ui';

interface Props {
    identifier: string;
    state: ModsState;
    onChanged: () => void;
    onUpdate: (ids: string[]) => void;
    busy: boolean;
}

/** The expansion's mods and the mods in the mods folder, with updates, on/off and remove. */
export default function InstalledMods({ identifier, state, onChanged, onUpdate, busy }: Props) {
    const updates = useQuery({ queryKey: modKeys.updates(identifier), queryFn: () => getUpdates(identifier), staleTime: 300_000, enabled: state.mods.some((mod) => mod.portal) });
    const [removing, setRemoving] = useState<InstalledMod | null>(null);
    const [working, setWorking] = useState<string | null>(null);

    const withUpdates = state.mods.filter((mod) => updates.data?.[mod.name]);

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
        return <p className={'fct:py-8 fct:text-center fct:text-sm fct:text-muted-foreground'}>No mods yet. Find some on the Browse tab.</p>;
    }

    return (
        <div className={'fct:flex fct:flex-col fct:gap-3'}>
            {withUpdates.length > 0 && (
                <div className={'fct:flex fct:items-center fct:justify-between fct:gap-3 fct:rounded-lg fct:border fct:border-primary/40 fct:bg-primary/10 fct:px-4 fct:py-2 fct:text-sm'}>
                    <span>{withUpdates.length === 1 ? 'An update is' : `${withUpdates.length} updates are`} available.</span>
                    <Button size={'small'} isLoading={busy} onClick={() => onUpdate(withUpdates.map((mod) => mod.name))}>
                        Update all
                    </Button>
                </div>
            )}

            {state.mods.map((mod) => {
                const update = updates.data?.[mod.name];

                return (
                    <div key={mod.name} className={'pt-surface fct:flex fct:flex-wrap fct:items-center fct:gap-3 fct:rounded-lg fct:border fct:border-border fct:bg-card fct:p-3'}>
                        {mod.builtIn ? (
                            <span className={'fct:flex fct:size-12 fct:shrink-0 fct:items-center fct:justify-center fct:rounded-md fct:bg-primary/15 fct:text-primary'}>
                                <NamedIcon name={'rocket'} size={22} />
                            </span>
                        ) : (
                            <ItemIcon src={mod.icon} className={'fct:size-12 fct:shrink-0'} />
                        )}
                        <div className={'fct:min-w-0 fct:flex-1'}>
                            <div className={'fct:flex fct:flex-wrap fct:items-center fct:gap-2'}>
                                {mod.url ? (
                                    <a href={mod.url} target={'_blank'} rel={'noreferrer'} className={'fct:font-semibold fct:hover:underline'}>
                                        {mod.title}
                                    </a>
                                ) : (
                                    <span className={'fct:font-semibold'}>{mod.title}</span>
                                )}
                                {mod.builtIn ? <Chip>Space Age expansion</Chip> : !mod.portal && <Chip>Added by hand</Chip>}
                                {mod.version && <Chip>{mod.version}</Chip>}
                                {mod.dependency && <Chip title={'Installed because another mod needs it'}>Needed by another mod</Chip>}
                            </div>
                            <div className={'fct:mt-1 fct:flex fct:flex-wrap fct:gap-1.5'}>
                                {mod.missing && (
                                    <Chip tone={'warning'} title={'The file is not in the mods folder'}>
                                        <NamedIcon name={'triangle-alert'} size={12} /> File missing
                                    </Chip>
                                )}
                                {update && (
                                    <Chip tone={'success'}>
                                        <NamedIcon name={'arrow-up'} size={12} /> {update} available
                                    </Chip>
                                )}
                                {mod.files.length > 0 && <span className={'fct:text-xs fct:text-muted-foreground'}>{mod.files.join(', ')}</span>}
                            </div>
                        </div>
                        <div className={'fct:flex fct:items-center fct:gap-2'}>
                            {update && (
                                <Button size={'small'} isSecondary isLoading={busy} onClick={() => onUpdate([mod.name])}>
                                    Update
                                </Button>
                            )}
                            {!mod.missing && (
                                <Switch
                                    checked={mod.enabled}
                                    disabled={working === mod.name}
                                    onChange={(enabled) => void run(mod.name, () => toggle(identifier, mod.name, enabled), enabled ? `${mod.title} is on.` : `${mod.title} is off.`)}
                                    aria-label={mod.enabled ? `Turn ${mod.title} off` : `Turn ${mod.title} on`}
                                />
                            )}
                            {!mod.builtIn && (
                                <Button.Text size={'small'} onClick={() => setRemoving(mod)} aria-label={`Remove ${mod.title}`}>
                                    <NamedIcon name={'trash-2'} size={16} />
                                </Button.Text>
                            )}
                        </div>
                    </div>
                );
            })}

            <p className={'fct:text-xs fct:text-muted-foreground'}>
                Mods live in the mods folder and are switched on and off in mods/mod-list.json. Changes load when the server restarts. Players need the same mods at the same versions; the game offers to download them when they join.
            </p>
            {updates.isFetching && <Spinner size={'small'} />}

            {removing && (
                <Dialog.Confirm
                    open
                    title={`Remove ${removing.title}?`}
                    confirm={'Remove'}
                    pending={working === 'remove'}
                    onClose={() => setRemoving(null)}
                    onConfirmed={() => void run('remove', () => remove(identifier, removing.name), `${removing.title} is removed.`).then(() => setRemoving(null))}
                >
                    Its file is deleted from the mods folder. Saves that use it may not load without it.
                </Dialog.Confirm>
            )}
        </div>
    );
}
