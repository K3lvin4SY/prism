import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Dialog, Input, Spinner, httpErrorToHuman } from '@pterodactyl/sdk';
import { getPermissionGroups, permissionsKey, type Role, type RoleInput } from '../api';
import { NamedIcon } from '../icons';
import { WEBSOCKET, toggleGroup } from '../lib/permissions';

const eyebrow = 'prl:font-mono prl:text-xs prl:font-medium prl:uppercase prl:tracking-[0.18em] prl:text-muted-foreground';

export const COLORS = ['#64748b', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899'];

const title = (prefix: string) => {
    const name = prefix.replace(/^ext\./, '');

    return name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ');
};

/** Making or changing a role: its name, color, a line about it, and its permissions by group. */
export default function RoleDialog({ role, onClose, onSave }: { role: Role | null; onClose: () => void; onSave: (input: RoleInput) => Promise<void> }) {
    const groups = useQuery({ queryKey: permissionsKey, queryFn: getPermissionGroups, staleTime: 5 * 60_000 });
    const [name, setName] = useState(role?.name ?? '');
    const [description, setDescription] = useState(role?.description ?? '');
    const [color, setColor] = useState<string | null>(role?.color ?? COLORS[1]);
    const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? [WEBSOCKET]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const ready = name.trim() !== '' && permissions.some((key) => key !== WEBSOCKET);
    const toggle = (key: string, on: boolean) => setPermissions((list) => (on ? [...new Set([...list, key])] : list.filter((entry) => entry !== key)).sort());

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            await onSave({ name: name.trim(), description: description.trim(), color, permissions });
        } catch (caught) {
            setError(httpErrorToHuman(caught));
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} preventExternalClose title={role ? `Change ${role.name}` : 'New role'}>
            <div className={'prl-role-editor prl:flex prl:flex-col prl:gap-4'}>
                {error && <Alert type={'danger'}>{error}</Alert>}
                {role && (role.used ?? 0) > 0 && <Alert type={'info'}>{role.used === 1 ? 'One subuser has' : `${role.used} subusers have`} this role. Saving gives them the new permissions, unless their permissions were changed by hand.</Alert>}

                <div className={'prl:grid prl:gap-3 prl:sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'}>
                    <label className={'prl:flex prl:flex-col prl:gap-1.5'}>
                        <span className={eyebrow}>Name</span>
                        <Input value={name} maxLength={48} placeholder={'Moderator'} onChange={(event) => setName(event.target.value)} />
                    </label>
                    <label className={'prl:flex prl:flex-col prl:gap-1.5'}>
                        <span className={eyebrow}>What it is for</span>
                        <Input value={description} maxLength={255} placeholder={'Runs console commands and restarts the server.'} onChange={(event) => setDescription(event.target.value)} />
                    </label>
                </div>

                <div className={'prl:flex prl:items-center prl:gap-1.5'} role={'radiogroup'} aria-label={'Color'}>
                    {COLORS.map((value) => (
                        <button
                            key={value}
                            type={'button'}
                            role={'radio'}
                            aria-checked={color === value}
                            aria-label={value}
                            onClick={() => setColor(value)}
                            className={'prl:size-6 prl:rounded-full ' + (color === value ? 'prl:ring-2 prl:ring-primary prl:ring-offset-2 prl:ring-offset-card' : '')}
                            style={{ backgroundColor: value }}
                        />
                    ))}
                </div>

                <div className={'prl:flex prl:flex-col prl:gap-2'}>
                    <span className={eyebrow}>Permissions · {permissions.filter((key) => key !== WEBSOCKET).length} picked</span>
                    {groups.isLoading && <Spinner size={'small'} />}
                    {groups.isError && <Alert type={'danger'}>{httpErrorToHuman(groups.error)}</Alert>}
                    <div className={'prl:grid prl:max-h-[50vh] prl:gap-3 prl:overflow-y-auto prl:pr-1 prl:sm:grid-cols-2 prl:lg:grid-cols-3'}>
                        {Object.entries(groups.data ?? {})
                            .filter(([prefix]) => prefix !== 'websocket')
                            .map(([prefix, group]) => {
                                const keys = Object.keys(group.keys).map((key) => `${prefix}.${key}`);
                                const on = keys.filter((key) => permissions.includes(key)).length;

                                return (
                                    <fieldset key={prefix} className={'pt-surface prl:flex prl:flex-col prl:gap-1.5 prl:rounded-lg prl:border prl:border-border prl:p-3'}>
                                        <legend className={'prl:sr-only'}>{title(prefix)}</legend>
                                        <label className={'prl:flex prl:items-center prl:gap-2 prl:text-sm prl:font-semibold'} title={group.description}>
                                            <Checkbox checked={on === keys.length} indeterminate={on > 0 && on < keys.length} onChange={(value: boolean) => setPermissions((list) => toggleGroup(list, prefix, group, value))} />
                                            {title(prefix)}
                                        </label>
                                        {Object.entries(group.keys).map(([key, help]) => (
                                            <label key={key} className={'prl:flex prl:items-center prl:gap-2 prl:pl-6 prl:text-sm prl:text-muted-foreground'} title={help}>
                                                <Checkbox checked={permissions.includes(`${prefix}.${key}`)} onChange={(value: boolean) => toggle(`${prefix}.${key}`, value)} />
                                                {key.replace(/[-_]/g, ' ')}
                                            </label>
                                        ))}
                                    </fieldset>
                                );
                            })}
                    </div>
                    <p className={'prl:flex prl:items-center prl:gap-1.5 prl:text-xs prl:text-muted-foreground'}>
                        <NamedIcon name={'info'} size={12} /> Watching the console is always given. Someone giving a role never gives a permission they do not have themselves.
                    </p>
                </div>
            </div>

            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button disabled={!ready} isLoading={busy} onClick={() => void save()}>
                    {role ? 'Save' : 'Add role'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
