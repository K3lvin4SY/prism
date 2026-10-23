import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, NamedIcon, Select, Spinner, httpErrorToHuman, toast, useCurrentServerRequired } from '@pterodactyl/sdk';
import { api, keys, type PrismDatabase } from '../api';
import { Section } from '../components/ui';

/** Share the database with the person's other servers; it shows on their Databases page too. */
export default function SharingTab({ database }: { database: PrismDatabase }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const queryClient = useQueryClient();
    const servers = useQuery({ queryKey: keys.shares(identifier, database.id), queryFn: () => api.shareCandidates(identifier, database.id) });
    const [target, setTarget] = useState('');
    const [busy, setBusy] = useState(false);

    const act = async (action: () => Promise<unknown>, done: string) => {
        setBusy(true);
        try {
            await action();
            toast.success(done);
            setTarget('');
            await Promise.all([servers.refetch(), queryClient.invalidateQueries({ queryKey: keys.list(identifier) })]);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    if (servers.isLoading) return <Spinner centered />;
    if (servers.isError || !servers.data) return <Alert type={'danger'}>{httpErrorToHuman(servers.error)}</Alert>;

    const shared = servers.data.filter((server) => server.shared);
    const available = servers.data.filter((server) => !server.shared);

    return (
        <div className={'pdb:flex pdb:flex-col pdb:gap-4'}>
            <Section title={'Share with another server'}>
                <p className={'pdb:mb-3 pdb:text-sm pdb:text-muted-foreground'}>
                    The database appears on the other server&apos;s Databases page with the same login, so both can use it, for example one LuckPerms database for a whole network. People there need the database permissions on that server.
                </p>
                {available.length === 0 ? (
                    <p className={'pdb:text-sm pdb:text-muted-foreground'}>There are no other servers you can share it with.</p>
                ) : (
                    <div className={'pdb:flex pdb:flex-wrap pdb:gap-2'}>
                        {/* Remounted when the list changes, so a server just shared with is no longer shown as picked. */}
                        <div key={available.map((server) => server.identifier).join()} className={'pdb:min-w-64 pdb:flex-1'}>
                            <Select value={target} onChange={(value) => setTarget(String(value))} options={[{ value: '', label: 'Find one of your servers…' }, ...available.map((server) => ({ value: server.identifier, label: server.name }))]} />
                        </div>
                        <Button disabled={!target} isLoading={busy} onClick={() => act(() => api.share(identifier, database.id, target), 'Shared.')}>
                            Share
                        </Button>
                    </div>
                )}
            </Section>
            <Section title={'Shared with'}>
                {shared.length === 0 ? (
                    <p className={'pdb:text-sm pdb:text-muted-foreground'}>Not shared with any other server.</p>
                ) : (
                    <div className={'pdb:flex pdb:flex-col pdb:gap-2'}>
                        {shared.map((server) => (
                            <div key={server.identifier} className={'pdb:flex pdb:items-center pdb:gap-3'}>
                                <NamedIcon name={'server'} size={15} className={'pdb:text-muted-foreground'} />
                                <span className={'pdb:flex-1 pdb:text-sm'}>{server.name}</span>
                                <Button.Danger size={'small'} isSecondary disabled={busy} onClick={() => act(() => api.unshare(identifier, database.id, server.identifier), `No longer shared with ${server.name}.`)}>
                                    Stop sharing
                                </Button.Danger>
                            </div>
                        ))}
                    </div>
                )}
            </Section>
        </div>
    );
}
