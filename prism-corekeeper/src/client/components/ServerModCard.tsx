import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Spinner, Switch, fromNow, http, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { getServerMod, setServerMod, type ServerModStatus } from '../api/servermod';
import { NamedIcon } from '../icons';

/**
 * The Prism server mod switch. Off by default: without it the Map and Players tabs use only the
 * server's files and log. It takes effect when the server next starts.
 */
export default function ServerModCard({ identifier }: { identifier: string }) {
    const queryClient = useQueryClient();
    const state = useQuery({ queryKey: keys.serverMod(identifier), queryFn: () => getServerMod(identifier), refetchInterval: 30_000 });
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
            {data && !data.outdated && <Status status={data.status} />}
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

/** What each part of the report is, for its problem line. */
const PARTS: Record<string, string> = {
    health: 'Health',
    hunger: 'Food',
    skills: 'Skills',
    gear: 'Gear',
    character: 'Character',
    syncs: 'Map syncs',
    syncWatch: 'Watching map syncs',
    report: 'The whole report',
    shutdown: 'Stopping',
};

/** How the mod is doing on the running server. */
function Status({ status }: { status: ServerModStatus }) {
    if (status.state === 'off' || status.state === 'stopped') {
        return null;
    }
    if (status.state === 'failed') {
        return (
            <Alert type={'danger'}>
                <div className={'cks:flex cks:flex-col cks:gap-1'}>
                    <span>The game could not compile the Prism server mod, most likely after a game update changed something it reads. Players and the map keep working from the log and files; update Prism Core Keeper for a fixed mod.</span>
                    {status.errors.map((error) => (
                        <code key={error} className={'cks:font-mono cks:text-xs cks:break-all'}>
                            {error}
                        </code>
                    ))}
                </div>
            </Alert>
        );
    }
    if (status.state === 'loading') {
        return <p className={'cks:text-sm cks:text-muted-foreground'}>The game has not loaded the mod yet. It does while the server starts.</p>;
    }
    if (status.state === 'quiet') {
        return <p className={'cks:text-sm cks:text-muted-foreground'}>Loaded, waiting for the world.{status.reportedAt ? ` Last report ${fromNow(new Date(status.reportedAt * 1000).toISOString())}.` : ''}</p>;
    }

    const problems = Object.entries(status.problems);

    return (
        <div className={'cks:flex cks:flex-col cks:gap-2'}>
            <p className={'cks:flex cks:items-center cks:gap-1.5 cks:text-sm'}>
                <NamedIcon name={'circle-check'} size={15} className={'cks:text-success'} />
                Reporting{status.reportedAt ? `, last ${fromNow(new Date(status.reportedAt * 1000).toISOString())}` : ''}.
                {status.syncWatch === 'frame' && <span className={'cks:text-muted-foreground'}> Map syncs are caught once a frame, so a few may be missed.</span>}
            </p>
            {problems.length > 0 && (
                <Alert type={'warning'}>
                    <div className={'cks:flex cks:flex-col cks:gap-1'}>
                        <span>Parts of the report failed and are left out until they work again:</span>
                        {problems.map(([part, message]) => (
                            <span key={part} className={'cks:text-xs'}>
                                <strong>{PARTS[part] ?? part}:</strong> <code className={'cks:font-mono cks:break-all'}>{message}</code>
                            </span>
                        ))}
                    </div>
                </Alert>
            )}
        </div>
    );
}
