import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Checkbox, Dialog, Input, ServerContentBlock, Spinner, Switch, bytesToString, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { getCatalog, getPlugins, installPlugin, pluginKeys, removePlugin, testedOnMajor, togglePlugin, type CatalogPlugin, type InstalledPlugin } from '../api/plugins';
import JobProgress from '../components/JobProgress';
import { Chip, InstallButton, ItemIcon, Tabs } from '../components/content/ui';
import { useTerrariaInfo } from '../hooks/useTerrariaInfo';

const SECTIONS: Record<CatalogPlugin['section'], string> = { listed: 'Listed', community: 'Community maintained', older: 'For older TShock' };

export default function PluginsScreen() {
    const { identifier } = useTerrariaInfo();
    const [tab, setTab] = useState<'browse' | 'installed'>('browse');
    const installed = useQuery({
        queryKey: pluginKeys.installed(identifier),
        queryFn: () => getPlugins(identifier),
        refetchInterval: (query) => (query.state.data?.job ? 3000 : false),
    });
    const queryClient = useQueryClient();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['prism-terraria', identifier, 'plugins'] });

    return (
        <ServerContentBlock title={'Plugins'}>
            <div className={'trs:flex trs:flex-col trs:gap-4'}>
                <Tabs
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: 'browse', label: 'Browse' },
                        { value: 'installed', label: installed.data ? `Installed (${installed.data.plugins.length})` : 'Installed' },
                    ]}
                />
                {installed.data?.job && <JobProgress key={installed.data.job} job={installed.data.job} onFinished={refresh} />}
                {installed.isError && <Alert type={'danger'}>{httpErrorToHuman(installed.error)}</Alert>}
                {tab === 'browse' ? (
                    <Catalog running={installed.data?.running ?? false} confirm={installed.data?.confirmInstalls ?? true} onInstalled={refresh} />
                ) : (
                    <Installed plugins={installed.data?.plugins} loading={installed.isLoading} onChanged={refresh} />
                )}
            </div>
        </ServerContentBlock>
    );
}

function Catalog({ running, confirm, onInstalled }: { running: boolean; confirm: boolean; onInstalled: () => void }) {
    const { identifier } = useTerrariaInfo();
    const catalog = useQuery({ queryKey: pluginKeys.catalog(identifier), queryFn: () => getCatalog(identifier), staleTime: 600_000 });
    const [query, setQuery] = useState('');
    const [downloadable, setDownloadable] = useState(true);
    const [installing, setInstalling] = useState<CatalogPlugin | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const plugins = useMemo(() => {
        const term = query.trim().toLowerCase();

        return (catalog.data?.plugins ?? []).filter(
            (plugin) => (!downloadable || plugin.download !== null) && (term === '' || `${plugin.name} ${plugin.author ?? ''} ${plugin.description}`.toLowerCase().includes(term))
        );
    }, [catalog.data, query, downloadable]);

    if (catalog.isLoading) return <Spinner centered />;
    if (catalog.isError || !catalog.data) return <Alert type={'danger'}>{httpErrorToHuman(catalog.error)}</Alert>;

    const install = async (plugin: CatalogPlugin, restart: boolean) => {
        setBusy(plugin.id);
        try {
            const result = await installPlugin(identifier, plugin.id, restart);
            toast.success(result.restarting ? `Installing ${plugin.name} and restarting.` : `Installing ${plugin.name}. Restart the server to load it.`);
            setInstalling(null);
            onInstalled();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className={'trs:flex trs:flex-col trs:gap-3'}>
            <Alert type={'info'}>
                These plugins come from the{' '}
                <a href={catalog.data.repository} target={'_blank'} rel={'noreferrer'} className={'trs:underline'}>
                    TShock plugin list
                </a>
                , which the TShock team no longer updates. Most were made for older TShock versions and may not load on TShock {catalog.data.tshock ?? 'this version'}.
            </Alert>
            <div className={'trs:flex trs:flex-wrap trs:items-center trs:gap-3'}>
                <div className={'trs:relative trs:min-w-48 trs:flex-1'}>
                    <NamedIcon name={'search'} size={16} className={'trs:absolute trs:left-3 trs:top-1/2 trs:-translate-y-1/2 trs:text-muted-foreground trs:pointer-events-none'} />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${catalog.data.plugins.length} plugins…`} className={'trs:w-full trs:pl-9'} />
                </div>
                <label className={'trs:flex trs:items-center trs:gap-2 trs:text-sm'}>
                    <Checkbox checked={downloadable} onChange={setDownloadable} /> Only ones that install here
                </label>
            </div>

            {plugins.length === 0 ? (
                <p className={'trs:py-8 trs:text-center trs:text-sm trs:text-muted-foreground'}>No plugins match.</p>
            ) : (
                <div className={'trs:grid trs:gap-3 trs:md:grid-cols-2'}>
                    {plugins.map((plugin) => {
                        const sameMajor = testedOnMajor(plugin.tested, catalog.data.tshock);

                        return (
                            <div key={plugin.id} className={'pt-surface trs:flex trs:gap-3 trs:rounded-lg trs:border trs:border-border trs:bg-card trs:p-4 trs:min-w-0'}>
                                <ItemIcon src={null} className={'trs:size-12 trs:shrink-0'} />
                                <div className={'trs:flex trs:min-w-0 trs:flex-1 trs:flex-col trs:gap-1.5'}>
                                    <div className={'trs:flex trs:flex-wrap trs:items-baseline trs:gap-x-2'}>
                                        <a href={plugin.homepage} target={'_blank'} rel={'noreferrer'} className={'trs:truncate trs:font-bold trs:hover:underline'}>
                                            {plugin.name}
                                        </a>
                                        {plugin.author && <span className={'trs:text-sm trs:text-muted-foreground'}>by {plugin.author}</span>}
                                    </div>
                                    <p className={'trs:line-clamp-3 trs:text-sm trs:text-muted-foreground'}>{plugin.description}</p>
                                    <div className={'trs:flex trs:flex-wrap trs:gap-1.5'}>
                                        {plugin.version && <Chip>v{plugin.version}</Chip>}
                                        {plugin.tested && (
                                            <Chip tone={sameMajor === false ? 'warning' : undefined} title={sameMajor === false ? 'Made for another major TShock version' : undefined}>
                                                Tested on TShock {plugin.tested}
                                            </Chip>
                                        )}
                                        {plugin.section !== 'listed' && <Chip>{SECTIONS[plugin.section]}</Chip>}
                                        {plugin.source && (
                                            <a href={plugin.source} target={'_blank'} rel={'noreferrer'} onClick={(event) => event.stopPropagation()}>
                                                <Chip>
                                                    <NamedIcon name={'code'} size={12} /> Source
                                                </Chip>
                                            </a>
                                        )}
                                    </div>
                                    <div className={'trs:mt-auto trs:flex trs:justify-end trs:pt-1'}>
                                        {plugin.download ? (
                                            <InstallButton
                                                installed={plugin.installed}
                                                busy={busy === plugin.id}
                                                onClick={() => (confirm || plugin.installed || sameMajor === false ? setInstalling(plugin) : install(plugin, false))}
                                            />
                                        ) : (
                                            <a
                                                href={plugin.downloadPage ?? plugin.homepage}
                                                target={'_blank'}
                                                rel={'noreferrer'}
                                                className={'trs:inline-flex trs:items-center trs:gap-1 trs:text-sm trs:text-primary trs:hover:underline'}
                                            >
                                                <NamedIcon name={'external-link'} size={14} /> On its website
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {installing && (
                <InstallDialog
                    plugin={installing}
                    tshock={catalog.data.tshock}
                    running={running}
                    busy={busy === installing.id}
                    onClose={() => setInstalling(null)}
                    onInstall={(restart) => install(installing, restart)}
                />
            )}
        </div>
    );
}

function InstallDialog({
    plugin,
    tshock,
    running,
    busy,
    onClose,
    onInstall,
}: {
    plugin: CatalogPlugin;
    tshock: string | null;
    running: boolean;
    busy: boolean;
    onClose: () => void;
    onInstall: (restart: boolean) => void;
}) {
    const [restart, setRestart] = useState(false);
    const sameMajor = testedOnMajor(plugin.tested, tshock);

    return (
        <Dialog open onClose={onClose} title={`${plugin.installed ? 'Reinstall' : 'Install'} ${plugin.name}`}>
            <div className={'trs:flex trs:flex-col trs:gap-3 trs:text-sm'}>
                {sameMajor === false && (
                    <Alert type={'warning'}>
                        It was tested on TShock {plugin.tested}, and this server runs TShock {tshock}. Plugins made for another major version usually fail to load; the console says
                        so at start.
                    </Alert>
                )}
                <p>
                    {plugin.download?.toLowerCase().endsWith('.zip') ? 'The zip is downloaded and its .dll files are put in ServerPlugins.' : 'The plugin is downloaded into ServerPlugins.'}{' '}
                    TShock loads it at the next start{plugin.docs ? '; its settings are explained in the documentation' : ''}.
                </p>
                {plugin.docs && (
                    <a href={plugin.docs} target={'_blank'} rel={'noreferrer'} className={'trs:inline-flex trs:items-center trs:gap-1 trs:text-primary trs:hover:underline'}>
                        <NamedIcon name={'external-link'} size={14} /> Documentation
                    </a>
                )}
            </div>
            <Dialog.Footer>
                {running && (
                    <label className={'trs:mr-auto trs:flex trs:items-center trs:gap-2 trs:text-sm'}>
                        <Checkbox checked={restart} onChange={setRestart} /> Restart afterwards
                    </label>
                )}
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button isLoading={busy} onClick={() => onInstall(restart)}>
                    {plugin.installed ? 'Reinstall' : 'Install'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}

function Installed({ plugins, loading, onChanged }: { plugins: InstalledPlugin[] | undefined; loading: boolean; onChanged: () => void }) {
    const { identifier } = useTerrariaInfo();
    const [removing, setRemoving] = useState<InstalledPlugin | null>(null);
    const fail = (error: unknown) => toast.error(httpErrorToHuman(error));
    const toggle = useMutation({ mutationFn: (plugin: InstalledPlugin) => togglePlugin(identifier, plugin.files, !plugin.enabled), onSuccess: onChanged, onError: fail });
    const destroy = useMutation({
        mutationFn: (plugin: InstalledPlugin) => removePlugin(identifier, plugin),
        onSuccess: () => {
            setRemoving(null);
            onChanged();
        },
        onError: fail,
    });

    if (loading) return <Spinner centered />;
    if (!plugins) return null;

    return (
        <div className={'trs:flex trs:flex-col trs:gap-2'}>
            {plugins.length === 0 ? (
                <p className={'trs:py-8 trs:text-center trs:text-sm trs:text-muted-foreground'}>No plugins installed.</p>
            ) : (
                plugins.map((plugin) => (
                    <div key={plugin.id ?? plugin.files.join()} className={'pt-surface trs:flex trs:flex-wrap trs:items-center trs:gap-3 trs:rounded-md trs:border trs:border-border trs:bg-card trs:p-3'}>
                        <ItemIcon src={null} className={'trs:size-10 trs:shrink-0'} />
                        <div className={'trs:min-w-0 trs:flex-1 trs:basis-48'}>
                            <div className={'trs:flex trs:flex-wrap trs:items-center trs:gap-2'}>
                                <span className={'trs:truncate trs:font-medium'}>{plugin.name}</span>
                                {plugin.version && <span className={'trs:text-xs trs:text-muted-foreground'}>{plugin.version}</span>}
                                {plugin.core && (
                                    <Badge size={'sm'} tone={'info'}>
                                        TShock
                                    </Badge>
                                )}
                                {plugin.missing && (
                                    <Badge size={'sm'} tone={'warning'}>
                                        Files missing
                                    </Badge>
                                )}
                                {!plugin.enabled && !plugin.missing && (
                                    <Badge size={'sm'} tone={'neutral'}>
                                        Disabled
                                    </Badge>
                                )}
                            </div>
                            <p className={'trs:truncate trs:font-mono trs:text-xs trs:text-muted-foreground'}>
                                {plugin.files.join(', ') || 'No files'}
                                {plugin.size > 0 && ` · ${bytesToString(plugin.size)}`}
                            </p>
                        </div>
                        {!plugin.core && (
                            <>
                                <Switch checked={plugin.enabled} disabled={plugin.missing || toggle.isPending} onChange={() => toggle.mutate(plugin)} aria-label={plugin.enabled ? 'Disable' : 'Enable'} />
                                <Button.Danger size={'small'} isSecondary onClick={() => setRemoving(plugin)}>
                                    Remove
                                </Button.Danger>
                            </>
                        )}
                    </div>
                ))
            )}
            <p className={'trs:text-xs trs:text-muted-foreground'}>TShock loads plugins when it starts, so changes take effect after a restart.</p>

            <Dialog.Confirm
                open={removing !== null}
                onClose={() => setRemoving(null)}
                title={`Remove ${removing?.name ?? ''}?`}
                confirm={'Remove'}
                pending={destroy.isPending}
                onConfirmed={() => removing && destroy.mutate(removing)}
            >
                {removing?.files.join(', ')} {removing && removing.files.length === 1 ? 'is' : 'are'} deleted from ServerPlugins. Its settings in the tshock folder are kept.
            </Dialog.Confirm>
        </div>
    );
}
