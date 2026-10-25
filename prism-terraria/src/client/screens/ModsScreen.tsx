import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Checkbox, Dialog, Input, Select, ServerContentBlock, Spinner, Switch, bytesToString, cn, fromNow, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import {
    checkModUpdates,
    compactNumber,
    getMods,
    getWorkshopItem,
    installMods,
    modKeys,
    removeMod,
    repairMods,
    searchWorkshop,
    toggleMod,
    type InstalledMod,
    type ModSort,
    type ModsOverview,
    type SearchParams,
    type WorkshopHit,
} from '../api/mods';
import JobProgress from '../components/JobProgress';
import { Chip, FilterRow, FilterSection, InstallButton, ItemIcon, Pager, Tabs } from '../components/content/ui';
import { useTerrariaInfo } from '../hooks/useTerrariaInfo';

const SORTS: { value: ModSort; label: string }[] = [
    { value: 'trend', label: 'Trending' },
    { value: 'subscriptions', label: 'Most subscribed' },
    { value: 'votes', label: 'Top rated' },
    { value: 'newest', label: 'Newest' },
    { value: 'updated', label: 'Recently updated' },
];

const SIDE_LABELS: Record<string, string> = { Both: 'Client and server', Server: 'Server only', NoSync: 'No sync', Client: 'Client only' };

const updatedAt = (time: number | null) => (time ? fromNow(new Date(time * 1000).toISOString()) : null);

export default function ModsScreen() {
    const { identifier } = useTerrariaInfo();
    const [tab, setTab] = useState<'browse' | 'installed'>('browse');
    const overview = useQuery({
        queryKey: modKeys.installed(identifier),
        queryFn: () => getMods(identifier),
        refetchInterval: (query) => (query.state.data?.job ? 3000 : false),
    });

    return (
        <ServerContentBlock title={'Mods'}>
            <div className={'trs:flex trs:flex-col trs:gap-4'}>
                <Tabs
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: 'browse', label: 'Workshop' },
                        { value: 'installed', label: overview.data ? `Installed (${overview.data.mods.length})` : 'Installed' },
                    ]}
                />
                {overview.data?.job && <JobProgress key={overview.data.job} job={overview.data.job} onFinished={() => overview.refetch()} />}
                {overview.data?.wrapperMissing && <WrapperWarning />}
                {overview.isError && <Alert type={'danger'}>{httpErrorToHuman(overview.error)}</Alert>}
                {tab === 'browse' ? <WorkshopBrowser overview={overview.data} /> : <InstalledMods overview={overview.data} loading={overview.isLoading} />}
            </div>
        </ServerContentBlock>
    );
}

function WrapperWarning() {
    const { identifier } = useTerrariaInfo();
    const queryClient = useQueryClient();
    const repair = useMutation({
        mutationFn: () => repairMods(identifier),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: modKeys.installed(identifier) }),
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });

    return (
        <Alert type={'warning'}>
            <div className={'trs:flex trs:flex-wrap trs:items-center trs:gap-3'}>
                <span className={'trs:flex-1'}>The server was reinstalled, which replaced the start-up script that downloads Workshop mods. Set it up again so the mods download at the next start.</span>
                <Button size={'small'} isLoading={repair.isPending} onClick={() => repair.mutate()}>
                    Set up again
                </Button>
            </div>
        </Alert>
    );
}

function WorkshopBrowser({ overview }: { overview: ModsOverview | undefined }) {
    const { identifier } = useTerrariaInfo();
    const queryClient = useQueryClient();
    const [query, setQuery] = useState('');
    const [params, setParams] = useState<SearchParams>({ query: '', sort: 'trend', categories: [], sides: ['Both', 'Server', 'NoSync'], gameVersion: '1.4.4', page: 1, limit: 20 });
    const [open, setOpen] = useState<WorkshopHit | null>(null);
    const [busy, setBusy] = useState<string[]>([]);

    useEffect(() => {
        const timer = window.setTimeout(() => setParams((current) => (current.query === query.trim() ? current : { ...current, query: query.trim(), page: 1 })), 350);

        return () => window.clearTimeout(timer);
    }, [query]);

    const results = useQuery({
        queryKey: modKeys.search(identifier, params),
        queryFn: () => searchWorkshop(identifier, params),
        enabled: overview?.workshop === true,
        placeholderData: keepPreviousData,
        staleTime: 60_000,
        retry: 1,
    });

    if (overview && !overview.workshop) {
        return (
            <Alert type={'info'}>
                Browsing the Workshop needs a Steam Web API key. An administrator can add one under Admin → Extensions → Prism Terraria. Mods already on the server are on the Installed
                tab.
            </Alert>
        );
    }

    const change = (next: Partial<SearchParams>) => setParams((current) => ({ ...current, ...next, page: next.page ?? 1 }));
    const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);
    const totalPages = results.data ? Math.max(1, Math.min(50, Math.ceil(results.data.total / params.limit))) : 1;

    const installNow = async (hit: WorkshopHit) => {
        setBusy((current) => [...current, hit.id]);
        try {
            const result = await installMods(identifier, [hit.id], false);
            toast.success(`${result.added.join(', ')} will download at the next start.`);
            await queryClient.invalidateQueries({ queryKey: ['prism-terraria', identifier, 'mods'] });
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy((current) => current.filter((id) => id !== hit.id));
        }
    };

    return (
        <div className={'trs:grid trs:gap-4 trs:lg:grid-cols-[240px_1fr]'}>
            <div className={'trs:flex trs:flex-col trs:gap-3 trs:min-w-0'}>
                <FilterSection title={'tModLoader version'}>
                    {[...(results.data?.gameVersions ?? ['1.4.4', '1.4.3']), 'Any'].map((version) => (
                        <FilterRow
                            key={version}
                            label={version === 'Any' ? 'Any version' : `Terraria ${version}`}
                            on={(params.gameVersion ?? 'Any') === version}
                            onToggle={() => change({ gameVersion: version === 'Any' ? null : version })}
                        />
                    ))}
                </FilterSection>
                <FilterSection title={'Runs on'}>
                    {(results.data?.sides ?? ['Both', 'Server', 'NoSync', 'Client']).map((side) => (
                        <FilterRow key={side} label={SIDE_LABELS[side] ?? side} on={params.sides.includes(side)} onToggle={() => change({ sides: toggle(params.sides, side) })} />
                    ))}
                    <p className={'trs:px-2 trs:pt-2 trs:text-xs trs:text-muted-foreground'}>Client-only mods do nothing on a server.</p>
                </FilterSection>
                <FilterSection title={'Category'}>
                    {(results.data?.categories ?? []).map((category) => (
                        <FilterRow key={category} label={category} on={params.categories.includes(category)} onToggle={() => change({ categories: toggle(params.categories, category) })} />
                    ))}
                </FilterSection>
            </div>

            <div className={'trs:flex trs:flex-col trs:gap-3 trs:min-w-0'}>
                <div className={'trs:relative'}>
                    <NamedIcon name={'search'} size={16} className={'trs:absolute trs:left-3 trs:top-1/2 trs:-translate-y-1/2 trs:text-muted-foreground trs:pointer-events-none'} />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={'Search the tModLoader Workshop…'} className={'trs:w-full trs:pl-9'} />
                </div>
                <div className={'trs:flex trs:flex-wrap trs:items-center trs:gap-2'}>
                    <span className={'trs:text-sm trs:text-muted-foreground'}>Sort by</span>
                    <div className={'trs:w-48'}>
                        <Select value={params.sort} onChange={(value) => change({ sort: value as ModSort })} options={SORTS} disabled={params.query !== ''} />
                    </div>
                    {params.query !== '' && <span className={'trs:text-xs trs:text-muted-foreground'}>Searches are sorted by relevance.</span>}
                    <div className={'trs:ml-auto'}>
                        <Pager page={params.page} total={totalPages} onPage={(page) => change({ page })} />
                    </div>
                </div>

                {results.isError && <Alert type={'danger'}>{httpErrorToHuman(results.error)}</Alert>}
                {results.isLoading ? (
                    <Spinner centered />
                ) : results.data && results.data.hits.length === 0 ? (
                    <p className={'trs:py-8 trs:text-center trs:text-sm trs:text-muted-foreground'}>No mods match these filters.</p>
                ) : (
                    <div className={cn('trs:grid trs:gap-3', results.isFetching && 'trs:opacity-70')}>
                        {results.data?.hits.map((hit) => (
                            <WorkshopCard
                                key={hit.id}
                                hit={hit}
                                busy={busy.includes(hit.id)}
                                onOpen={() => setOpen(hit)}
                                onInstall={() => (hit.installed || overview?.confirmInstalls !== false ? setOpen(hit) : installNow(hit))}
                            />
                        ))}
                    </div>
                )}
                <div className={'trs:flex trs:justify-end'}>
                    <Pager
                        page={params.page}
                        total={totalPages}
                        onPage={(page) => {
                            change({ page });
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                    />
                </div>
            </div>

            {open && <WorkshopDialog id={open.id} hit={open} running={overview?.running ?? false} onClose={() => setOpen(null)} />}
        </div>
    );
}

function WorkshopCard({ hit, busy, onOpen, onInstall }: { hit: WorkshopHit; busy: boolean; onOpen: () => void; onInstall: () => void }) {
    return (
        <div
            role={'button'}
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(event) => {
                if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    onOpen();
                }
            }}
            className={'trs:flex trs:gap-4 trs:rounded-lg trs:border trs:border-border trs:bg-card trs:p-4 trs:cursor-pointer trs:hover:border-primary trs:min-w-0 trs:overflow-hidden'}
        >
            <ItemIcon src={hit.icon} className={'trs:size-20 trs:shrink-0'} />
            <div className={'trs:flex trs:min-w-0 trs:flex-1 trs:flex-col trs:gap-1.5'}>
                <div className={'trs:flex trs:flex-wrap trs:items-baseline trs:gap-x-2'}>
                    <span className={'trs:truncate trs:text-lg trs:font-bold'}>{hit.title}</span>
                    {hit.author && <span className={'trs:text-sm trs:text-muted-foreground'}>by {hit.author}</span>}
                </div>
                <p className={'trs:line-clamp-2 trs:text-sm trs:text-muted-foreground'}>{hit.description}</p>
                <div className={'trs:flex trs:flex-wrap trs:gap-1.5'}>
                    {hit.side && (
                        <Chip tone={hit.side === 'Client' ? 'warning' : undefined}>
                            <NamedIcon name={hit.side === 'Client' ? 'monitor' : hit.side === 'Server' ? 'server' : 'globe'} size={12} /> {SIDE_LABELS[hit.side] ?? hit.side}
                        </Chip>
                    )}
                    {hit.gameVersions.map((version) => (
                        <Chip key={version}>{version}</Chip>
                    ))}
                    {hit.categories.slice(0, 3).map((category) => (
                        <Chip key={category}>{category}</Chip>
                    ))}
                    {hit.dependencies.length > 0 && (
                        <Chip>
                            <NamedIcon name={'link'} size={12} /> Needs {hit.dependencies.length} more
                        </Chip>
                    )}
                </div>
            </div>
            <div className={'trs:flex trs:shrink-0 trs:flex-col trs:items-end trs:justify-between trs:gap-3'}>
                <div className={'trs:flex trs:flex-col trs:items-end trs:gap-1 trs:text-sm trs:text-muted-foreground'}>
                    <span className={'trs:inline-flex trs:items-center trs:gap-1'} title={`${hit.subscriptions.toLocaleString()} subscribers`}>
                        <NamedIcon name={'users'} size={14} /> <strong className={'trs:font-semibold trs:text-foreground'}>{compactNumber(hit.subscriptions)}</strong>
                    </span>
                    {hit.score !== null && (
                        <span className={'trs:inline-flex trs:items-center trs:gap-1'} title={'Steam rating'}>
                            <NamedIcon name={'thumbs-up'} size={14} /> {Math.round(hit.score * 100)}%
                        </span>
                    )}
                    {hit.updated && (
                        <span className={'trs:inline-flex trs:items-center trs:gap-1'} title={'Last updated'}>
                            <NamedIcon name={'history'} size={14} /> {updatedAt(hit.updated)}
                        </span>
                    )}
                </div>
                <InstallButton installed={hit.installed} busy={busy} onClick={onInstall} />
            </div>
        </div>
    );
}

function WorkshopDialog({ id, hit, running, onClose }: { id: string; hit: WorkshopHit; running: boolean; onClose: () => void }) {
    const { identifier } = useTerrariaInfo();
    const queryClient = useQueryClient();
    const [restart, setRestart] = useState(false);
    const details = useQuery({ queryKey: modKeys.item(identifier, id), queryFn: () => getWorkshopItem(identifier, id), staleTime: 300_000 });
    const item = details.data?.item;
    const missing = details.data?.dependencies.filter((dependency) => !dependency.installed) ?? [];

    const install = useMutation({
        mutationFn: () => installMods(identifier, [id], restart),
        onSuccess: (result) => {
            toast.success(result.restarting ? `Restarting to download ${result.added.join(', ')}.` : `${result.added.join(', ')} will download at the next start.`);
            queryClient.invalidateQueries({ queryKey: ['prism-terraria', identifier, 'mods'] });
            onClose();
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });

    return (
        <Dialog open onClose={onClose} title={hit.title} description={hit.author ? `by ${hit.author}` : undefined}>
            {details.isLoading ? (
                <Spinner centered />
            ) : details.isError || !item ? (
                <Alert type={'danger'}>{httpErrorToHuman(details.error)}</Alert>
            ) : (
                <div className={'trs:flex trs:max-h-[60vh] trs:flex-col trs:gap-4 trs:overflow-y-auto trs:pr-1'}>
                    {item.side === 'Client' && <Alert type={'warning'}>This mod only runs on players&apos; computers, so it does nothing on a server.</Alert>}
                    {item.screenshots.length > 0 && (
                        <div className={'trs:flex trs:gap-2 trs:overflow-x-auto trs:pb-1'}>
                            {item.screenshots.slice(0, 8).map((src) => (
                                <a key={src} href={src} target={'_blank'} rel={'noreferrer'} className={'trs:shrink-0'}>
                                    <img src={src} alt={''} loading={'lazy'} className={'trs:h-28 trs:rounded-md trs:object-cover'} />
                                </a>
                            ))}
                        </div>
                    )}
                    <div className={'trs:flex trs:flex-wrap trs:gap-1.5'}>
                        {item.side && <Chip>{SIDE_LABELS[item.side] ?? item.side}</Chip>}
                        {item.gameVersions.map((version) => (
                            <Chip key={version}>{version}</Chip>
                        ))}
                        {item.categories.map((category) => (
                            <Chip key={category}>{category}</Chip>
                        ))}
                        {item.size > 0 && <Chip>{bytesToString(item.size)}</Chip>}
                        {item.updated && <Chip>Updated {updatedAt(item.updated)}</Chip>}
                    </div>
                    {details.data!.dependencies.length > 0 && (
                        <div className={'trs:rounded-md trs:border trs:border-border trs:p-3'}>
                            <p className={'trs:mb-2 trs:text-sm trs:font-semibold'}>Needs these mods, which are added with it</p>
                            <div className={'trs:flex trs:flex-col trs:gap-1.5'}>
                                {details.data!.dependencies.map((dependency) => (
                                    <div key={dependency.id} className={'trs:flex trs:items-center trs:gap-2 trs:text-sm'}>
                                        <ItemIcon src={dependency.icon} className={'trs:size-6'} />
                                        <span className={'trs:flex-1 trs:truncate'}>{dependency.title}</span>
                                        {dependency.installed && <Chip tone={'success'}>Installed</Chip>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <p className={'trs:whitespace-pre-line trs:text-sm trs:text-muted-foreground'}>{item.body || item.description}</p>
                    <a href={item.url} target={'_blank'} rel={'noreferrer'} className={'trs:inline-flex trs:items-center trs:gap-1 trs:text-sm trs:text-primary trs:hover:underline'}>
                        <NamedIcon name={'external-link'} size={14} /> Open on the Steam Workshop
                    </a>
                </div>
            )}
            <Dialog.Footer>
                {running && (
                    <label className={'trs:mr-auto trs:flex trs:items-center trs:gap-2 trs:text-sm'}>
                        <Checkbox checked={restart} onChange={setRestart} /> Restart now to download
                    </label>
                )}
                <Button.Text onClick={onClose}>Close</Button.Text>
                {item && (
                    <Button isLoading={install.isPending} onClick={() => install.mutate()}>
                        {item.installed ? (missing.length > 0 ? `Add ${missing.length} missing mods` : 'Download again') : missing.length > 0 ? `Install with ${missing.length} more` : 'Install'}
                    </Button>
                )}
            </Dialog.Footer>
        </Dialog>
    );
}

function InstalledMods({ overview, loading }: { overview: ModsOverview | undefined; loading: boolean }) {
    const { identifier } = useTerrariaInfo();
    const queryClient = useQueryClient();
    const [filter, setFilter] = useState('');
    const [removing, setRemoving] = useState<InstalledMod | null>(null);
    const refresh = () => queryClient.invalidateQueries({ queryKey: modKeys.installed(identifier) });
    const fail = (error: unknown) => toast.error(httpErrorToHuman(error));

    const updates = useQuery({ queryKey: modKeys.updates(identifier), queryFn: () => checkModUpdates(identifier), enabled: false, staleTime: 300_000 });
    const toggle = useMutation({ mutationFn: (mod: InstalledMod) => toggleMod(identifier, mod.name!, !mod.enabled), onSuccess: refresh, onError: fail });
    const destroy = useMutation({
        mutationFn: (mod: InstalledMod) => removeMod(identifier, mod),
        onSuccess: () => {
            setRemoving(null);
            refresh();
        },
        onError: fail,
    });
    const update = useMutation({
        mutationFn: (ids: string[]) => installMods(identifier, ids, false),
        onSuccess: () => {
            toast.success('The updates download at the next start.');
            refresh();
            updates.refetch();
        },
        onError: fail,
    });

    if (loading) return <Spinner centered />;
    if (!overview) return null;

    const term = filter.trim().toLowerCase();
    const mods = overview.mods.filter((mod) => term === '' || mod.title.toLowerCase().includes(term) || mod.name?.toLowerCase().includes(term));
    const available = Object.keys(updates.data ?? {});
    const pending = overview.mods.filter((mod) => mod.pending).length;

    return (
        <div className={'trs:flex trs:flex-col trs:gap-3'}>
            {pending > 0 && (
                <Alert type={'info'}>
                    {pending === 1 ? 'One mod downloads' : `${pending} mods download`} the next time the server starts. Progress shows in the console.
                </Alert>
            )}
            <div className={'trs:flex trs:flex-wrap trs:items-center trs:gap-2'}>
                <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={`Filter ${overview.mods.length} mods…`} className={'trs:min-w-48 trs:flex-1'} />
                {overview.workshop && (
                    <Button isSecondary isLoading={updates.isFetching} onClick={() => updates.refetch()}>
                        Check for updates
                    </Button>
                )}
                {available.length > 0 && (
                    <Button isLoading={update.isPending} onClick={() => update.mutate(available)}>
                        Update {available.length}
                    </Button>
                )}
            </div>
            {updates.isError && <Alert type={'danger'}>{httpErrorToHuman(updates.error)}</Alert>}
            {updates.isSuccess && available.length === 0 && <p className={'trs:text-sm trs:text-muted-foreground'}>Every Workshop mod is up to date.</p>}

            {mods.length === 0 ? (
                <p className={'trs:py-8 trs:text-center trs:text-sm trs:text-muted-foreground'}>No mods installed.</p>
            ) : (
                <div className={'trs:flex trs:flex-col trs:gap-2'}>
                    {mods.map((mod) => (
                        <div key={mod.id ?? mod.name} className={'trs:flex trs:flex-wrap trs:items-center trs:gap-3 trs:rounded-md trs:border trs:border-border trs:bg-card trs:p-3'}>
                            <ItemIcon src={mod.icon} className={'trs:size-10 trs:shrink-0'} />
                            <div className={'trs:min-w-0 trs:flex-1 trs:basis-48'}>
                                <div className={'trs:flex trs:flex-wrap trs:items-center trs:gap-2'}>
                                    <span className={'trs:truncate trs:font-medium'}>{mod.title}</span>
                                    {mod.pending && (
                                        <Badge size={'sm'} tone={'info'}>
                                            Downloads at next start
                                        </Badge>
                                    )}
                                    {mod.dependency && (
                                        <Badge size={'sm'} tone={'neutral'}>
                                            Needed by another mod
                                        </Badge>
                                    )}
                                    {mod.id && updates.data?.[mod.id] && (
                                        <Badge size={'sm'} tone={'warning'}>
                                            Update available
                                        </Badge>
                                    )}
                                    {!mod.enabled && (
                                        <Badge size={'sm'} tone={'neutral'}>
                                            Disabled
                                        </Badge>
                                    )}
                                </div>
                                <p className={'trs:truncate trs:font-mono trs:text-xs trs:text-muted-foreground'}>
                                    {mod.name ? `mods/${mod.name}.tmod` : `Workshop ${mod.id}`}
                                    {mod.size > 0 && ` · ${bytesToString(mod.size)}`}
                                    {!mod.id && ' · added by hand'}
                                </p>
                            </div>
                            <Switch checked={mod.enabled} disabled={!mod.name || toggle.isPending} onChange={() => toggle.mutate(mod)} aria-label={mod.enabled ? 'Disable' : 'Enable'} />
                            <Button.Danger size={'small'} isSecondary onClick={() => setRemoving(mod)}>
                                Remove
                            </Button.Danger>
                        </div>
                    ))}
                </div>
            )}
            <p className={'trs:text-xs trs:text-muted-foreground'}>Changes take effect the next time the server starts.</p>

            <Dialog.Confirm
                open={removing !== null}
                onClose={() => setRemoving(null)}
                title={`Remove ${removing?.title ?? ''}?`}
                confirm={'Remove'}
                pending={destroy.isPending}
                onConfirmed={() => removing && destroy.mutate(removing)}
            >
                {removing?.name ? `mods/${removing.name}.tmod is deleted` : 'It is taken off the download list'}
                {removing?.id ? ' and no longer downloaded from the Workshop.' : '.'} Mods that need it stop loading.
            </Dialog.Confirm>
        </div>
    );
}
