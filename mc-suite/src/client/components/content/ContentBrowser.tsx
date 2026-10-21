import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Button, Input, Label, NamedIcon, Select, Spinner, TitledGreyBox, cn, httpErrorToHuman } from '@pterodactyl/sdk';
import { contentKeys, getCategories, search, type ContentKind, type ProjectHit, type SearchParams, type SortOrder } from '../../api/content';
import { useMcInfo } from '../../hooks/useMcInfo';
import InstalledList from './InstalledList';
import ProjectCard from './ProjectCard';
import ProjectDialog from './ProjectDialog';

const SORTS: { value: SortOrder; label: string }[] = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'downloads', label: 'Most downloaded' },
    { value: 'follows', label: 'Most followed' },
    { value: 'newest', label: 'Newest' },
    { value: 'updated', label: 'Recently updated' },
];

const LAYOUT_KEY = 'mc-suite:content-layout';

function readLayout(): 'list' | 'grid' {
    try {
        return localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'list';
    } catch {
        return 'list';
    }
}

export default function ContentBrowser({ kind }: { kind: ContentKind }) {
    const { identifier, info } = useMcInfo();
    const [tab, setTab] = useState<'browse' | 'installed'>('browse');
    const [query, setQuery] = useState('');
    const [debounced, setDebounced] = useState('');
    const [categories, setCategories] = useState<string[]>([]);
    const [loaders, setLoaders] = useState<string[] | null>(null);
    const [gameVersion, setGameVersion] = useState<string | null | undefined>(undefined);
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
    const effectiveLoaders = loaders ?? meta.data?.serverLoaders ?? null;
    const params: SearchParams = { query: debounced, categories, loaders: effectiveLoaders, gameVersion, sort, page, limit };
    const results = useQuery({
        queryKey: contentKeys.search(identifier, kind, params),
        queryFn: () => search(identifier, kind, params),
        placeholderData: keepPreviousData,
        staleTime: 60_000,
        enabled: meta.isSuccess,
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

    const totalPages = results.data ? Math.max(1, Math.ceil(Math.min(results.data.total, 10_000) / limit)) : 1;
    const noun = kind === 'plugins' ? 'plugins' : 'mods';

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
                        {value === 'browse' ? 'Browse' : 'Installed'}
                    </button>
                ))}
            </div>

            {tab === 'installed' ? (
                <InstalledList kind={kind} />
            ) : (
                <div className={'mcs:grid mcs:gap-4 mcs:lg:grid-cols-[240px_1fr]'}>
                    <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
                        <TitledGreyBox title={'Category'}>
                            <Select
                                multiple
                                value={categories}
                                placeholder={'All categories'}
                                onChange={(value) => {
                                    setCategories(value.map(String));
                                    setPage(1);
                                }}
                                options={(meta.data?.categories ?? []).map((category) => ({ value: category.name, label: category.name.replace(/-/g, ' ') }))}
                            />
                        </TitledGreyBox>
                        <TitledGreyBox title={'Game version'}>
                            <Select
                                value={gameVersion === undefined ? 'server' : gameVersion ?? 'any'}
                                onChange={(value) => {
                                    setGameVersion(value === 'server' ? undefined : value === 'any' ? null : String(value));
                                    setPage(1);
                                }}
                                options={[
                                    { value: 'server', label: info?.version ? `This server (${info.version})` : 'This server' },
                                    { value: 'any', label: 'Any version' },
                                ]}
                            />
                        </TitledGreyBox>
                        <TitledGreyBox title={'Loader'}>
                            <Select
                                multiple
                                value={effectiveLoaders ?? []}
                                placeholder={'Any loader'}
                                onChange={(value) => {
                                    setLoaders(value.map(String));
                                    setPage(1);
                                }}
                                options={(meta.data?.loaders ?? []).map((loader) => ({ value: loader, label: loader }))}
                            />
                        </TitledGreyBox>
                    </div>

                    <div className={'mcs:flex mcs:flex-col mcs:gap-3 mcs:min-w-0'}>
                        <div className={'mcs:flex mcs:flex-wrap mcs:gap-2'}>
                            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${noun}…`} className={'mcs:flex-1 mcs:min-w-48'} />
                            <div className={'mcs:w-44'}>
                                <Select value={sort} onChange={(value) => { setSort(value as SortOrder); setPage(1); }} options={SORTS} />
                            </div>
                            <div className={'mcs:w-24'}>
                                <Select
                                    value={limit}
                                    onChange={(value) => { setLimit(Number(value)); setPage(1); }}
                                    options={[10, 20, 50, 100].map((value) => ({ value, label: String(value) }))}
                                />
                            </div>
                            <Button isSecondary onClick={toggleLayout} aria-label={layout === 'list' ? 'Show as grid' : 'Show as list'}>
                                <NamedIcon name={layout === 'list' ? 'layout-grid' : 'list'} size={16} />
                            </Button>
                        </div>

                        {meta.isError && <Alert type={'danger'}>{httpErrorToHuman(meta.error)}</Alert>}
                        {results.isError && <Alert type={'danger'}>{httpErrorToHuman(results.error)}</Alert>}

                        {results.isLoading || meta.isLoading ? (
                            <Spinner centered />
                        ) : results.data && results.data.hits.length === 0 ? (
                            <p className={'mcs:text-sm mcs:text-muted-foreground mcs:py-8 mcs:text-center'}>No {noun} match these filters.</p>
                        ) : (
                            <div className={cn('mcs:grid mcs:gap-2', layout === 'grid' && 'mcs:md:grid-cols-2', results.isFetching && 'mcs:opacity-70')}>
                                {results.data?.hits.map((hit) => (
                                    <ProjectCard key={hit.id} hit={hit} layout={layout} onOpen={() => setOpen(hit)} />
                                ))}
                            </div>
                        )}

                        {results.data && totalPages > 1 && (
                            <div className={'mcs:flex mcs:items-center mcs:justify-center mcs:gap-2'}>
                                <Button.Text size={'small'} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                                    Previous
                                </Button.Text>
                                <Label>
                                    Page {page} of {totalPages}
                                </Label>
                                <Button.Text size={'small'} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                                    Next
                                </Button.Text>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {open && <ProjectDialog kind={kind} hit={open} onClose={() => setOpen(null)} onInstalled={() => setTab('installed')} />}
        </div>
    );
}
