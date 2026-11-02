import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select, useDebouncedCallback } from '@pterodactyl/sdk';
import { NO_FILTERS, exportUrl, filtersKey, getEventNames, lookup, params, type Filters, type Picked } from '../api';
import { NamedIcon } from '../icons';

const eyebrow = 'pad:font-mono pad:text-xs pad:font-medium pad:uppercase pad:tracking-[0.18em] pad:text-muted-foreground';

const FAMILIES: { value: Filters['family']; label: string }[] = [
    { value: '', label: 'Everything' },
    { value: 'auth', label: 'Sign-ins' },
    { value: 'user', label: 'Accounts' },
    { value: 'server', label: 'Servers' },
    { value: 'admin', label: 'Admin' },
    { value: 'other', label: 'Extensions' },
];

/** What the timeline shows: a family, an event, who, which server, an address, dates and text. */
export default function FilterBar({ filters, onChange }: { filters: Filters; onChange: (filters: Filters) => void }) {
    const events = useQuery({ queryKey: filtersKey, queryFn: getEventNames, staleTime: 60_000 });
    const [q, setQ] = useState(filters.q);
    const [ip, setIp] = useState(filters.ip);
    const typed = useDebouncedCallback((next: Partial<Filters>) => onChange({ ...filters, ...next }), 400);
    const set = (next: Partial<Filters>) => onChange({ ...filters, ...next });
    const active = Object.keys(params(filters)).length > 0;

    return (
        <section className={'pt-surface pad:flex pad:flex-col pad:gap-4 pad:rounded-xl pad:border pad:border-border pad:bg-card pad:p-4'}>
            <div className={'pad:flex pad:flex-wrap pad:items-center pad:gap-2'}>
                <div role={'tablist'} className={'pad:flex pad:flex-wrap pad:gap-1 pad:rounded-lg pad:border pad:border-border pad:p-1'}>
                    {FAMILIES.map((item) => (
                        <button
                            key={item.value || 'all'}
                            type={'button'}
                            role={'tab'}
                            aria-selected={filters.family === item.value}
                            onClick={() => set({ family: item.value, event: '' })}
                            className={'pad:rounded-md pad:px-3 pad:py-1 pad:text-sm ' + (filters.family === item.value ? 'pad:bg-accent pad:font-semibold pad:text-accent-foreground' : 'pad:text-muted-foreground pad:hover:text-foreground')}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                <div className={'pad:ml-auto pad:flex pad:gap-2'}>
                    {active && (
                        <Button.Text
                            size={'small'}
                            onClick={() => {
                                setQ('');
                                setIp('');
                                onChange(NO_FILTERS);
                            }}
                        >
                            Clear filters
                        </Button.Text>
                    )}
                    <a href={exportUrl(filters)} download className={'pad:inline-flex'}>
                        <Button.Text size={'small'} tabIndex={-1}>
                            <NamedIcon name={'download'} size={14} className={'pad:mr-1'} /> Export CSV
                        </Button.Text>
                    </a>
                </div>
            </div>

            <div className={'pad:grid pad:gap-3 pad:sm:grid-cols-2 pad:xl:grid-cols-4'}>
                <label className={'pad:flex pad:flex-col pad:gap-1.5'}>
                    <span className={eyebrow}>Search</span>
                    <Input
                        value={q}
                        placeholder={'Command, file name, email…'}
                        onChange={(event) => {
                            setQ(event.target.value);
                            typed({ q: event.target.value });
                        }}
                    />
                </label>
                <div className={'pad:flex pad:flex-col pad:gap-1.5'}>
                    <span className={eyebrow}>Event</span>
                    <Select
                        value={filters.event || null}
                        placeholder={'Any event'}
                        searchPlaceholder={'Find an event'}
                        options={(events.data ?? []).filter((name) => !filters.family || (filters.family === 'other' ? !/^(auth|user|server|admin):/.test(name) : name.startsWith(filters.family + ':'))).map((name) => ({ value: name, label: name }))}
                        onChange={(value) => set({ event: String(value) })}
                    />
                </div>
                <Lookup type={'user'} label={'By or about'} placeholder={'Anyone'} picked={filters.user} onPick={(user) => set({ user })} />
                <Lookup type={'server'} label={'Server'} placeholder={'Any server'} picked={filters.server} onPick={(server) => set({ server })} />
                <label className={'pad:flex pad:flex-col pad:gap-1.5'}>
                    <span className={eyebrow}>IP address</span>
                    <Input
                        value={ip}
                        placeholder={'Starts with…'}
                        onChange={(event) => {
                            setIp(event.target.value);
                            typed({ ip: event.target.value });
                        }}
                    />
                </label>
                <label className={'pad:flex pad:flex-col pad:gap-1.5'}>
                    <span className={eyebrow}>From</span>
                    <Input type={'date'} value={filters.from} max={filters.to || undefined} onChange={(event) => set({ from: event.target.value })} />
                </label>
                <label className={'pad:flex pad:flex-col pad:gap-1.5'}>
                    <span className={eyebrow}>To</span>
                    <Input type={'date'} value={filters.to} min={filters.from || undefined} onChange={(event) => set({ to: event.target.value })} />
                </label>
            </div>
        </section>
    );
}

/** A user or server picked by searching for it. */
function Lookup({ type, label, placeholder, picked, onPick }: { type: 'user' | 'server'; label: string; placeholder: string; picked: Picked | null; onPick: (picked: Picked | null) => void }) {
    const [search, setSearch] = useState('');
    const found = useQuery({ queryKey: ['prism-audit', 'lookup', type, search], queryFn: () => lookup(type, search), staleTime: 30_000 });
    const options = [...(picked ? [{ id: picked.id, label: picked.label, hint: '' }] : []), ...(found.data ?? []).filter((item) => item.id !== picked?.id)];

    return (
        <div className={'pad:flex pad:flex-col pad:gap-1.5'}>
            <span className={eyebrow + ' pad:flex pad:items-center pad:justify-between'}>
                {label}
                {picked && (
                    <button type={'button'} className={'pad:normal-case pad:tracking-normal pad:text-primary pad:hover:underline'} onClick={() => onPick(null)}>
                        clear
                    </button>
                )}
            </span>
            <Select
                value={picked?.id ?? null}
                placeholder={placeholder}
                searchPlaceholder={type === 'user' ? 'Username or email' : 'Name or short id'}
                emptyMessage={found.isLoading ? 'Looking…' : 'Nothing found'}
                onSearchChange={setSearch}
                options={options.map((item) => ({ value: item.id, textLabel: item.label, label: item.hint ? `${item.label} · ${item.hint}` : item.label }))}
                onChange={(value) => {
                    const item = options.find((option) => option.id === Number(value));
                    if (item) onPick({ id: item.id, label: item.label });
                }}
            />
        </div>
    );
}
