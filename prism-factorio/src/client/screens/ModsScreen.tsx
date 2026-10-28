import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, Select, ServerContentBlock, Spinner, cn, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { accountSource, getMeta, getMods, install, modKeys, search, type ModHit, type SearchParams, type SortOrder } from '../api/mods';
import JobProgress from '../components/JobProgress';
import { Pager, Tabs } from '../components/content/ui';
import FilterSidebar, { emptyFilters, type FilterState } from '../components/mods/FilterSidebar';
import InstalledMods from '../components/mods/InstalledMods';
import ModCard from '../components/mods/ModCard';
import ModDialog from '../components/mods/ModDialog';
import { useFactorioInfo } from '../hooks/useFactorioInfo';
import { NamedIcon } from '../icons';

const SORTS: { value: SortOrder; label: string }[] = [
    { value: 'popular', label: 'Popular' },
    { value: 'downloads', label: 'Downloads' },
    { value: 'rating', label: 'Trending' },
    { value: 'updated', label: 'Recently updated' },
    { value: 'name', label: 'Name' },
];

const LAYOUT_KEY = 'prism-factorio:mods-layout';

function readLayout(): 'list' | 'grid' {
    try {
        return localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'list';
    } catch {
        return 'list';
    }
}

export default function ModsScreen() {
    const { identifier, info } = useFactorioInfo();
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
    const params: SearchParams = { query: debounced, categories: filters.categories, sort, page, limit };
    const results = useQuery({ queryKey: modKeys.search(identifier, params), queryFn: () => search(identifier, params), placeholderData: keepPreviousData, staleTime: 60_000 });
    const categoryName = (id: string) => meta.data?.categories[id];

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
        void queryClient.invalidateQueries({ queryKey: ['prism-factorio', identifier, 'mods'] });
        void queryClient.invalidateQueries({ queryKey: keys.mods(identifier) });
    };

    const installMods = async (ids: string[], restartServer: boolean, title?: string) => {
        setInstalling((current) => [...current, ...ids]);
        try {
            const result = await install(identifier, ids, restartServer);
            setJob(result.job);
            setOpen(null);
            const what = title ?? result.added.slice(0, 2).join(', ');
            toast.success(result.restarting ? `Installing ${what}. The server restarts when it is done.` : `Installing ${what}. Restart the server to load it.`);
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

    return (
        <ServerContentBlock title={'Mods'}>
            <div className={'fct:flex fct:flex-col fct:gap-4'}>
                {state.data && !state.data.account && (
                    <Alert type={'warning'}>
                        The mod portal only gives downloads to a factorio.com account. Add a username and token under Properties, factorio.com account, or ask an administrator to add one in Prism Properties. Browsing works without one.
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
                        />
                    )
                ) : (
                    <div className={'fct:grid fct:gap-4 fct:lg:grid-cols-[260px_1fr]'}>
                        <div className={'fct:min-w-0'}>
                            {state.data?.account && (
                                <p className={'fct:mb-3 fct:text-xs fct:text-muted-foreground'}>
                                    Downloads as {state.data.account.username}, from {accountSource(state.data.account.from)}.
                                </p>
                            )}
                            {meta.isLoading ? (
                                <Spinner centered />
                            ) : meta.isError || !meta.data ? (
                                <Alert type={'danger'}>{httpErrorToHuman(meta.error)}</Alert>
                            ) : (
                                <FilterSidebar
                                    meta={meta.data}
                                    state={filters}
                                    onChange={(next) => {
                                        setFilters(next);
                                        setPage(1);
                                    }}
                                />
                            )}
                        </div>

                        <div className={'fct:flex fct:flex-col fct:gap-3 fct:min-w-0'}>
                            <div className={'fct:relative'}>
                                <NamedIcon name={'search'} size={16} className={'fct:absolute fct:left-3 fct:top-1/2 fct:-translate-y-1/2 fct:text-muted-foreground fct:pointer-events-none'} />
                                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={'Search the Factorio mod portal…'} className={'fct:w-full fct:pl-9'} />
                            </div>
                            <div className={'fct:flex fct:flex-wrap fct:items-center fct:gap-2'}>
                                <div className={'fct:flex fct:items-center fct:gap-2'}>
                                    <span className={'fct:text-sm fct:text-muted-foreground'}>Sort by</span>
                                    <div className={'fct:w-44'}>
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
                                <div className={'fct:flex fct:items-center fct:gap-2'}>
                                    <span className={'fct:text-sm fct:text-muted-foreground'}>View</span>
                                    <div className={'fct:w-24'}>
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
                                    className={'fct:flex fct:size-9 fct:items-center fct:justify-center fct:rounded-md fct:border fct:border-border fct:bg-card fct:cursor-pointer fct:hover:bg-muted'}
                                >
                                    <NamedIcon name={layout === 'list' ? 'layout-grid' : 'list'} size={16} />
                                </button>
                                <div className={'fct:ml-auto'}>
                                    <Pager page={page} total={totalPages} onPage={setPage} />
                                </div>
                            </div>

                            {results.isError && <Alert type={'danger'}>{httpErrorToHuman(results.error)}</Alert>}

                            {results.isLoading ? (
                                <Spinner centered />
                            ) : results.data && results.data.hits.length === 0 ? (
                                <p className={'fct:py-8 fct:text-center fct:text-sm fct:text-muted-foreground'}>No mods match these filters.</p>
                            ) : (
                                <div className={cn('fct:grid fct:gap-3', layout === 'grid' && 'fct:md:grid-cols-2', results.isFetching && 'fct:opacity-70')}>
                                    {results.data?.hits.map((hit) => (
                                        <ModCard
                                            key={hit.id}
                                            hit={hit}
                                            layout={layout}
                                            busy={installing.includes(hit.id)}
                                            category={categoryName(hit.category)}
                                            onOpen={() => setOpen(hit)}
                                            onInstall={() => (confirm ? setOpen(hit) : void installMods([hit.id], false, hit.title))}
                                        />
                                    ))}
                                </div>
                            )}

                            <div className={'fct:flex fct:justify-end'}>
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
                    category={categoryName(open.category)}
                    expansion={info?.expansion ?? []}
                    running={running}
                    busy={installing.length > 0}
                    onInstall={(id, restartServer) => void installMods([id], restartServer, open.title)}
                    onClose={() => setOpen(null)}
                />
            )}
        </ServerContentBlock>
    );
}
