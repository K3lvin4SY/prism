import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, Select, ServerContentBlock, Spinner, cn, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { getMeta, getMods, install, modKeys, search, type ModHit, type SearchParams, type SortOrder } from '../api/mods';
import JobProgress from '../components/JobProgress';
import { Pager, Tabs } from '../components/content/ui';
import FilterSidebar from '../components/mods/FilterSidebar';
import InstalledMods from '../components/mods/InstalledMods';
import ModCard from '../components/mods/ModCard';
import ModDialog from '../components/mods/ModDialog';
import { useSatisfactoryInfo } from '../hooks/useSatisfactoryInfo';
import { NamedIcon } from '../icons';

const SORTS: { value: SortOrder; label: string }[] = [
    { value: 'popular', label: 'Popular' },
    { value: 'downloads', label: 'Downloads' },
    { value: 'trending', label: 'Trending' },
    { value: 'updated', label: 'Recently updated' },
    { value: 'name', label: 'Name' },
];

const LAYOUT_KEY = 'prism-satisfactory:mods-layout';

function readLayout(): 'list' | 'grid' {
    try {
        return localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'list';
    } catch {
        return 'list';
    }
}

export default function ModsScreen() {
    const { identifier } = useSatisfactoryInfo();
    const queryClient = useQueryClient();
    const [tab, setTab] = useState<'browse' | 'installed'>('browse');
    const [query, setQuery] = useState('');
    const [debounced, setDebounced] = useState('');
    const [sort, setSort] = useState<SortOrder>('popular');
    const [limit, setLimit] = useState(20);
    const [page, setPage] = useState(1);
    const [layout, setLayout] = useState<'list' | 'grid'>(readLayout);
    const [open, setOpen] = useState<ModHit | null>(null);
    const [installing, setInstalling] = useState<string[]>([]);
    const [job, setJob] = useState<string | null>(null);

    const state = useQuery({ queryKey: keys.mods(identifier), queryFn: () => getMods(identifier), refetchInterval: job ? false : 15_000 });
    const meta = useQuery({ queryKey: modKeys.meta(identifier), queryFn: () => getMeta(identifier), staleTime: 3_600_000 });
    const params: SearchParams = { query: debounced, sort, page, limit };
    const results = useQuery({ queryKey: modKeys.search(identifier, params), queryFn: () => search(identifier, params), placeholderData: keepPreviousData, staleTime: 60_000 });

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
        void queryClient.invalidateQueries({ queryKey: ['prism-satisfactory', identifier, 'mods'] });
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
            <div className={'sfy:flex sfy:flex-col sfy:gap-4'}>
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
                    <div className={'sfy:grid sfy:gap-4 sfy:lg:grid-cols-[260px_1fr]'}>
                        <div className={'sfy:min-w-0'}>
                            {meta.isLoading ? (
                                <Spinner centered />
                            ) : meta.isError || !meta.data ? (
                                <Alert type={'danger'}>{httpErrorToHuman(meta.error)}</Alert>
                            ) : (
                                <FilterSidebar meta={meta.data} state={state.data} />
                            )}
                        </div>

                        <div className={'sfy:flex sfy:flex-col sfy:gap-3 sfy:min-w-0'}>
                            <div className={'sfy:relative'}>
                                <NamedIcon name={'search'} size={16} className={'sfy:absolute sfy:left-3 sfy:top-1/2 sfy:-translate-y-1/2 sfy:text-muted-foreground sfy:pointer-events-none'} />
                                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={'Search ficsit.app (three letters or more)…'} className={'sfy:w-full sfy:pl-9'} />
                            </div>
                            <div className={'sfy:flex sfy:flex-wrap sfy:items-center sfy:gap-2'}>
                                <div className={'sfy:flex sfy:items-center sfy:gap-2'}>
                                    <span className={'sfy:text-sm sfy:text-muted-foreground'}>Sort by</span>
                                    <div className={'sfy:w-44'}>
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
                                <div className={'sfy:flex sfy:items-center sfy:gap-2'}>
                                    <span className={'sfy:text-sm sfy:text-muted-foreground'}>View</span>
                                    <div className={'sfy:w-24'}>
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
                                    className={'sfy:flex sfy:size-9 sfy:items-center sfy:justify-center sfy:rounded-md sfy:border sfy:border-border sfy:bg-card sfy:cursor-pointer sfy:hover:bg-muted'}
                                >
                                    <NamedIcon name={layout === 'list' ? 'layout-grid' : 'list'} size={16} />
                                </button>
                                <div className={'sfy:ml-auto'}>
                                    <Pager page={page} total={totalPages} onPage={setPage} />
                                </div>
                            </div>

                            {results.isError && <Alert type={'danger'}>{httpErrorToHuman(results.error)}</Alert>}

                            {results.isLoading ? (
                                <Spinner centered />
                            ) : results.data && results.data.hits.length === 0 ? (
                                <p className={'sfy:py-8 sfy:text-center sfy:text-sm sfy:text-muted-foreground'}>No mods match these filters.</p>
                            ) : (
                                <div className={cn('sfy:grid sfy:gap-3', layout === 'grid' && 'sfy:md:grid-cols-2', results.isFetching && 'sfy:opacity-70')}>
                                    {results.data?.hits.map((hit) => (
                                        <ModCard
                                            key={hit.id}
                                            hit={hit}
                                            layout={layout}
                                            busy={installing.includes(hit.id)}
                                            category={hit.tags[0]}
                                            onOpen={() => setOpen(hit)}
                                            onInstall={() => (confirm || !hit.version ? setOpen(hit) : void installMods([hit.id], false, hit.title))}
                                        />
                                    ))}
                                </div>
                            )}

                            <div className={'sfy:flex sfy:justify-end'}>
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
