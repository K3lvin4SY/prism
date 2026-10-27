import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Spinner, Switch, http, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { getServerMod, setServerMod } from '../api/servermod';
import { NamedIcon } from '../icons';

/**
 * The Prism server mod switch. Off by default: without it the Map and Players tabs use only the
 * server's files and log. It takes effect when the server next starts.
 */
export default function ServerModCard({ identifier }: { identifier: string }) {
    const queryClient = useQueryClient();
    const state = useQuery({ queryKey: keys.serverMod(identifier), queryFn: () => getServerMod(identifier) });
    const [busy, setBusy] = useState(false);
    const [pending, setPending] = useState(false);

    const change = async (enabled: boolean) => {
        setBusy(true);
        try {
            queryClient.setQueryData(keys.serverMod(identifier), await setServerMod(identifier, enabled));
            setPending(true);
            toast.success(enabled ? 'The Prism server mod is on the server. It loads when the server restarts.' : 'The Prism server mod is removed. It stops when the server restarts.');
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    const restart = async () => {
        setBusy(true);
        try {
            await http.post(`/api/client/servers/${identifier}/power`, { signal: 'restart' });
            setPending(false);
            toast.success('Restarting the server.');
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    const data = state.data;

    return (
        <section className={'pt-surface cks:flex cks:flex-col cks:gap-3 cks:rounded-lg cks:border cks:border-border cks:bg-card cks:p-4'}>
            <div className={'cks:flex cks:items-center cks:gap-2'}>
                <NamedIcon name={'plug'} size={18} className={'cks:text-primary'} />
                <h2 className={'cks:flex-1 cks:font-semibold'}>Prism server mod</h2>
                {data ? <Switch checked={data.enabled} disabled={busy} onChange={(checked) => void change(checked)} label={data.enabled ? 'On' : 'Off'} /> : <Spinner size={'small'} />}
            </div>
            <p className={'cks:text-sm cks:text-muted-foreground'}>
                A small server-only mod from Prism Core Keeper; players do not need it. It tells the Panel who adds their map at a Cartography Table, and each player's skills, health, food, gear and character, kept on their page until their next visit. It reads the game only and changes nothing in it.
            </p>
            {data?.outdated && (
                <div className={'cks:flex cks:flex-wrap cks:items-center cks:gap-2 cks:text-sm'}>
                    <span className={'cks:flex-1'}>
                        {data.installed ? `The server has version ${data.installed}; this Panel brings ${data.version}.` : 'The mod is missing from the server.'}
                    </span>
                    <Button size={'small'} isLoading={busy} onClick={() => void change(true)}>
                        Update the Prism server mod
                    </Button>
                </div>
            )}
            {pending && data?.running && (
                <div className={'cks:flex cks:flex-wrap cks:items-center cks:gap-2 cks:text-sm'}>
                    <span className={'cks:flex-1'}>Restart the server for this to take effect.</span>
                    <Button size={'small'} isSecondary isLoading={busy} onClick={() => void restart()}>
                        Restart now
                    </Button>
                </div>
            )}
        </section>
    );
}
