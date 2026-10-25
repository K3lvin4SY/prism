import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Dialog, Input, Spinner, cn, httpErrorToHuman, useCurrentServerRequired, useServerPermission } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import type { ViewProps } from '@pterodactyl/sdk/theme';
import { api, keys, type PrismDatabase } from '../api';
import { Pills } from '../components/ui';
import { applyConfig, getConfig } from '../config';
import BackupsTab from '../tabs/BackupsTab';
import OverviewTab from '../tabs/OverviewTab';
import SharingTab from '../tabs/SharingTab';
import SqlTab from '../tabs/SqlTab';
import TablesTab from '../tabs/TablesTab';
import TransferTab from '../tabs/TransferTab';

export type Tab = 'overview' | 'tables' | 'sql' | 'transfer' | 'backups' | 'sharing';

/** The open database and tab live in the address bar's hash, so a reload keeps them. */
function readHash(): { id: number | null; tab: Tab } {
    const match = window.location.hash.match(/^#db-(\d+)(?:\/(\w+))?/);

    return { id: match ? Number(match[1]) : null, tab: (match?.[2] as Tab) ?? 'overview' };
}

/** Prism Database Manager in place of the panel's Databases page. */
export default function DatabasesView({ model, Default }: ViewProps<'server.databases'>) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    // Fetched again each time the page opens, for the admin's current settings.
    const list = useQuery({ queryKey: keys.list(identifier), queryFn: () => api.list(identifier), refetchOnMount: 'always' });
    applyConfig(list.data?.config);
    if (!getConfig().enabled) return <Default />;

    return <PrismDatabases model={model} />;
}

function PrismDatabases({ model }: Pick<ViewProps<'server.databases'>, 'model'>) {
    const server = useCurrentServerRequired();
    const identifier = server.attributes.identifier;
    const queryClient = useQueryClient();
    const list = useQuery({ queryKey: keys.list(identifier), queryFn: () => api.list(identifier) });
    const [location, setLocation] = useState(readHash);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        const follow = () => setLocation(readHash());
        window.addEventListener('hashchange', follow);

        return () => window.removeEventListener('hashchange', follow);
    }, []);

    // A database made or removed through the panel shows here straight away.
    useEffect(() => {
        void queryClient.invalidateQueries({ queryKey: keys.list(identifier) });
    }, [model.databases.length, queryClient, identifier]);

    const go = (id: number | null, tab: Tab = 'overview') => {
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${id === null ? '' : `#db-${id}${tab === 'overview' ? '' : `/${tab}`}`}`);
        setLocation({ id, tab });
    };

    if (list.isLoading || model.loading) return <Spinner centered />;
    if (list.isError) return <Alert type={'danger'}>{httpErrorToHuman(list.error)}</Alert>;

    const databases = list.data?.databases ?? [];
    const open = databases.find((database) => database.id === location.id);

    if (open) return <DatabaseDetail database={open} tab={location.tab} onTab={(tab) => go(open.id, tab)} onBack={() => go(null)} model={model} />;

    const own = databases.filter((database) => database.own).length;

    return (
        <div className={'pdb:flex pdb:flex-col pdb:gap-4'}>
            <div className={'pdb:flex pdb:flex-wrap pdb:items-end pdb:gap-3'}>
                <div className={'pdb:flex-1'}>
                    <h2 className={'pdb:text-lg pdb:font-semibold'}>Databases</h2>
                    <p className={'pdb:text-sm pdb:text-muted-foreground'}>
                        {own} of {model.limit === 0 ? 'no' : model.limit} databases used
                        {databases.length > own && ` · ${databases.length - own} shared with this server`}
                    </p>
                </div>
                {model.permissions.create && (
                    <Button onClick={() => setCreating(true)} disabled={!model.canCreate}>
                        <NamedIcon name={'plus'} size={14} /> New database
                    </Button>
                )}
            </div>

            {databases.length === 0 ? (
                <div className={'pdb:flex pdb:flex-col pdb:items-center pdb:gap-2 pdb:rounded-lg pdb:border pdb:border-dashed pdb:border-border pdb:py-12 pdb:text-center'}>
                    <NamedIcon name={'database'} size={32} className={'pdb:text-muted-foreground'} />
                    <p className={'pdb:font-medium'}>No databases yet</p>
                    <p className={'pdb:text-sm pdb:text-muted-foreground'}>{model.limit === 0 ? 'This server cannot have databases. Ask your host for some.' : 'Create one for plugins such as LuckPerms or CoreProtect.'}</p>
                </div>
            ) : (
                <div className={'pdb:grid pdb:gap-3 pdb:md:grid-cols-2 pdb:xl:grid-cols-3'}>
                    {databases.map((database) => (
                        <button
                            key={database.id}
                            type={'button'}
                            onClick={() => go(database.id)}
                            className={'pdb:flex pdb:flex-col pdb:gap-2 pdb:rounded-lg pdb:border pdb:border-border pdb:bg-card pdb:p-4 pdb:text-left pdb:cursor-pointer pdb:hover:border-primary'}
                        >
                            <div className={'pdb:flex pdb:items-center pdb:gap-2'}>
                                <NamedIcon name={'database'} size={18} className={'pdb:text-primary'} />
                                <span className={'pdb:min-w-0 pdb:flex-1 pdb:truncate pdb:font-mono pdb:font-semibold'}>{database.name}</span>
                                {!database.own && <span className={'pdb:rounded pdb:bg-primary/15 pdb:px-1.5 pdb:py-0.5 pdb:text-xs pdb:text-primary'}>Shared</span>}
                                {database.own && database.sharedWith.length > 0 && <NamedIcon name={'share-2'} size={14} className={'pdb:text-muted-foreground'} />}
                            </div>
                            <p className={'pdb:truncate pdb:font-mono pdb:text-xs pdb:text-muted-foreground'}>
                                {database.username} @ {database.host}:{database.port}
                            </p>
                            <p className={'pdb:text-xs pdb:text-muted-foreground'}>{database.own ? (database.sharedWith.length ? `Shared with ${database.sharedWith.map((item) => item.name).join(', ')}` : database.hostName) : `From ${database.owner.name}`}</p>
                        </button>
                    ))}
                </div>
            )}

            {creating && <CreateDialog model={model} onClose={() => setCreating(false)} onCreated={() => void list.refetch()} />}
        </div>
    );
}

function CreateDialog({ model, onClose, onCreated }: { model: ViewProps<'server.databases'>['model']; onClose: () => void; onCreated: () => void }) {
    const [name, setName] = useState('');
    const [from, setFrom] = useState('%');
    const [busy, setBusy] = useState(false);
    const nameError = name ? model.validate.name(name) : undefined;
    const fromError = model.validate.connectionsFrom(from);

    return (
        <Dialog open onClose={onClose} title={'New database'}>
            <div className={'pdb:flex pdb:flex-col pdb:gap-3'}>
                <label className={'pdb:flex pdb:flex-col pdb:gap-1 pdb:text-sm'}>
                    Name
                    <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={'luckperms'} autoFocus $hasError={!!nameError} />
                    {nameError && <span className={'pdb:text-xs pdb:text-destructive'}>{nameError}</span>}
                </label>
                <label className={'pdb:flex pdb:flex-col pdb:gap-1 pdb:text-sm'}>
                    Connections from
                    <Input value={from} onChange={(event) => setFrom(event.target.value)} $hasError={!!fromError} />
                    <span className={'pdb:text-xs pdb:text-muted-foreground'}>% allows any address. The panel needs to reach it for this page to work.</span>
                    {fromError && <span className={'pdb:text-xs pdb:text-destructive'}>{fromError}</span>}
                </label>
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button
                    isLoading={busy}
                    disabled={!name || !!nameError || !!fromError}
                    onClick={async () => {
                        setBusy(true);
                        try {
                            await model.actions.create({ name, connectionsFrom: from === '%' ? '' : from });
                            onCreated();
                            onClose();
                        } catch {
                            // The panel has already shown why.
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    Create
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}

function DatabaseDetail({ database, tab, onTab, onBack, model }: { database: PrismDatabase; tab: Tab; onTab: (tab: Tab) => void; onBack: () => void; model: ViewProps<'server.databases'>['model'] }) {
    const config = getConfig();
    const canUpdate = useServerPermission('database.update');
    const tabs: { value: Tab; label: string; disabled?: boolean }[] = [
        { value: 'overview', label: 'Overview' },
        { value: 'tables', label: 'Tables' },
        ...(config.sqlConsole ? [{ value: 'sql' as const, label: 'SQL console' }] : []),
        ...(canUpdate ? [{ value: 'transfer' as const, label: 'Import & export' }] : []),
        ...(config.backups ? [{ value: 'backups' as const, label: 'Backups' }] : []),
        ...(config.sharing && database.own && canUpdate ? [{ value: 'sharing' as const, label: 'Sharing' }] : []),
    ];
    const current = tabs.some((item) => item.value === tab) ? tab : 'overview';
    const [sqlDraft, setSqlDraft] = useState<string | null>(null);

    return (
        <div className={'pdb:flex pdb:flex-col pdb:gap-4'}>
            <div className={'pdb:flex pdb:flex-wrap pdb:items-center pdb:gap-3'}>
                <Button isSecondary size={'small'} onClick={onBack}>
                    <NamedIcon name={'arrow-left'} size={14} /> All databases
                </Button>
                <h2 className={'pdb:min-w-0 pdb:flex-1 pdb:truncate pdb:font-mono pdb:text-lg pdb:font-semibold'}>{database.name}</h2>
                {!database.own && <span className={'pdb:text-sm pdb:text-muted-foreground'}>Shared from {database.owner.name}</span>}
                <Pills value={current} options={tabs} onChange={onTab} />
            </div>
            <div className={cn(current === 'sql' ? '' : 'pdb:hidden')}>
                {config.sqlConsole && <SqlTab database={database} draft={sqlDraft} onDraftUsed={() => setSqlDraft(null)} />}
            </div>
            {current === 'overview' && <OverviewTab database={database} model={model} onDeleted={onBack} />}
            {current === 'tables' && (
                <TablesTab
                    database={database}
                    onQuery={(sql) => {
                        setSqlDraft(sql);
                        onTab('sql');
                    }}
                />
            )}
            {current === 'transfer' && <TransferTab database={database} />}
            {current === 'backups' && <BackupsTab database={database} />}
            {current === 'sharing' && <SharingTab database={database} />}
        </div>
    );
}
