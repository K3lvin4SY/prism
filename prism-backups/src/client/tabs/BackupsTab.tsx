import { useState } from 'react';
import { Button, Dialog, Input, Spinner, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import type { State } from '../api';
import { bytes, copy, day, duration } from '../components/ui';
import type { Model } from '../views/BackupsView';

type Backup = Model['backups'][number];

/** The backups grouped by day, with the profile each was made with. */
export default function BackupsTab({ model, state, onOpen }: { model: Model; state: State; onOpen: (uuid: string) => void }) {
    const [search, setSearch] = useState('');
    const [removing, setRemoving] = useState<Backup | null>(null);
    const query = search.trim().toLowerCase();

    const shown = model.backups.filter((backup) => !query || [backup.name, state.meta[backup.uuid] ?? '', backup.checksum ?? '', backup.uuid].some((text) => text.toLowerCase().includes(query)));
    const groups: { day: string; backups: Backup[] }[] = [];
    for (const backup of shown) {
        const label = day(backup.createdAt);
        const group = groups.find((item) => item.day === label);
        group ? group.backups.push(backup) : groups.push({ day: label, backups: [backup] });
    }

    if (model.backups.length === 0) {
        return (
            <div className={'pbk:flex pbk:flex-col pbk:items-center pbk:gap-2 pbk:rounded-lg pbk:border pbk:border-dashed pbk:border-border pbk:py-12 pbk:text-center'}>
                <NamedIcon name={'archive'} size={32} className={'pbk:text-muted-foreground'} />
                <p className={'pbk:font-medium'}>No backups yet</p>
                <p className={'pbk:text-sm pbk:text-muted-foreground'}>{model.limit === 0 ? 'Ask your host for backups.' : 'Create one now, or let a schedule make them.'}</p>
            </div>
        );
    }

    return (
        <div className={'pbk:flex pbk:flex-col pbk:gap-4'}>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={'Search by name, profile or checksum'} className={'pbk:max-w-md'} />

            {groups.length === 0 && <p className={'pbk:text-sm pbk:text-muted-foreground'}>No backup on this page matches.</p>}

            {groups.map((group) => (
                <section key={group.day} className={'pbk:flex pbk:flex-col pbk:gap-2'}>
                    <h3 className={'pbk:text-xs pbk:font-semibold pbk:uppercase pbk:tracking-wide pbk:text-muted-foreground'}>{group.day}</h3>
                    <div className={'pbk:flex pbk:flex-col pbk:divide-y pbk:divide-border pbk:overflow-hidden pbk:rounded-lg pbk:border pbk:border-border pbk:bg-card'}>
                        {group.backups.map((backup) => (
                            <Row key={backup.uuid} model={model} backup={backup} profile={state.meta[backup.uuid] ?? null} opened={state.opened.includes(backup.uuid)} onOpen={() => onOpen(backup.uuid)} onRemove={() => setRemoving(backup)} />
                        ))}
                    </div>
                </section>
            ))}

            {model.pagination.total > model.pagination.perPage && (
                <div className={'pbk:flex pbk:items-center pbk:justify-center pbk:gap-3 pbk:text-sm'}>
                    <Button.Text size={'small'} disabled={model.pagination.page <= 1} onClick={() => model.actions.setPage(model.pagination.page - 1)}>
                        <NamedIcon name={'chevron-left'} size={14} /> Newer
                    </Button.Text>
                    <span className={'pbk:text-muted-foreground'}>
                        Page {model.pagination.page} of {Math.ceil(model.pagination.total / model.pagination.perPage)}
                    </span>
                    <Button.Text size={'small'} disabled={model.pagination.page * model.pagination.perPage >= model.pagination.total} onClick={() => model.actions.setPage(model.pagination.page + 1)}>
                        Older <NamedIcon name={'chevron-right'} size={14} />
                    </Button.Text>
                </div>
            )}

            {removing && (
                <Dialog.Confirm
                    open
                    title={`Delete ${removing.name}?`}
                    confirm={'Delete backup'}
                    pending={model.pending.remove}
                    onClose={() => setRemoving(null)}
                    onConfirmed={async () => {
                        await model.actions.remove(removing.uuid);
                        setRemoving(null);
                    }}
                >
                    The backup and everything in it are gone for good.
                </Dialog.Confirm>
            )}
        </div>
    );
}

function Row({ model, backup, profile, opened, onOpen, onRemove }: { model: Model; backup: Backup; profile: string | null; opened: boolean; onOpen: () => void; onRemove: () => void }) {
    const running = backup.completedAt === null;
    const failed = !running && !backup.successful;
    const took = duration(backup.createdAt, backup.completedAt);

    return (
        <div className={'pbk:flex pbk:flex-wrap pbk:items-center pbk:gap-3 pbk:px-4 pbk:py-3'}>
            <button type={'button'} onClick={onOpen} disabled={running} className={'pbk:flex pbk:min-w-0 pbk:flex-1 pbk:cursor-pointer pbk:items-center pbk:gap-3 pbk:text-left pbk:disabled:cursor-default'}>
                <span className={cn('pbk:flex pbk:size-9 pbk:shrink-0 pbk:items-center pbk:justify-center pbk:rounded-lg', failed ? 'pbk:bg-destructive/15 pbk:text-destructive' : 'pbk:bg-primary/15 pbk:text-primary')}>
                    {running ? <Spinner size={'small'} /> : <NamedIcon name={failed ? 'circle-x' : backup.locked ? 'lock' : 'archive'} size={16} />}
                </span>
                <span className={'pbk:flex pbk:min-w-0 pbk:flex-col'}>
                    <span className={'pbk:flex pbk:items-center pbk:gap-2'}>
                        <span className={'pbk:truncate pbk:font-medium'}>{backup.name}</span>
                        {profile && <span className={'pbk:shrink-0 pbk:rounded pbk:bg-primary/15 pbk:px-1.5 pbk:py-0.5 pbk:text-xs pbk:text-primary'}>{profile}</span>}
                        {opened && (
                            <span title={'The panel has a copy, so browsing is quick.'} className={'pbk:shrink-0 pbk:text-muted-foreground'}>
                                <NamedIcon name={'folder-open'} size={13} />
                            </span>
                        )}
                    </span>
                    <span className={'pbk:truncate pbk:text-xs pbk:text-muted-foreground'}>
                        {running ? 'Being made…' : failed ? 'Failed' : [new Date(backup.createdAt).toLocaleTimeString(), bytes(backup.bytes), took && `took ${took}`].filter(Boolean).join(' · ')}
                    </span>
                </span>
            </button>

            {backup.checksum && (
                <button type={'button'} onClick={() => copy(backup.checksum!, 'Checksum copied')} className={'pbk:hidden pbk:max-w-40 pbk:cursor-pointer pbk:truncate pbk:font-mono pbk:text-xs pbk:text-muted-foreground pbk:hover:text-foreground pbk:md:block'} title={backup.checksum}>
                    {backup.checksum}
                </button>
            )}

            {!running && (
                <div className={'pbk:flex pbk:shrink-0 pbk:items-center pbk:gap-1'}>
                    {backup.successful && model.permissions.download && (
                        <Button.Text title={'Download'} size={'small'} aria-label={'Download'} disabled={model.pending.download} onClick={() => void model.actions.download(backup.uuid)}>
                                <NamedIcon name={'download'} size={15} />
                            </Button.Text>
                    )}
                    {model.permissions.delete && (
                        <Button.Text title={backup.locked ? 'Unlock' : 'Lock'} size={'small'} aria-label={backup.locked ? 'Unlock' : 'Lock'} disabled={model.pending.lock} onClick={() => void model.actions.toggleLock(backup.uuid)}>
                                <NamedIcon name={backup.locked ? 'lock-open' : 'lock'} size={15} />
                            </Button.Text>
                    )}
                    {model.permissions.delete && (
                        <Button.Text title={backup.locked ? 'Unlock it to delete it' : 'Delete'} size={'small'} aria-label={'Delete'} disabled={backup.locked} onClick={onRemove}>
                                <NamedIcon name={'trash-2'} size={15} />
                            </Button.Text>
                    )}
                    {backup.successful && (
                        <Button isSecondary size={'small'} onClick={onOpen}>
                            Open
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
