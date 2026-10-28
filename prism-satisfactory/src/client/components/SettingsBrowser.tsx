import { useMemo, useState, type ReactNode } from 'react';
import { Badge, Input, Select, Switch, TitledGreyBox, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { categories, definitionsFor, managedKeys, validate, type SettingDefinition } from '../api/settings';

interface Props {
    /** Which settings apply: satisfactory, or satisfactory-offline when the API cannot be reached. */
    kind: string;
    /** The files the values live in, named in the header. */
    files: string[];
    values: Record<string, string>;
    /** The unsaved values by key; the screen saves them together. */
    draft: Record<string, string>;
    onChange: (key: string, value: string) => void;
    /** Keys the egg sets on start: the startup variable they come from, or null when fixed. */
    eggBindings?: Record<string, string | null>;
    /** Shown above the rows of one category, for notes such as where spread is controlled. */
    notes?: Record<string, ReactNode>;
    /** Secret keys and whether one is saved; a key left out is not known. The value itself never reaches the browser. */
    secrets?: Record<string, boolean>;
}

interface Row {
    definition: SettingDefinition;
    value: string;
    present: boolean;
}

/**
 * Every setting Prism Satisfactory describes, sorted into categories, with its real key next to a
 * short explanation. Changes are kept as a draft until the save bar saves them together. Keys it does not
 * describe are left out and left alone.
 */
export default function SettingsBrowser({ kind, files, values, draft, onChange, eggBindings = {}, notes = {}, secrets = {} }: Props) {
    const [category, setCategory] = useState(() => categories.find((entry) => definitionsFor(kind).some((definition) => definition.category === entry.id))?.id ?? categories[0].id);
    const [search, setSearch] = useState('');

    const rows = useMemo<Row[]>(() => {
        return definitionsFor(kind).map((definition) => ({
            definition,
            value: values[definition.key] ?? String(definition.default),
            present: definition.key in values,
        }));
    }, [kind, values]);

    const term = search.trim().toLowerCase();
    const matches = (row: Row) =>
        term === '' ||
        row.definition.key.toLowerCase().includes(term) ||
        row.definition.label.toLowerCase().includes(term) ||
        row.definition.description.toLowerCase().includes(term);

    const counts = Object.fromEntries(categories.map((entry) => [entry.id, rows.filter((row) => row.definition.category === entry.id && matches(row)).length]));
    const visible = rows.filter((row) => (term !== '' || row.definition.category === category) && matches(row));
    const current = categories.find((entry) => entry.id === category);

    return (
        <div className={'sfy:flex sfy:flex-col sfy:gap-3'}>
            <div className={'sfy:flex sfy:flex-wrap sfy:items-center sfy:justify-between sfy:gap-3'}>
                <p className={'sfy:text-sm sfy:text-muted-foreground'}>
                    {rows.length} settings in {files.join(' and ')}. Changes are saved together when you press Save, and take effect after the next restart.
                </p>
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={'Find a setting or key…'} className={'sfy:max-w-72'} />
            </div>
            <div className={'sfy:grid sfy:gap-4 sfy:md:grid-cols-[220px_1fr]'}>
                <nav className={'sfy:flex sfy:md:flex-col sfy:gap-1 sfy:overflow-x-auto'} aria-label={'Categories'}>
                    {categories
                        .filter((entry) => rows.some((row) => row.definition.category === entry.id))
                        .map((entry) => (
                            <button
                                key={entry.id}
                                type={'button'}
                                onClick={() => {
                                    setCategory(entry.id);
                                    setSearch('');
                                }}
                                className={cn(
                                    'sfy:flex sfy:items-center sfy:gap-2 sfy:rounded-md sfy:px-3 sfy:py-2 sfy:text-sm sfy:text-left sfy:whitespace-nowrap sfy:cursor-pointer',
                                    entry.id === category && term === '' ? 'sfy:bg-primary sfy:text-primary-foreground' : 'sfy:hover:bg-muted sfy:text-foreground'
                                )}
                            >
                                <NamedIcon name={entry.icon} size={16} />
                                <span className={'sfy:flex-1'}>{entry.label}</span>
                                <span className={'sfy:text-xs sfy:opacity-70'}>{counts[entry.id]}</span>
                            </button>
                        ))}
                </nav>
                {(
                    <TitledGreyBox title={term !== '' ? `Results for “${search.trim()}”` : current?.label ?? ''}>
                        {term === '' && notes[category] && <div className={'sfy:mb-3'}>{notes[category]}</div>}
                        {visible.length === 0 ? (
                            <p className={'sfy:text-sm sfy:text-muted-foreground'}>No settings match.</p>
                        ) : (
                            <div className={'sfy:divide-y sfy:divide-border'}>
                                {visible.map((row) => (
                                    <SettingRow
                                        key={`${row.definition.key}-${row.definition.category}`}
                                        row={row}
                                        binding={row.definition.key in eggBindings ? eggBindings[row.definition.key] : undefined}
                                        value={draft[row.definition.key] ?? row.value}
                                        changed={row.definition.key in draft}
                                        saved={secrets[row.definition.key]}
                                        onChange={(value) => onChange(row.definition.key, value)}
                                    />
                                ))}
                            </div>
                        )}
                    </TitledGreyBox>
                )}
            </div>
        </div>
    );
}

function SettingRow({
    row,
    value: draft,
    changed,
    onChange,
    binding,
    saved,
}: {
    row: Row;
    value: string;
    changed: boolean;
    /** For a secret: whether one is saved, or undefined when that is not known. */
    saved: boolean | undefined;
    onChange: (value: string) => void;
    /** undefined: the egg leaves it alone; null: fixed by the egg; string: from that startup variable. */
    binding: string | null | undefined;
}) {
    const { definition } = row;
    const error = changed ? validate(definition, draft) : null;
    const managed = managedKeys.includes(definition.key) || binding === null;

    const control = () => {
        if (managed) {
            return <span className={'sfy:font-mono sfy:text-sm'}>{row.value}</span>;
        }

        switch (definition.type) {
            case 'bool':
                return (
                    <Switch
                        checked={draft === 'true'}
                        aria-label={definition.label}
                        onChange={(checked) => onChange(checked ? 'true' : 'false')}
                    />
                );
            case 'enum':
                return (
                    <div className={'sfy:w-56'}>
                        <Select
                            value={draft}
                            onChange={(value) => onChange(String(value))}
                            options={(definition.options ?? []).map((option) => ({ value: option, label: definition.optionLabels?.[option] ?? option }))}
                        />
                    </div>
                );
            case 'secret':
                return (
                    <Input
                        type={'password'}
                        value={draft}
                        aria-label={definition.label}
                        autoComplete={'off'}
                        placeholder={saved === undefined ? 'Type a new one to change it' : saved ? 'Saved: type to replace' : 'Not set'}
                        className={'sfy:w-64'}
                        onChange={(event) => onChange(event.target.value)}
                    />
                );
            default:
                return (
                    <Input
                        value={draft}
                        aria-label={definition.label}
                        inputMode={definition.type === 'int' ? 'numeric' : undefined}
                        $hasError={error !== null}
                        className={definition.type === 'int' ? 'sfy:w-36' : 'sfy:w-64'}
                        onChange={(event) => onChange(event.target.value)}
                    />
                );
        }
    };

    return (
        <div className={'sfy:flex sfy:flex-wrap sfy:items-center sfy:justify-between sfy:gap-3 sfy:py-3'}>
            <div className={'sfy:min-w-0 sfy:flex-1 sfy:basis-64'}>
                <div className={'sfy:flex sfy:flex-wrap sfy:items-center sfy:gap-2'}>
                    <span className={'sfy:text-sm sfy:font-medium sfy:uppercase sfy:tracking-wide'}>{definition.label}</span>
                    <Badge size={'sm'} variant={'soft'} className={'sfy:font-mono sfy:normal-case'}>
                        {definition.key}
                    </Badge>
                    {changed && <span className={'sfy:size-2 sfy:rounded-full sfy:bg-warning'} title={'Unsaved'} />}
                </div>
                <p className={'sfy:text-xs sfy:text-muted-foreground sfy:mt-1'}>{managedKeys.includes(definition.key)
                        ? 'Set by the panel: the allocation, or the egg.'
                        : binding === null
                          ? 'The egg sets this itself every time the server starts.'
                          : definition.description}</p>
                {typeof binding === 'string' && (
                    <p className={'sfy:text-xs sfy:text-muted-foreground sfy:mt-1'}>
                        Saved to the <span className={'sfy:font-mono'}>{binding}</span> startup variable, which the egg passes on start.
                    </p>
                )}
                {error && <p className={'sfy:text-xs sfy:text-destructive sfy:mt-1'}>{error}</p>}
            </div>
            <div className={'sfy:shrink-0'}>{control()}</div>
        </div>
    );
}
