import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, Select, ServerContentBlock, Spinner, cn, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { SOURCE_NAMES, getMeta, getMods, install, modKeys, repair, restart, search, type ModHit, type SearchParams, type SortOrder, type SourceName } from '../api/mods';
import JobProgress from '../components/JobProgress';
import { Pager, Tabs } from '../components/content/ui';
import FilterSidebar, { emptyFilters, type FilterState } from '../components/mods/FilterSidebar';
import InstalledMods from '../components/mods/InstalledMods';
import ModCard from '../components/mods/ModCard';
import ModDialog from '../components/mods/ModDialog';
import { useCoreKeeperInfo } from '../hooks/useCoreKeeperInfo';
import { NamedIcon } from '../icons';

const SORTS: { value: SortOrder; label: string }[] = [
    { value: 'popular', label: 'Popular' },
    { value: 'downloads', label: 'Downloads' },
    { value: 'rating', label: 'Rating' },
    { value: 'newest', label: 'Date published' },
    { value: 'updated', label: 'Date updated' },
];

const LAYOUT_KEY = 'prism-corekeeper:mods-layout';

function readLayout(): 'list' | 'grid' {
    try {
        return localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'list';
    } catch {
        return 'list';
    }
}

export default function ModsScreen() {
    const { identifier } = useCoreKeeperInfo();
    const queryClient = useQueryClient();
    const [tab, setTab] = useState<'browse' | 'installed'>('browse');
    const [query, setQuery] = useState('');
    const [debounced, setDebounced] = useState('');
    const [filters, setFilters] = useState<FilterState>(emptyFilters);
    const [sort, setSort] = useState<SortOrder>('popular');
    const [limit, setLimit] = useState(20);
    const [page, setPage] = useState(1);
    const [layout, setLayout] = useState<'list' | 'grid'>(readLayout);
    const [open, setOpen] = useState<ModHit | null>(null);
    const [installing, setInstalling] = useState<string[]>([]);
    const [job, setJob] = useState<string | null>(null);

    const state = useQuery({ queryKey: keys.mods(identifier), queryFn: () => getMods(identifier), refetchInterval: job ? false : 15_000 });
    const meta = useQuery({ queryKey: modKeys.meta(identifier), queryFn: () => getMeta(identifier), staleTime: 3_600_000 });
    const configured = state.data?.sources ?? { modio: true, steam: true };
    const sources: SourceName[] = filters.sources.length > 0 ? filters.sources : (['modio', 'steam'] as SourceName[]).filter((source) => configured[source]);
    const params: SearchParams = { query: debounced, sources, categories: filters.categories, sides: filters.sides, gameVersion: filters.gameVersion, sort, page, limit };
    const results = useQuery({ queryKey: modKeys.search(identifier, params), queryFn: () => search(identifier, params), placeholderData: keepPreviousData, staleTime: 60_000, enabled: sources.length > 0 });

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebounced(query.trim());
            setPage(1);
        }, 350);

        return () => window.clearTimeout(timer);
    }, [query]);

    // A plan already running (from another tab or person) shows its progress.
    useEffect(() => {
        if (!job && state.data?.job) setJob(state.data.job);
    }, [state.data?.job, job]);

    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: ['prism-corekeeper', identifier, 'mods'] });
        void queryClient.invalidateQueries({ queryKey: keys.mods(identifier) });
    };

    const installMods = async (ids: string[], restartServer: boolean, title?: string) => {
        setInstalling((current) => [...current, ...ids]);
        try {
            const result = await install(identifier, ids, restartServer);
            setJob(result.job);
            setOpen(null);
            const what = title ?? result.added.slice(0, 2).join(', ');
            toast.success(
                result.workshop && !result.restarting
                    ? `${what} downloads from the Steam Workshop when the server next starts.`
                    : result.restarting
                      ? `Installing ${what}. The server restarts when it is done.`
                      : `Installing ${what}. Restart the server to load it.`
            );
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setInstalling((current) => current.filter((id) => !ids.includes(id)));
        }
    };

    const toggleLayout = () => {
        const next = layout === 'list' ? 'grid' : 'list';
        setLayout(next);
        try {
            localStorage.setItem(LAYOUT_KEY, next);
        } catch {
            // Remembering the layout is a convenience only.
        }
    };

    const totalPages = results.data ? Math.max(1, Math.ceil(Math.min(results.data.total, 5_000) / limit)) : 1;
    const confirm = state.data?.confirmInstalls ?? true;
    const running = state.data?.running ?? false;
    const errors = Object.entries(results.data?.errors ?? {}) as [SourceName, string][];

    return (
        <ServerContentBlock title={'Mods'}>
            <div className={'cks:flex cks:flex-col cks:gap-4'}>
                {state.data?.hookMissing && (
                    <Alert type={'warning'}>
                        <div className={'cks:flex cks:flex-wrap cks:items-center cks:gap-3'}>
                            <span className={'cks:flex-1'}>The startup command no longer runs Prism's start step, so Workshop mods are not downloaded. Someone may have reset it.</span>
                            <Button size={'small'} onClick={() => void repair(identifier).then(setJob).catch((error) => toast.error(httpErrorToHuman(error)))}>
                                Put it back
                            </Button>
                        </div>
                    </Alert>
                )}
                {job && (
                    <JobProgress
                        key={job}
                        job={job}
                        onFinished={() => {
                            refresh();
                            window.setTimeout(() => setJob(null), 4000);
                        }}
                    />
                )}

                <Tabs
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: 'browse', label: 'Browse' },
                        { value: 'installed', label: state.data ? `Installed (${state.data.mods.length})` : 'Installed' },
                    ]}
                />

                {tab === 'installed' ? (
                    state.isLoading ? (
                        <Spinner centered />
                    ) : state.isError || !state.data ? (
                        <Alert type={'danger'}>{httpErrorToHuman(state.error)}</Alert>
                    ) : (
                        <InstalledMods
                            identifier={identifier}
                            state={state.data}
                            busy={installing.length > 0 || job !== null}
                            onChanged={refresh}
                            onUpdate={(ids) => void installMods(ids, running, ids.length === 1 ? undefined : `${ids.length} mods`)}
                            onRestart={() => void restart(identifier).then(setJob).catch((error) => toast.error(httpErrorToHuman(error)))}
                        />
                    )
                ) : (
                    <div className={'cks:grid cks:gap-4 cks:lg:grid-cols-[260px_1fr]'}>
                        <div className={'cks:min-w-0'}>
                            {meta.isLoading ? (
                                <Spinner centered />
                            ) : meta.isError || !meta.data ? (
                                <Alert type={'danger'}>{httpErrorToHuman(meta.error)}</Alert>
                            ) : (
                                <FilterSidebar
                                    meta={meta.data}
                                    state={filters}
                                    configured={configured}
                                    onChange={(next) => {
                                        setFilters(next);
                                        setPage(1);
                                    }}
                                />
                            )}
                        </div>

                        <div className={'cks:flex cks:flex-col cks:gap-3 cks:min-w-0'}>
                            <div className={'cks:relative'}>
                                <NamedIcon name={'search'} size={16} className={'cks:absolute cks:left-3 cks:top-1/2 cks:-translate-y-1/2 cks:text-muted-foreground cks:pointer-events-none'} />
                                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={'Search Core Keeper mods…'} className={'cks:w-full cks:pl-9'} />
                            </div>
                            <div className={'cks:flex cks:flex-wrap cks:items-center cks:gap-2'}>
                                <div className={'cks:flex cks:items-center cks:gap-2'}>
                                    <span className={'cks:text-sm cks:text-muted-foreground'}>Sort by</span>
                                    <div className={'cks:w-44'}>
                                        <Select
                                            value={sort}
                                            onChange={(value) => {
                                                setSort(value as SortOrder);
                                                setPage(1);
                                            }}
                                            options={SORTS}
                                        />
                                    </div>
                                </div>
                                <div className={'cks:flex cks:items-center cks:gap-2'}>
                                    <span className={'cks:text-sm cks:text-muted-foreground'}>View</span>
                                    <div className={'cks:w-24'}>
                                        <Select
                                            value={limit}
                                            onChange={(value) => {
                                                setLimit(Number(value));
                                                setPage(1);
                                            }}
                                            options={[10, 20, 50].map((value) => ({ value, label: String(value) }))}
                                        />
                                    </div>
                                </div>
                                <button
                                    type={'button'}
                                    onClick={toggleLayout}
                                    aria-label={layout === 'list' ? 'Show as grid' : 'Show as list'}
                                    className={'cks:flex cks:size-9 cks:items-center cks:justify-center cks:rounded-md cks:border cks:border-border cks:bg-card cks:cursor-pointer cks:hover:bg-muted'}
                                >
                                    <NamedIcon name={layout === 'list' ? 'layout-grid' : 'list'} size={16} />
                                </button>
                                <div className={'cks:ml-auto'}>
                                    <Pager page={page} total={totalPages} onPage={setPage} />
                                </div>
                            </div>

                            {sources.length === 0 && <Alert type={'warning'}>No mod source is set up yet. An administrator adds a mod.io API key or a Steam Web API key in Prism Properties.</Alert>}
                            {errors.map(([source, message]) => (
                                <Alert key={source} type={'warning'}>
                                    {SOURCE_NAMES[source]}: {message}
                                </Alert>
                            ))}
                            {results.isError && <Alert type={'danger'}>{httpErrorToHuman(results.error)}</Alert>}

                            {results.isLoading ? (
                                <Spinner centered />
                            ) : results.data && results.data.hits.length === 0 ? (
                                <p className={'cks:py-8 cks:text-center cks:text-sm cks:text-muted-foreground'}>No mods match these filters.</p>
                            ) : (
                                <div className={cn('cks:grid cks:gap-3', layout === 'grid' && 'cks:md:grid-cols-2', results.isFetching && 'cks:opacity-70')}>
                                    {results.data?.hits.map((hit) => (
                                        <ModCard
                                            key={hit.id}
                                            hit={hit}
                                            layout={layout}
                                            busy={installing.includes(hit.id)}
                                            onOpen={() => setOpen(hit)}
                                            onInstall={() => (confirm || hit.alsoOn ? setOpen(hit) : void installMods([hit.id], false, hit.title))}
                                        />
                                    ))}
                                </div>
                            )}

                            <div className={'cks:flex cks:justify-end'}>
                                <Pager
                                    page={page}
                                    total={totalPages}
                                    onPage={(next) => {
                                        setPage(next);
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {open && (
                <ModDialog
                    key={open.id}
                    identifier={identifier}
                    hit={open}
                    running={running}
                    busy={installing.length > 0}
                    onInstall={(id, restartServer) => void installMods([id], restartServer, open.title)}
                    onClose={() => setOpen(null)}
                />
            )}
        </ServerContentBlock>
    );
}
