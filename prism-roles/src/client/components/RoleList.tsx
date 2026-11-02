import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Dialog, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import type { Role, RoleStore } from '../api';
import { NamedIcon } from '../icons';
import { permissionLabel } from '../lib/permissions';
import RoleDialog from './RoleDialog';

interface Props {
    title: string;
    intro: string;
    roles: Role[];
    /** Where new and changed roles are saved; null when this list is read only. */
    store: RoleStore | null;
    canAdd?: boolean;
    addHint?: string;
}

/** A card of roles with their permissions, and making, changing and deleting them when allowed. */
export default function RoleList({ title, intro, roles, store, canAdd = true, addHint }: Props) {
    const client = useQueryClient();
    const [editing, setEditing] = useState<Role | 'new' | null>(null);
    const [deleting, setDeleting] = useState<Role | null>(null);
    const [busy, setBusy] = useState(false);

    const refresh = () => client.invalidateQueries({ queryKey: ['prism-roles'] });

    return (
        <section className={'pt-surface prl:overflow-hidden prl:rounded-xl prl:border prl:border-border prl:bg-card'}>
            <header className={'prl:flex prl:flex-wrap prl:items-center prl:gap-3 prl:border-b prl:border-border prl:px-5 prl:py-4'}>
                <div className={'prl:min-w-0 prl:flex-1'}>
                    <h2 className={'prl:font-header prl:text-lg prl:font-semibold'}>{title}</h2>
                    <p className={'prl:text-sm prl:text-muted-foreground'}>{intro}</p>
                </div>
                {store && (
                    <Button disabled={!canAdd} title={!canAdd ? addHint : undefined} onClick={() => setEditing('new')}>
                        <NamedIcon name={'plus'} size={16} className={'prl:mr-1'} /> New role
                    </Button>
                )}
            </header>

            {roles.length === 0 && <p className={'prl:px-5 prl:py-8 prl:text-center prl:text-sm prl:text-muted-foreground'}>No roles yet.</p>}

            {roles.map((role) => (
                <div key={role.id} className={'prl:grid prl:gap-x-4 prl:gap-y-2 prl:border-b prl:border-border prl:px-5 prl:py-3.5 prl:last:border-b-0 prl:md:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)_auto]'}>
                    <div className={'prl:min-w-0'}>
                        <p className={'prl:flex prl:items-center prl:gap-2 prl:font-semibold'}>
                            <span aria-hidden className={'prl:size-2.5 prl:shrink-0 prl:rounded-full'} style={{ backgroundColor: role.color ?? 'currentColor' }} />
                            <span className={'prl:truncate'}>{role.name}</span>
                        </p>
                        <p className={'prl:text-xs prl:text-muted-foreground'}>
                            {role.description || '—'}
                            {role.used ? ` · ${role.used} subuser${role.used === 1 ? '' : 's'}` : ''}
                        </p>
                    </div>
                    <div className={'prl:flex prl:min-w-0 prl:flex-wrap prl:gap-1.5'}>
                        {role.permissions
                            .filter((key) => key !== 'websocket.connect')
                            .map((key) => (
                                <Badge key={key} size={'sm'} variant={'soft'} tone={'neutral'}>
                                    {permissionLabel(key)}
                                </Badge>
                            ))}
                    </div>
                    {store && (
                        <div className={'prl:flex prl:items-start prl:justify-end prl:gap-2'}>
                            <Button.Text size={'small'} onClick={() => setEditing(role)}>
                                <NamedIcon name={'pencil'} size={14} className={'prl:mr-1'} /> Change
                            </Button.Text>
                            <Button.Danger size={'small'} isSecondary onClick={() => setDeleting(role)}>
                                Delete
                            </Button.Danger>
                        </div>
                    )}
                </div>
            ))}

            {store && editing && (
                <RoleDialog
                    role={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSave={async (input) => {
                        const saved = await store.save(input, editing === 'new' ? undefined : editing.id);
                        setEditing(null);
                        const changed = saved.meta?.changed ?? 0;
                        toast.success(changed > 0 ? `Saved. ${changed} subuser${changed === 1 ? '' : 's'} got the new permissions.` : 'Saved.');
                        await refresh();
                    }}
                />
            )}

            {store && deleting && (
                <Dialog.Confirm
                    open
                    title={`Delete ${deleting.name}?`}
                    confirm={'Delete'}
                    pending={busy}
                    onClose={() => setDeleting(null)}
                    onConfirmed={async () => {
                        setBusy(true);
                        try {
                            await store.remove(deleting.id);
                            setDeleting(null);
                            await refresh();
                        } catch (error) {
                            toast.error(httpErrorToHuman(error));
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    Subusers who have it keep their permissions; they are just no longer linked to a role.
                </Dialog.Confirm>
            )}
        </section>
    );
}
