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

/** The mods in FactoryGame/Mods, with where they came from, updates, on/off and remove. */
export default function InstalledMods({ identifier, state, onChanged, onUpdate, busy }: Props) {
    const updates = useQuery({ queryKey: modKeys.updates(identifier), queryFn: () => getUpdates(identifier), staleTime: 300_000, enabled: state.mods.some((mod) => mod.repository) });
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
        return <p className={'sfy:py-8 sfy:text-center sfy:text-sm sfy:text-muted-foreground'}>No mods yet. Find some on the Browse tab.</p>;
    }

    return (
        <div className={'sfy:flex sfy:flex-col sfy:gap-3'}>
            {withUpdates.length > 0 && (
                <div className={'sfy:flex sfy:items-center sfy:justify-between sfy:gap-3 sfy:rounded-lg sfy:border sfy:border-primary/40 sfy:bg-primary/10 sfy:px-4 sfy:py-2 sfy:text-sm'}>
                    <span>{withUpdates.length === 1 ? 'An update is' : `${withUpdates.length} updates are`} available.</span>
                    <Button size={'small'} isLoading={busy} onClick={() => onUpdate(withUpdates.map((mod) => mod.name))}>
                        Update all
                    </Button>
                </div>
            )}

            {state.mods.map((mod) => {
                const update = updates.data?.[mod.name];

                return (
                    <div key={mod.name} className={'pt-surface sfy:flex sfy:flex-wrap sfy:items-center sfy:gap-3 sfy:rounded-lg sfy:border sfy:border-border sfy:bg-card sfy:p-3'}>
                        <ItemIcon src={mod.icon} className={'sfy:size-12 sfy:shrink-0'} />
                        <div className={'sfy:min-w-0 sfy:flex-1'}>
                            <div className={'sfy:flex sfy:flex-wrap sfy:items-center sfy:gap-2'}>
                                {mod.url ? (
                                    <a href={mod.url} target={'_blank'} rel={'noreferrer'} className={'sfy:font-semibold sfy:hover:underline'}>
                                        {mod.title}
                                    </a>
                                ) : (
                                    <span className={'sfy:font-semibold'}>{mod.title}</span>
                                )}
                                {!mod.repository && <Chip>Added by hand</Chip>}
                                {mod.version && <Chip>{mod.version}</Chip>}
                                {mod.dependency && <Chip title={'Installed because another mod needs it'}>Needed by another mod</Chip>}
                            </div>
                            <div className={'sfy:mt-1 sfy:flex sfy:flex-wrap sfy:gap-1.5'}>
                                {mod.missing && (
                                    <Chip tone={'warning'} title={'The folder is not in FactoryGame/Mods'}>
                                        <NamedIcon name={'triangle-alert'} size={12} /> Folder missing
                                    </Chip>
                                )}
                                {!mod.missing && !mod.plugin && <Chip tone={'warning'}>No .uplugin: the game ignores it</Chip>}
                                {update && (
                                    <Chip tone={'success'}>
                                        <NamedIcon name={'arrow-up'} size={12} /> {update} available
                                    </Chip>
                                )}
                            </div>
                        </div>
                        <div className={'sfy:flex sfy:items-center sfy:gap-2'}>
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
                            <Button.Text size={'small'} onClick={() => setRemoving(mod)} aria-label={`Remove ${mod.title}`}>
                                <NamedIcon name={'trash-2'} size={16} />
                            </Button.Text>
                        </div>
                    </div>
                );
            })}

            <p className={'sfy:text-xs sfy:text-muted-foreground'}>
                Mods live in FactoryGame/Mods; turned-off ones wait in .sfy/disabled. Changes load when the server restarts. Players need the same mods at the same versions, from the Satisfactory Mod Manager.
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
                    Its folder is deleted from the server. Saves that use it may not load without it.
                </Dialog.Confirm>
            )}
        </div>
    );
}
