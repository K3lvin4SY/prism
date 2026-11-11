import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Input, NumberInput, Spinner, http } from '@pterodactyl/sdk';
import { NamedIcon } from './icons';

type Api = 'client' | 'application' | 'admin';
type Limits = Record<Api, number | null>;

interface Person {
    id: number;
    username: string;
    email: string;
    root_admin: boolean;
}

const APIS: { key: Api; label: string }[] = [
    { key: 'client', label: 'Panel' },
    { key: 'application', label: 'Application API' },
    { key: 'admin', label: 'Admin API' },
];

const URL_BASE = '/api/admin/extensions/prism-tweaks/users';
const EMPTY: Limits = { client: null, application: null, admin: null };

function parse(value: unknown): Record<string, Limits> {
    if (typeof value !== 'string') return {};
    try {
        const data = JSON.parse(value) as unknown;

        return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, Limits>) : {};
    } catch {
        return {};
    }
}

const users = async (params: Record<string, string>) => (await http.get<{ data: Person[] }>(URL_BASE, { params })).data.data;

/**
 * Prism Tweaks' people with their own API limits: a row per person with a number for each API,
 * and a search to add someone. The same numbers show on each user's admin page.
 */
export function UserLimitsEditor({ value, onChange }: { value: unknown; onChange: (value: string) => void }) {
    const list = parse(value);
    const ids = Object.keys(list).sort((a, b) => Number(a) - Number(b));
    const [search, setSearch] = useState('');

    const known = useQuery({ queryKey: ['prism-core', 'tweaks-users', ids.join(',')], queryFn: () => users({ ids: ids.join(',') }), enabled: ids.length > 0 });
    const found = useQuery({ queryKey: ['prism-core', 'tweaks-search', search.trim()], queryFn: () => users({ search: search.trim() }), enabled: search.trim().length > 0 });
    const people = new Map((known.data ?? []).map((person) => [String(person.id), person]));

    const update = (next: Record<string, Limits>) => onChange(JSON.stringify(next));
    const setLimit = (id: string, api: Api, limit: number | null) => update({ ...list, [id]: { ...EMPTY, ...list[id], [api]: limit } });
    const remove = (id: string) => update(Object.fromEntries(Object.entries(list).filter(([key]) => key !== id)));
    const add = (person: Person) => {
        people.set(String(person.id), person);
        update({ ...list, [person.id]: list[person.id] ?? { ...EMPTY, client: 600 } });
        setSearch('');
    };

    return (
        <div className={'ppx:flex ppx:flex-col ppx:gap-2'}>
            {ids.length === 0 && <p className={'ppx:text-sm ppx:text-muted-foreground'}>Nobody has their own limits yet. Everyone gets the numbers above.</p>}
            {ids.map((id) => {
                const person = people.get(id);

                return (
                    <div key={id} className={'pt-surface ppx:flex ppx:flex-wrap ppx:items-end ppx:gap-3 ppx:rounded-md ppx:border ppx:border-border ppx:bg-background/40 ppx:p-2'}>
                        <div className={'ppx:min-w-40 ppx:flex-1'}>
                            <p className={'ppx:flex ppx:items-center ppx:gap-2 ppx:text-sm ppx:font-medium'}>
                                {person?.username ?? (known.isLoading ? 'Loading…' : `User #${id}`)}
                                {person?.root_admin && <Badge>Admin</Badge>}
                            </p>
                            <p className={'ppx:text-xs ppx:text-muted-foreground'}>{person?.email ?? (known.isLoading ? '' : 'Deleted user: remove them from the list.')}</p>
                        </div>
                        {APIS.map((api) => (
                            <label key={api.key} className={'ppx:flex ppx:flex-col ppx:gap-1 ppx:text-xs ppx:text-muted-foreground'}>
                                {api.label}
                                <NumberInput
                                    value={list[id]?.[api.key] ?? null}
                                    min={30}
                                    max={100000}
                                    onValueChange={(next) => setLimit(id, api.key, typeof next === 'number' && next > 0 ? Math.round(next) : null)}
                                    placeholder={'Everyone’s'}
                                    className={'ppx:w-32'}
                                />
                            </label>
                        ))}
                        <Button.Text size={'small'} onClick={() => remove(id)} aria-label={'Remove from the list'}>
                            <NamedIcon name={'x'} size={14} />
                        </Button.Text>
                    </div>
                );
            })}
            <div className={'ppx:relative ppx:max-w-md'}>
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={'Add someone: search by username or email'} className={'ppx:w-full'} />
                {search.trim() !== '' && (
                    <div className={'pt-surface pt-overlay ppx:absolute ppx:z-20 ppx:mt-1 ppx:max-h-64 ppx:w-full ppx:overflow-y-auto ppx:rounded-md ppx:border ppx:border-border ppx:bg-card ppx:shadow-lg'}>
                        {found.isLoading ? (
                            <Spinner size={'small'} centered />
                        ) : (found.data ?? []).length === 0 ? (
                            <p className={'ppx:px-3 ppx:py-2 ppx:text-sm ppx:text-muted-foreground'}>Nobody matches.</p>
                        ) : (
                            (found.data ?? []).map((person) => (
                                <button key={person.id} type={'button'} onClick={() => add(person)} className={'ppx:flex ppx:w-full ppx:cursor-pointer ppx:items-center ppx:gap-2 ppx:px-3 ppx:py-2 ppx:text-left ppx:text-sm ppx:hover:bg-muted/50'}>
                                    <NamedIcon name={'plus'} size={14} />
                                    <span className={'ppx:font-medium'}>{person.username}</span>
                                    <span className={'ppx:truncate ppx:text-xs ppx:text-muted-foreground'}>{person.email}</span>
                                    {list[person.id] && <span className={'ppx:ml-auto ppx:text-xs ppx:text-muted-foreground'}>On the list</span>}
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
