import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select, httpErrorToHuman, toast, useCurrentServerRequired, type SubuserPermissionsSlotData } from '@pterodactyl/sdk';
import { forgetPending, getServerRoles, serverRolesKey, setPending, type Role } from '../api';
import { configStore } from '../config';
import { NamedIcon } from '../icons';
import { applyRole, matching, missing, permissionLabel } from '../lib/permissions';

const eyebrow = 'prl:font-mono prl:text-xs prl:font-medium prl:uppercase prl:tracking-[0.18em] prl:text-muted-foreground';

const SCOPE: Record<Role['scope'], string> = { panel: 'Panel-wide', mine: 'Yours', owner: 'The server owner\'s' };

/**
 * "Apply a role" above the subuser form's permissions. Picking one ticks its permissions; saving
 * the subuser with them links the subuser to the role, so changing the role later changes them.
 */
export default function RolePicker({ data }: { data: SubuserPermissionsSlotData }) {
    const config = configStore.use();
    const server = useCurrentServerRequired().attributes.identifier;
    const roles = useQuery({ queryKey: serverRolesKey(server), queryFn: () => getServerRoles(server), enabled: config.enabled, retry: false, staleTime: 60_000 });
    const [applied, setApplied] = useState<Role | null>(null);
    const pending = useRef(false);

    // A role applied and never saved is forgotten when the form closes.
    useEffect(
        () => () => {
            if (pending.current) void forgetPending(server).catch(() => undefined);
        },
        [server],
    );

    if (!config.enabled || !roles.data || roles.data.length === 0) return null;

    const current = matching(roles.data, data.selectedPermissions);
    const left = applied ? missing(applied, data.editablePermissions) : [];

    const apply = async (id: number) => {
        const role = roles.data.find((entry) => entry.id === id);
        if (!role) return;
        const permissions = applyRole(role, data.selectedPermissions, data.editablePermissions);
        data.setPermissions(permissions);
        setApplied(role);
        try {
            await setPending(server, role.id, permissions);
            pending.current = true;
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        }
    };

    const groups = (['panel', 'owner', 'mine'] as const)
        .map((scope) => ({ id: scope, label: SCOPE[scope], options: roles.data.filter((role) => role.scope === scope).map((role) => ({ value: role.id, label: role.name, textLabel: role.name })) }))
        .filter((group) => group.options.length > 0);

    return (
        <div className={'pt-surface prl:mb-4 prl:flex prl:flex-col prl:gap-2 prl:rounded-lg prl:border prl:border-border prl:bg-card prl:p-4'}>
            <div className={'prl:flex prl:flex-wrap prl:items-center prl:gap-3'}>
                <div className={'prl:min-w-0 prl:flex-1'}>
                    <p className={eyebrow}>Apply a role</p>
                    <p className={'prl:text-sm prl:text-muted-foreground'}>
                        {current ? (
                            <>
                                These permissions are the <strong className={'prl:text-foreground'}>{current.name}</strong> role.
                            </>
                        ) : (
                            'Tick a role\'s permissions at once. Saving links the subuser to it, so changing the role later changes them too.'
                        )}
                    </p>
                </div>
                <div className={'prl:w-full prl:sm:w-64'}>
                    <Select value={applied?.id ?? current?.id ?? null} onChange={(value) => void apply(Number(value))} groups={groups} placeholder={'Pick a role'} disabled={data.disabled} />
                </div>
            </div>
            {applied?.description && <p className={'prl:text-xs prl:text-muted-foreground'}>{applied.description}</p>}
            {left.length > 0 && (
                <p className={'prl:flex prl:items-start prl:gap-1.5 prl:text-xs prl:text-muted-foreground'}>
                    <NamedIcon name={'info'} size={12} className={'prl:mt-0.5 prl:shrink-0'} />
                    Left out because you do not have them yourself: {left.map(permissionLabel).join(', ')}.
                </p>
            )}
        </div>
    );
}
