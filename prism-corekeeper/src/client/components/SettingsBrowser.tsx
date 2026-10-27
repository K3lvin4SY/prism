import { useMemo, useState, type ReactNode } from 'react';
import { Badge, Input, Select, Switch, TitledGreyBox, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { categories, definitionsFor, managedKeys, validate, type SettingDefinition } from '../api/settings';

interface Props {
    /** Which settings apply: corekeeper. */
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
}

interface Row {
    definition: SettingDefinition;
    value: string;
    present: boolean;
}

/**
 * Every setting Prism Core Keeper describes, sorted into categories, with its real key next to a
 * short explanation. Changes are kept as a draft until the save bar saves them together. Keys it does not
 * describe are left out and left alone.
 */
export default function SettingsBrowser({ kind, files, values, draft, onChange, eggBindings = {}, notes = {} }: Props) {
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
        <div className={'cks:flex cks:flex-col cks:gap-3'}>
            <div className={'cks:flex cks:flex-wrap cks:items-center cks:justify-between cks:gap-3'}>
                <p className={'cks:text-sm cks:text-muted-foreground'}>
                    {rows.length} settings in {files.join(' and ')}. Changes are saved together when you press Save, and take effect after the next restart.
                </p>
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={'Find a setting or key…'} className={'cks:max-w-72'} />
            </div>
            <div className={'cks:grid cks:gap-4 cks:md:grid-cols-[220px_1fr]'}>
                <nav className={'cks:flex cks:md:flex-col cks:gap-1 cks:overflow-x-auto'} aria-label={'Categories'}>
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
                                    'cks:flex cks:items-center cks:gap-2 cks:rounded-md cks:px-3 cks:py-2 cks:text-sm cks:text-left cks:whitespace-nowrap cks:cursor-pointer',
                                    entry.id === category && term === '' ? 'cks:bg-primary cks:text-primary-foreground' : 'cks:hover:bg-muted cks:text-foreground'
                                )}
                            >
                                <NamedIcon name={entry.icon} size={16} />
                                <span className={'cks:flex-1'}>{entry.label}</span>
                                <span className={'cks:text-xs cks:opacity-70'}>{counts[entry.id]}</span>
                            </button>
                        ))}
                </nav>
                {(
                    <TitledGreyBox title={term !== '' ? `Results for “${search.trim()}”` : current?.label ?? ''}>
                        {term === '' && notes[category] && <div className={'cks:mb-3'}>{notes[category]}</div>}
                        {visible.length === 0 ? (
                            <p className={'cks:text-sm cks:text-muted-foreground'}>No settings match.</p>
                        ) : (
                            <div className={'cks:divide-y cks:divide-border'}>
                                {visible.map((row) => (
                                    <SettingRow
                                        key={`${row.definition.key}-${row.definition.category}`}
                                        row={row}
                                        binding={row.definition.key in eggBindings ? eggBindings[row.definition.key] : undefined}
                                        value={draft[row.definition.key] ?? row.value}
                                        changed={row.definition.key in draft}
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
}: {
    row: Row;
    value: string;
    changed: boolean;
    onChange: (value: string) => void;
    /** undefined: the egg leaves it alone; null: fixed by the egg; string: from that startup variable. */
    binding: string | null | undefined;
}) {
    const { definition } = row;
    const error = changed ? validate(definition, draft) : null;
    const managed = managedKeys.includes(definition.key) || binding === null;

    const control = () => {
        if (managed) {
            return <span className={'cks:font-mono cks:text-sm'}>{row.value}</span>;
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
                    <div className={'cks:w-56'}>
                        <Select
                            value={draft}
                            onChange={(value) => onChange(String(value))}
                            options={(definition.options ?? []).map((option) => ({ value: option, label: definition.optionLabels?.[option] ?? option }))}
                        />
                    </div>
                );
            default:
                return (
                    <Input
                        value={draft}
                        aria-label={definition.label}
                        inputMode={definition.type === 'int' ? 'numeric' : undefined}
                        $hasError={error !== null}
                        className={definition.type === 'int' ? 'cks:w-36' : 'cks:w-64'}
                        onChange={(event) => onChange(event.target.value)}
                    />
                );
        }
    };

    return (
        <div className={'cks:flex cks:flex-wrap cks:items-center cks:justify-between cks:gap-3 cks:py-3'}>
            <div className={'cks:min-w-0 cks:flex-1 cks:basis-64'}>
                <div className={'cks:flex cks:flex-wrap cks:items-center cks:gap-2'}>
                    <span className={'cks:text-sm cks:font-medium cks:uppercase cks:tracking-wide'}>{definition.label}</span>
                    <Badge size={'sm'} variant={'soft'} className={'cks:font-mono cks:normal-case'}>
                        {definition.key}
                    </Badge>
                    {changed && <span className={'cks:size-2 cks:rounded-full cks:bg-warning'} title={'Unsaved'} />}
                </div>
                <p className={'cks:text-xs cks:text-muted-foreground cks:mt-1'}>{managedKeys.includes(definition.key)
                        ? 'Set by the panel: the allocation, or the egg.'
                        : binding === null
                          ? 'The egg sets this itself every time the server starts.'
                          : definition.description}</p>
                {typeof binding === 'string' && (
                    <p className={'cks:text-xs cks:text-muted-foreground cks:mt-1'}>
                        Saved to the <span className={'cks:font-mono'}>{binding}</span> startup variable, which the egg passes on start.
                    </p>
                )}
                {error && <p className={'cks:text-xs cks:text-destructive cks:mt-1'}>{error}</p>}
            </div>
            <div className={'cks:shrink-0'}>{control()}</div>
        </div>
    );
}
