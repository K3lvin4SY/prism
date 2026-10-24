import { useMemo, useState, type ReactNode } from 'react';
import { Badge, Input, NamedIcon, Select, Switch, TitledGreyBox, cn } from '@pterodactyl/sdk';
import { categories, definitionsFor, managedKeys, validate, type SettingDefinition } from '../api/settings';

interface Props {
    /** vanilla, tshock or tmodloader: which settings apply. */
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
 * Every setting Prism Terraria describes, sorted into categories, with its real key next to a
 * short explanation. Changes are kept as a draft until the save bar saves them together. Keys it does not
 * describe, such as TShock's database passwords, are left out and left alone.
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
        <div className={'trs:flex trs:flex-col trs:gap-3'}>
            <div className={'trs:flex trs:flex-wrap trs:items-center trs:justify-between trs:gap-3'}>
                <p className={'trs:text-sm trs:text-muted-foreground'}>
                    {rows.length} settings in {files.join(' and ')}. Changes are saved together when you press Save, and take effect after the next restart.
                </p>
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={'Find a setting or key…'} className={'trs:max-w-72'} />
            </div>
            <div className={'trs:grid trs:gap-4 trs:md:grid-cols-[220px_1fr]'}>
                <nav className={'trs:flex trs:md:flex-col trs:gap-1 trs:overflow-x-auto'} aria-label={'Categories'}>
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
                                    'trs:flex trs:items-center trs:gap-2 trs:rounded-md trs:px-3 trs:py-2 trs:text-sm trs:text-left trs:whitespace-nowrap trs:cursor-pointer',
                                    entry.id === category && term === '' ? 'trs:bg-primary trs:text-primary-foreground' : 'trs:hover:bg-muted trs:text-foreground'
                                )}
                            >
                                <NamedIcon name={entry.icon} size={16} />
                                <span className={'trs:flex-1'}>{entry.label}</span>
                                <span className={'trs:text-xs trs:opacity-70'}>{counts[entry.id]}</span>
                            </button>
                        ))}
                </nav>
                {(
                    <TitledGreyBox title={term !== '' ? `Results for “${search.trim()}”` : current?.label ?? ''}>
                        {term === '' && notes[category] && <div className={'trs:mb-3'}>{notes[category]}</div>}
                        {visible.length === 0 ? (
                            <p className={'trs:text-sm trs:text-muted-foreground'}>No settings match.</p>
                        ) : (
                            <div className={'trs:divide-y trs:divide-border'}>
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
            return <span className={'trs:font-mono trs:text-sm'}>{row.value}</span>;
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
                    <div className={'trs:w-56'}>
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
                        className={definition.type === 'int' ? 'trs:w-36' : 'trs:w-64'}
                        onChange={(event) => onChange(event.target.value)}
                    />
                );
        }
    };

    return (
        <div className={'trs:flex trs:flex-wrap trs:items-center trs:justify-between trs:gap-3 trs:py-3'}>
            <div className={'trs:min-w-0 trs:flex-1 trs:basis-64'}>
                <div className={'trs:flex trs:flex-wrap trs:items-center trs:gap-2'}>
                    <span className={'trs:text-sm trs:font-medium trs:uppercase trs:tracking-wide'}>{definition.label}</span>
                    <Badge size={'sm'} variant={'soft'} className={'trs:font-mono trs:normal-case'}>
                        {definition.key}
                    </Badge>
                    {changed && <span className={'trs:size-2 trs:rounded-full trs:bg-warning'} title={'Unsaved'} />}
                </div>
                <p className={'trs:text-xs trs:text-muted-foreground trs:mt-1'}>{managedKeys.includes(definition.key)
                        ? 'Set by the panel: the allocation, or the egg.'
                        : binding === null
                          ? 'The egg sets this itself every time the server starts.'
                          : definition.description}</p>
                {typeof binding === 'string' && (
                    <p className={'trs:text-xs trs:text-muted-foreground trs:mt-1'}>
                        Also saved to the <span className={'trs:font-mono'}>{binding}</span> startup variable, which the egg applies on start.
                    </p>
                )}
                {error && <p className={'trs:text-xs trs:text-destructive trs:mt-1'}>{error}</p>}
            </div>
            <div className={'trs:shrink-0'}>{control()}</div>
        </div>
    );
}
