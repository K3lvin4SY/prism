import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, httpErrorToHuman, toast, useCurrentServerRequired, useServerPermission, type RouteSlotData } from '@pterodactyl/sdk';
import { assignmentsKey, getAssignments, reapply, unlink, type Assignment } from '../api';
import { configStore } from '../config';

const eyebrow = 'prl:font-mono prl:text-xs prl:font-medium prl:uppercase prl:tracking-[0.18em] prl:text-muted-foreground';

/** Below the subuser list: which role each subuser has, and whether they still follow it. */
export default function RoleLinks(_: { data: RouteSlotData }) {
    const config = configStore.use();
    const server = useCurrentServerRequired().attributes.identifier;
    const canChange = useServerPermission(['user.update', 'user.create'], true);
    const client = useQueryClient();
    const query = useQuery({ queryKey: assignmentsKey(server), queryFn: () => getAssignments(server), enabled: config.enabled, retry: false });
    const [busy, setBusy] = useState<string | null>(null);

    if (!config.enabled || !query.data || query.data.length === 0) return null;

    const act = async (assignment: Assignment, action: 'reapply' | 'unlink') => {
        setBusy(assignment.subuser);
        try {
            await (action === 'reapply' ? reapply(server, assignment.subuser) : unlink(server, assignment.subuser));
            toast.success(action === 'reapply' ? `${assignment.username} has the ${assignment.role.name} permissions again.` : `${assignment.username} keeps their permissions, no longer linked to ${assignment.role.name}.`);
            // The panel's own subuser list shows the new permissions.
            await client.invalidateQueries({ predicate: (entry) => JSON.stringify(entry.queryKey).includes('users') || entry.queryKey[0] === 'prism-roles' });
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className={'pt-surface prl:mt-4 prl:rounded-xl prl:border prl:border-border prl:bg-card prl:px-5 prl:py-4'}>
            <h2 className={eyebrow + ' prl:mb-3'}>Roles</h2>
            <div className={'prl:flex prl:flex-col prl:gap-2'}>
                {query.data.map((assignment) => (
                    <div key={assignment.subuser} className={'prl:flex prl:flex-wrap prl:items-center prl:gap-x-3 prl:gap-y-1'}>
                        <span className={'prl:min-w-0 prl:flex-1 prl:truncate prl:text-sm prl:font-medium'}>{assignment.username}</span>
                        <span className={'prl:flex prl:items-center prl:gap-1.5 prl:text-sm'}>
                            <span aria-hidden className={'prl:size-2.5 prl:rounded-full'} style={{ backgroundColor: assignment.role.color ?? 'currentColor' }} />
                            {assignment.role.name}
                        </span>
                        <Badge size={'sm'} variant={'soft'} tone={assignment.customised ? 'warning' : assignment.current ? 'success' : 'neutral'} title={assignment.customised ? 'Their permissions were changed by hand, so changes to the role leave them alone.' : assignment.current ? undefined : 'The role changed and could not be given again, because whoever gave it no longer may.'}>
                            {assignment.customised ? 'Changed by hand' : assignment.current ? 'Follows the role' : 'Behind the role'}
                        </Badge>
                        {canChange && (
                            <span className={'prl:flex prl:gap-1'}>
                                {(assignment.customised || !assignment.current) && (
                                    <Button.Text size={'small'} disabled={busy !== null} onClick={() => void act(assignment, 'reapply')}>
                                        Give the role again
                                    </Button.Text>
                                )}
                                <Button.Text size={'small'} disabled={busy !== null} onClick={() => void act(assignment, 'unlink')}>
                                    Unlink
                                </Button.Text>
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
