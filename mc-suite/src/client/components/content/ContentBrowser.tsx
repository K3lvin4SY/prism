import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Input, NamedIcon, Select, Spinner, cn, httpErrorToHuman } from '@pterodactyl/sdk';
import { contentKeys, getCategories, search, type BrowseKind, type ProjectHit, type SearchParams, type SortOrder } from '../../api/content';
import { useMcInfo } from '../../hooks/useMcInfo';
import FilterSidebar, { emptyFilters, type FilterState } from './FilterSidebar';
import InstalledList from './InstalledList';
import { CurrentModpack } from './Modpack';
import ProjectCard from './ProjectCard';
import ProjectDialog from './ProjectDialog';

const SORTS: { value: SortOrder; label: string }[] = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'downloads', label: 'Downloads' },
    { value: 'follows', label: 'Follows' },
    { value: 'newest', label: 'Date published' },
    { value: 'updated', label: 'Date updated' },
];

const LAYOUT_KEY = 'mc-suite:content-layout';

function readLayout(): 'list' | 'grid' {
    try {
        return localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'list';
    } catch {
        return 'list';
    }
}

/** Page numbers with gaps: 1 … 4 5 6 … 20 */
function pageItems(page: number, total: number): (number | 'gap')[] {
    const pages = new Set([1, total, page - 1, page, page + 1].filter((value) => value >= 1 && value <= total));
    const sorted = [...pages].sort((a, b) => a - b);
    const items: (number | 'gap')[] = [];
    sorted.forEach((value, index) => {
        if (index > 0 && value - sorted[index - 1] > 1) items.push('gap');
        items.push(value);
    });

    return items;
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
    if (total <= 1) return null;

    const button = 'mcs:flex mcs:size-8 mcs:items-center mcs:justify-center mcs:rounded-full mcs:text-sm mcs:cursor-pointer';

    return (
        <nav className={'mcs:flex mcs:items-center mcs:gap-1'} aria-label={'Pages'}>
            <button type={'button'} className={cn(button, 'mcs:hover:bg-muted mcs:disabled:opacity-40')} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={'Previous page'}>
                <NamedIcon name={'chevron-left'} size={16} />
            </button>
            {pageItems(page, total).map((item, index) =>
                item === 'gap' ? (
                    <span key={`gap-${index}`} className={'mcs:px-1 mcs:text-muted-foreground'}>
                        …
                    </span>
                ) : (
                    <button
                        key={item}
                        type={'button'}
                        onClick={() => onPage(item)}
                        aria-current={item === page ? 'page' : undefined}
                        className={cn(button, 'mcs:min-w-8 mcs:px-2', item === page ? 'mcs:bg-primary mcs:text-primary-foreground mcs:font-semibold' : 'mcs:hover:bg-muted')}
                    >
                        {item}
                    </button>
                )
            )}
            <button type={'button'} className={cn(button, 'mcs:hover:bg-muted mcs:disabled:opacity-40')} disabled={page >= total} onClick={() => onPage(page + 1)} aria-label={'Next page'}>
                <NamedIcon name={'chevron-right'} size={16} />
            </button>
        </nav>
    );
}

export default function ContentBrowser({ kind }: { kind: BrowseKind }) {
    const { identifier } = useMcInfo();
    const [tab, setTab] = useState<'browse' | 'installed'>('browse');
    const [query, setQuery] = useState('');
    const [debounced, setDebounced] = useState('');
    const [filters, setFilters] = useState<FilterState>(emptyFilters);
    const [sort, setSort] = useState<SortOrder>('relevance');
    const [limit, setLimit] = useState(20);
    const [page, setPage] = useState(1);
    const [layout, setLayout] = useState<'list' | 'grid'>(readLayout);
    const [open, setOpen] = useState<ProjectHit | null>(null);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebounced(query.trim());
            setPage(1);
        }, 350);

        return () => window.clearTimeout(timer);
    }, [query]);

    const meta = useQuery({ queryKey: contentKeys.categories(identifier, kind), queryFn: () => getCategories(identifier, kind), staleTime: 3_600_000 });
    const params: SearchParams = { query: debounced, ...filters, sort, page, limit };
    const results = useQuery({
        queryKey: contentKeys.search(identifier, kind, params),
        queryFn: () => search(identifier, kind, params),
        placeholderData: keepPreviousData,
        staleTime: 60_000,
    });

    const toggleLayout = () => {
        const next = layout === 'list' ? 'grid' : 'list';
        setLayout(next);
        try {
            localStorage.setItem(LAYOUT_KEY, next);
        } catch {
            // Remembering the layout is a convenience only.
        }
    };

    const changeFilters = (next: FilterState) => {
        setFilters(next);
        setPage(1);
    };

    const totalPages = results.data ? Math.max(1, Math.ceil(Math.min(results.data.total, 10_000) / limit)) : 1;

    return (
        <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
            <div className={'mcs:flex mcs:gap-1 mcs:border-b mcs:border-border'}>
                {(['browse', 'installed'] as const).map((value) => (
                    <button
                        key={value}
                        type={'button'}
                        onClick={() => setTab(value)}
                        className={cn(
                            'mcs:px-4 mcs:py-2 mcs:text-sm mcs:-mb-px mcs:border-b-2 mcs:cursor-pointer',
                            tab === value ? 'mcs:border-primary mcs:text-foreground' : 'mcs:border-transparent mcs:text-muted-foreground mcs:hover:text-foreground'
                        )}
                    >
                        {value === 'browse' ? 'Browse' : kind === 'modpacks' ? 'Current modpack' : 'Installed'}
                    </button>
                ))}
            </div>

            {tab === 'installed' ? (
                kind === 'modpacks' ? (
                    <CurrentModpack />
                ) : (
                    <InstalledList kind={kind} />
                )
            ) : (
                <div className={'mcs:grid mcs:gap-4 mcs:lg:grid-cols-[260px_1fr]'}>
                    <div className={'mcs:min-w-0'}>
                        {meta.isLoading ? (
                            <Spinner centered />
                        ) : meta.isError || !meta.data ? (
                            <Alert type={'danger'}>{httpErrorToHuman(meta.error)}</Alert>
                        ) : (
                            <FilterSidebar filters={meta.data} state={filters} onChange={changeFilters} />
                        )}
                    </div>

                    <div className={'mcs:flex mcs:flex-col mcs:gap-3 mcs:min-w-0'}>
                        <div className={'mcs:relative'}>
                            <NamedIcon name={'search'} size={16} className={'mcs:absolute mcs:left-3 mcs:top-1/2 mcs:-translate-y-1/2 mcs:text-muted-foreground mcs:pointer-events-none'} />
                            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${kind}…`} className={'mcs:w-full mcs:pl-9'} />
                        </div>
                        <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-2'}>
                            <div className={'mcs:flex mcs:items-center mcs:gap-2'}>
                                <span className={'mcs:text-sm mcs:text-muted-foreground'}>Sort by</span>
                                <div className={'mcs:w-44'}>
                                    <Select value={sort} onChange={(value) => { setSort(value as SortOrder); setPage(1); }} options={SORTS} />
                                </div>
                            </div>
                            <div className={'mcs:flex mcs:items-center mcs:gap-2'}>
                                <span className={'mcs:text-sm mcs:text-muted-foreground'}>View</span>
                                <div className={'mcs:w-24'}>
                                    <Select
                                        value={limit}
                                        onChange={(value) => { setLimit(Number(value)); setPage(1); }}
                                        options={[10, 20, 50, 100].map((value) => ({ value, label: String(value) }))}
                                    />
                                </div>
                            </div>
                            <button
                                type={'button'}
                                onClick={toggleLayout}
                                aria-label={layout === 'list' ? 'Show as grid' : 'Show as list'}
                                className={'mcs:flex mcs:size-9 mcs:items-center mcs:justify-center mcs:rounded-md mcs:border mcs:border-border mcs:bg-card mcs:cursor-pointer mcs:hover:bg-muted'}
                            >
                                <NamedIcon name={layout === 'list' ? 'layout-grid' : 'list'} size={16} />
                            </button>
                            <div className={'mcs:ml-auto'}>
                                <Pager page={page} total={totalPages} onPage={setPage} />
                            </div>
                        </div>

                        {results.isError && <Alert type={'danger'}>{httpErrorToHuman(results.error)}</Alert>}

                        {results.isLoading ? (
                            <Spinner centered />
                        ) : results.data && results.data.hits.length === 0 ? (
                            <p className={'mcs:text-sm mcs:text-muted-foreground mcs:py-8 mcs:text-center'}>No {kind} match these filters.</p>
                        ) : (
                            <div className={cn('mcs:grid mcs:gap-3', layout === 'grid' && 'mcs:md:grid-cols-2', results.isFetching && 'mcs:opacity-70')}>
                                {results.data?.hits.map((hit) => (
                                    <ProjectCard
                                        key={hit.id}
                                        hit={hit}
                                        layout={layout}
                                        categories={meta.data?.categories ?? []}
                                        loaders={meta.data?.loaders ?? []}
                                        onOpen={() => setOpen(hit)}
                                    />
                                ))}
                            </div>
                        )}

                        <div className={'mcs:flex mcs:justify-end'}>
                            <Pager page={page} total={totalPages} onPage={(next) => { setPage(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                        </div>
                    </div>
                </div>
            )}

            {open && <ProjectDialog kind={kind} hit={open} onClose={() => setOpen(null)} onInstalled={() => setTab('installed')} />}
        </div>
    );
}
