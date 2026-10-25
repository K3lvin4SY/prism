import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Spinner, httpErrorToHuman, useCurrentServerRequired } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import type { ViewProps } from '@pterodactyl/sdk/theme';
import { api, keys } from '../api';
import CreateDialog from '../components/CreateDialog';
import { Pills, bytes } from '../components/ui';
import { applyConfig, getConfig } from '../config';
import BackupDetail from '../tabs/BackupDetail';
import BackupsTab from '../tabs/BackupsTab';
import IgnoreTab from '../tabs/IgnoreTab';
import ProfilesTab from '../tabs/ProfilesTab';

export type Model = ViewProps<'server.backups'>['model'];
type Tab = 'backups' | 'profiles' | 'ignore';

/** The tab and open backup live in the address bar's hash, so a reload keeps them. */
function readHash(): { tab: Tab; backup: string | null } {
    const match = window.location.hash.match(/^#(profiles|ignore|backup-([0-9a-f-]{36}))$/);
    if (!match) return { tab: 'backups', backup: null };
    if (match[2]) return { tab: 'backups', backup: match[2] };

    return { tab: match[1] as Tab, backup: null };
}

/** Prism Backups in place of the panel's backup list. */
export default function BackupsView({ model, Default }: ViewProps<'server.backups'>) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const state = useQuery({
        queryKey: keys.state(identifier),
        queryFn: () => api.state(identifier),
        refetchOnMount: 'always',
        refetchInterval: (query) => (query.state.data?.jobs.some((job) => job.status === 'pending' || job.status === 'running') ? 2000 : false),
    });
    applyConfig(state.data?.config);

    if (state.isLoading) return <Spinner centered />;
    // Turned off, or kept to owners: the panel's own page.
    if (!getConfig().enabled || (state.data && !state.data.extras)) return <Default />;
    if (state.isError || !state.data) return <Alert type={'danger'}>{httpErrorToHuman(state.error)}</Alert>;

    return <PrismBackups model={model} />;
}

function PrismBackups({ model }: { model: Model }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const queryClient = useQueryClient();
    const state = useQuery({ queryKey: keys.state(identifier), queryFn: () => api.state(identifier) });
    const config = getConfig();
    const [location, setLocation] = useState(readHash);
    const [creating, setCreating] = useState<string | null | false>(false);

    useEffect(() => {
        const follow = () => setLocation(readHash());
        window.addEventListener('hashchange', follow);

        return () => window.removeEventListener('hashchange', follow);
    }, []);

    // A new or finished backup brings its profile and size along.
    const signature = model.backups.map((backup) => `${backup.uuid}:${backup.completedAt ?? ''}`).join();
    useEffect(() => {
        void queryClient.invalidateQueries({ queryKey: keys.state(identifier) });
    }, [signature, queryClient, identifier]);

    const go = (next: { tab: Tab; backup: string | null }) => {
        const hash = next.backup ? `#backup-${next.backup}` : next.tab === 'backups' ? '' : `#${next.tab}`;
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`);
        setLocation(next);
    };

    const data = state.data!;
    const tabs: { value: Tab; label: string }[] = [
        { value: 'backups', label: 'Backups' },
        ...(config.profiles ? [{ value: 'profiles' as const, label: 'Profiles' }] : []),
        ...(config.pteroignore ? [{ value: 'ignore' as const, label: '.pteroignore' }] : []),
    ];
    const tab = tabs.some((item) => item.value === location.tab) ? location.tab : 'backups';
    const open = location.backup ? model.backups.find((backup) => backup.uuid === location.backup) : undefined;
    const stored = model.backups.reduce((sum, backup) => sum + (backup.successful ? backup.bytes : 0), 0);
    const share = model.limit > 0 ? Math.min(100, (model.count / model.limit) * 100) : 100;
    const atLimit = model.limit === 0 || model.count >= model.limit;

    return (
        <div className={'pbk:flex pbk:flex-col pbk:gap-4'}>
            <div className={'pbk:flex pbk:flex-wrap pbk:items-end pbk:gap-3'}>
                <div className={'pbk:min-w-56 pbk:flex-1'}>
                    <h2 className={'pbk:text-lg pbk:font-semibold'}>Backups</h2>
                    <p className={'pbk:text-sm pbk:text-muted-foreground'}>
                        {model.limit === 0 ? 'This server cannot have backups.' : `${model.count} of ${model.limit} backups`}
                        {stored > 0 && ` · ${bytes(stored)} stored${model.pagination.total > model.backups.length ? ' on this page' : ''}`}
                    </p>
                    {model.limit > 0 && (
                        <div className={'pbk:mt-2 pbk:h-1.5 pbk:max-w-sm pbk:overflow-hidden pbk:rounded-full pbk:bg-muted'}>
                            <div className={share >= 100 ? 'pbk:h-full pbk:bg-destructive' : share >= 80 ? 'pbk:h-full pbk:bg-yellow-500' : 'pbk:h-full pbk:bg-primary'} style={{ width: `${share}%` }} />
                        </div>
                    )}
                </div>
                {!open && <Pills value={tab} options={tabs} onChange={(next) => go({ tab: next, backup: null })} />}
                {model.permissions.create && (
                    <Button onClick={() => setCreating(null)} disabled={atLimit}>
                        <NamedIcon name={'plus'} size={14} /> Create backup
                    </Button>
                )}
            </div>

            {atLimit && model.limit > 0 && model.permissions.create && <Alert type={'warning'}>This server has as many backups as it may keep. Delete one, or unlock one a schedule can replace, to make another.</Alert>}

            {open ? (
                <BackupDetail model={model} backup={open} state={data} onBack={() => go({ tab: 'backups', backup: null })} />
            ) : tab === 'profiles' ? (
                <ProfilesTab model={model} state={data} onBackUp={(profile) => setCreating(profile)} />
            ) : tab === 'ignore' ? (
                <IgnoreTab />
            ) : (
                <BackupsTab model={model} state={data} onOpen={(uuid) => go({ tab: 'backups', backup: uuid })} />
            )}

            {creating !== false && <CreateDialog model={model} profiles={config.profiles ? data.profiles : []} initialProfile={creating} onClose={() => setCreating(false)} />}
        </div>
    );
}
