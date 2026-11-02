import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Alert, Button, PageContentBlock, Spinner, formatDate, httpErrorToHuman } from '@pterodactyl/sdk';
import { NO_FILTERS, eventsKey, getEvents, type Entry, type Filters } from '../api';
import AlertsPanel from '../components/AlertsPanel';
import FilterBar from '../components/FilterBar';
import { configStore } from '../config';
import { NamedIcon } from '../icons';
import { dayOf, describe, family } from '../lib/describe';

const FAMILY_ICONS: Record<ReturnType<typeof family>, string> = { auth: 'key-round', user: 'user', server: 'server', admin: 'shield', other: 'puzzle' };
const FAMILY_TONES: Record<ReturnType<typeof family>, string> = {
    auth: 'pad:text-sky-500',
    user: 'pad:text-violet-500',
    server: 'pad:text-emerald-500',
    admin: 'pad:text-amber-500',
    other: 'pad:text-muted-foreground',
};

/** The admin area's "Audit": everything that happened on the panel, newest first, grouped by day. */
export default function AuditScreen() {
    const config = configStore.use();
    const [filters, setFilters] = useState<Filters>(NO_FILTERS);
    const query = useInfiniteQuery({
        queryKey: eventsKey(filters),
        queryFn: ({ pageParam }) => getEvents(filters, pageParam),
        initialPageParam: null as number | null,
        getNextPageParam: (last) => last.meta.next,
    });

    const entries = query.data?.pages.flatMap((page) => page.data) ?? [];
    const days = entries.reduce<{ day: string; entries: Entry[] }[]>((groups, entry) => {
        const day = dayOf(entry.timestamp);
        const last = groups[groups.length - 1];
        if (last?.day === day) last.entries.push(entry);
        else groups.push({ day, entries: [entry] });

        return groups;
    }, []);

    return (
        <PageContentBlock title={'Audit'}>
            <div className={'pad:mx-auto pad:flex pad:max-w-6xl pad:flex-col pad:gap-4'}>
                <AlertsPanel enabled={config.alerts} />
                <FilterBar filters={filters} onChange={setFilters} />

                {query.isLoading && <Spinner centered />}
                {query.isError && <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>}
                {query.data && entries.length === 0 && (
                    <div className={'pt-surface pad:flex pad:flex-col pad:items-center pad:gap-2 pad:rounded-xl pad:border pad:border-border pad:bg-card pad:py-12 pad:text-sm pad:text-muted-foreground'}>
                        <NamedIcon name={'history'} size={24} />
                        Nothing matches these filters.
                    </div>
                )}

                {days.map((group) => (
                    <section key={group.day} className={'pt-surface pad:overflow-hidden pad:rounded-xl pad:border pad:border-border pad:bg-card'}>
                        <h2 className={'pad:border-b pad:border-border pad:px-5 pad:py-2.5 pad:font-mono pad:text-xs pad:font-medium pad:uppercase pad:tracking-[0.18em] pad:text-muted-foreground'}>{formatDate(group.entries[0].timestamp, 'dddd, MMMM D, YYYY')}</h2>
                        <ol>
                            {group.entries.map((entry) => (
                                <Row key={entry.id} entry={entry} onFilter={(next) => setFilters({ ...filters, ...next })} />
                            ))}
                        </ol>
                    </section>
                ))}

                {query.hasNextPage && (
                    <Button.Text className={'pad:self-center'} isLoading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                        Show older
                    </Button.Text>
                )}
            </div>
        </PageContentBlock>
    );
}

function Row({ entry, onFilter }: { entry: Entry; onFilter: (next: Partial<Filters>) => void }) {
    const [open, setOpen] = useState(false);
    const kind = family(entry.event);
    // Sign-ins are logged about the account rather than by it.
    const person = entry.actor ?? (kind === 'auth' ? entry.subjects.find((subject) => subject.type === 'user') : undefined);
    const name = entry.actor ? entry.actor.username : person && 'label' in person ? person.label : entry.api ? 'An API key' : 'The panel';
    const personId = entry.actor?.id ?? (person && 'type' in person ? person.id : null);
    const others = entry.subjects.filter((subject) => !(subject.type === 'user' && subject.id === personId));
    const details = Object.keys(entry.properties).length > 0;

    return (
        <li className={'pad:border-b pad:border-border pad:last:border-b-0'}>
            <div className={'pad:flex pad:items-start pad:gap-3 pad:px-5 pad:py-2.5'}>
                <NamedIcon name={FAMILY_ICONS[kind]} size={16} className={'pad:mt-0.5 pad:shrink-0 ' + FAMILY_TONES[kind]} />
                <div className={'pad:min-w-0 pad:flex-1 pad:text-sm'}>
                    <p className={'pad:break-words'}>
                        {personId ? (
                            <button type={'button'} className={'pad:font-semibold pad:hover:underline'} title={'Show only this person'} onClick={() => onFilter({ user: { id: personId, label: name } })}>
                                {name}
                            </button>
                        ) : (
                            <span className={'pad:font-semibold'}>{name}</span>
                        )}{' '}
                        {describe(entry.event, entry.properties)}
                        {entry.actor?.admin && <span className={'pad:ml-1.5 pad:text-xs pad:text-amber-500'}>admin</span>}
                        {entry.api && entry.actor && <span className={'pad:ml-1.5 pad:text-xs pad:text-muted-foreground'}>via API key</span>}
                    </p>
                    {others.length > 0 && (
                        <p className={'pad:flex pad:flex-wrap pad:gap-x-3 pad:text-xs pad:text-muted-foreground'}>
                            {others.map((subject) =>
                                subject.type === 'server' ? (
                                    <button key={`${subject.type}-${subject.id}`} type={'button'} className={'pad:hover:text-foreground pad:hover:underline'} title={'Show only this server'} onClick={() => onFilter({ server: { id: subject.id, label: subject.label } })}>
                                        Server {subject.label}
                                    </button>
                                ) : (
                                    <span key={`${subject.type}-${subject.id}`}>
                                        {subject.type.replace(/_/g, ' ')} {subject.label}
                                    </span>
                                ),
                            )}
                        </p>
                    )}
                </div>
                <div className={'pad:flex pad:shrink-0 pad:flex-col pad:items-end pad:gap-0.5 pad:text-xs pad:text-muted-foreground'}>
                    <span title={formatDate(entry.timestamp, 'MMM D, YYYY HH:mm:ss')}>{formatDate(entry.timestamp, 'HH:mm')}</span>
                    <button type={'button'} className={'pad:font-mono pad:hover:text-foreground pad:hover:underline'} title={'Show only this address'} onClick={() => onFilter({ ip: entry.ip })}>
                        {entry.ip}
                    </button>
                </div>
                <button type={'button'} disabled={!details} aria-label={open ? 'Hide details' : 'Show details'} aria-expanded={open} className={'pad:mt-0.5 pad:shrink-0 pad:text-muted-foreground pad:hover:text-foreground pad:disabled:invisible'} onClick={() => setOpen(!open)}>
                    <NamedIcon name={open ? 'chevron-down' : 'chevron-right'} size={16} />
                </button>
            </div>
            {open && (
                <pre className={'pt-solid pad:mx-5 pad:mb-3 pad:overflow-x-auto pad:rounded-lg pad:bg-muted pad:p-3 pad:font-mono pad:text-xs'}>
                    {entry.event}
                    {'\n'}
                    {JSON.stringify(entry.properties, null, 2)}
                </pre>
            )}
        </li>
    );
}
