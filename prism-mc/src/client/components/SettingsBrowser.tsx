import { useMemo, useState, type ReactNode } from 'react';
import { Badge, Input, NamedIcon, Select, Switch, TitledGreyBox, cn } from '@pterodactyl/sdk';
import { categories, definitionsFor, managedKeys, validate, type PropertyDefinition } from '../api/properties';
import McText from './McText';

interface Props {
    /** The schema edition: java, bedrock, or pumpkin for Pumpkin's own key set. */
    edition: string;
    /** The file the values live in, named in the header. */
    file?: string;
    values: Record<string, string>;
    /** The unsaved values by key; the screen saves them together. */
    draft: Record<string, string>;
    onChange: (key: string, value: string) => void;
    /** The MOTD editor, shown in place of the rows while the MOTD category is open. */
    motdEditor?: ReactNode;
    /** Other categories drawn by a component instead of rows, such as Crossplay. */
    panels?: Record<string, ReactNode>;
    /** Keys the egg rewrites on start: the startup variable they come from, or null when fixed. */
    eggBindings?: Record<string, string | null>;
}

interface Row {
    definition: PropertyDefinition;
    value: string;
    present: boolean;
}

const otherDefinition = (key: string): PropertyDefinition => ({
    key,
    editions: [],
    category: 'other',
    type: 'string',
    label: key,
    description: 'Not described by Prism MC. Saved exactly as typed.',
    default: '',
    maxLength: 1024,
});

/**
 * Every property, sorted into categories, with its real key next to a short explanation.
 * Changes are kept as a draft until the screen's save bar saves them together.
 */
/** Categories that hold a tool instead of properties, shown only when that tool is passed in. */
const PANEL_ONLY = ['crossplay', 'proxy'];

export default function SettingsBrowser({ edition, file = 'server.properties', values, draft, onChange, motdEditor, panels = {}, eggBindings = {} }: Props) {
    const [category, setCategory] = useState('motd');
    const [search, setSearch] = useState('');

    const rows = useMemo<Row[]>(() => {
        const known = definitionsFor(edition);
        const keys = new Set(known.map((definition) => definition.key));
        const result: Row[] = known.map((definition) => ({
            definition,
            value: values[definition.key] ?? String(definition.default),
            present: definition.key in values,
        }));

        for (const [key, value] of Object.entries(values)) {
            if (!keys.has(key)) {
                result.push({ definition: otherDefinition(key), value, present: true });
            }
        }

        return result;
    }, [edition, values]);

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
        <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
            <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:justify-between mcs:gap-3'}>
                <p className={'mcs:text-sm mcs:text-muted-foreground'}>
                    {Object.keys(values).length} values in {file}. {term === '' && category === 'motd' && motdEditor ? 'The MOTD is saved as you type and shows after the next restart.' : 'Changes are saved together when you press Save, and take effect after the next restart.'}
                </p>
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={'Find a setting or key…'} className={'mcs:max-w-72'} />
            </div>
            <div className={'mcs:grid mcs:gap-4 mcs:md:grid-cols-[220px_1fr]'}>
                <nav className={'mcs:flex mcs:md:flex-col mcs:gap-1 mcs:overflow-x-auto'} aria-label={'Categories'}>
                    {categories
                        .filter((entry) => (PANEL_ONLY.includes(entry.id) ? entry.id in panels : entry.id !== 'other' || counts.other > 0))
                        .map((entry) => (
                            <button
                                key={entry.id}
                                type={'button'}
                                onClick={() => {
                                    setCategory(entry.id);
                                    setSearch('');
                                }}
                                className={cn(
                                    'mcs:flex mcs:items-center mcs:gap-2 mcs:rounded-md mcs:px-3 mcs:py-2 mcs:text-sm mcs:text-left mcs:whitespace-nowrap mcs:cursor-pointer',
                                    entry.id === category && term === '' ? 'mcs:bg-primary mcs:text-primary-foreground' : 'mcs:hover:bg-muted mcs:text-foreground'
                                )}
                            >
                                <NamedIcon name={entry.icon} size={16} />
                                <span className={'mcs:flex-1'}>{entry.label}</span>
                                {!(entry.id in panels) && !(entry.id === 'motd' && motdEditor) && <span className={'mcs:text-xs mcs:opacity-70'}>{counts[entry.id]}</span>}
                            </button>
                        ))}
                </nav>
                {term === '' && category === 'motd' && motdEditor ? (
                    <div className={'mcs:min-w-0'}>{motdEditor}</div>
                ) : term === '' && panels[category] ? (
                    <div className={'mcs:min-w-0'}>{panels[category]}</div>
                ) : (
                    <TitledGreyBox title={term !== '' ? `Results for “${search.trim()}”` : current?.label ?? ''}>
                        {visible.length === 0 ? (
                            <p className={'mcs:text-sm mcs:text-muted-foreground'}>No settings match.</p>
                        ) : (
                            <div className={'mcs:divide-y mcs:divide-border'}>
                                {visible.map((row) => (
                                    <SettingRow
                                        key={`${row.definition.key}-${row.definition.category}`}
                                        row={row}
                                        binding={row.definition.key in eggBindings ? eggBindings[row.definition.key] : undefined}
                                        value={draft[row.definition.key] ?? row.value}
                                        changed={row.definition.key in draft}
                                        onChange={(value) => onChange(row.definition.key, value)}
                                        onEditMotd={() => {
                                            setSearch('');
                                            setCategory('motd');
                                        }}
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
    onEditMotd,
    binding,
}: {
    row: Row;
    value: string;
    changed: boolean;
    onChange: (value: string) => void;
    onEditMotd: () => void;
    /** undefined: the egg leaves it alone; null: fixed by the egg; string: from that startup variable. */
    binding: string | null | undefined;
}) {
    const { definition } = row;
    const error = changed ? validate(definition, draft) : null;
    const managed = managedKeys.includes(definition.key) || binding === null;

    const control = () => {
        if (managed) {
            return <span className={'mcs:font-mono mcs:text-sm'}>{row.value}</span>;
        }

        switch (definition.type) {
            case 'motd':
                return (
                    <button type={'button'} onClick={onEditMotd} className={'mcs-font mcs:text-sm mcs:bg-sunken mcs:rounded mcs:px-2 mcs:py-1 mcs:text-left mcs:cursor-pointer'}>
                        {draft.split('\n').map((line, index) => (
                            <McText key={index} text={line} className={'mcs:block'} />
                        ))}
                    </button>
                );
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
                    <div className={'mcs:w-56'}>
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
                        className={definition.type === 'int' ? 'mcs:w-36' : 'mcs:w-64'}
                        onChange={(event) => onChange(event.target.value)}
                    />
                );
        }
    };

    return (
        <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:justify-between mcs:gap-3 mcs:py-3'}>
            <div className={'mcs:min-w-0 mcs:flex-1 mcs:basis-64'}>
                <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-2'}>
                    <span className={'mcs:text-sm mcs:font-medium mcs:uppercase mcs:tracking-wide'}>{definition.label}</span>
                    <Badge size={'sm'} variant={'soft'} className={'mcs:font-mono mcs:normal-case'}>
                        {definition.key}
                    </Badge>
                    {changed && <span className={'mcs:size-2 mcs:rounded-full mcs:bg-warning'} title={'Unsaved'} />}
                </div>
                <p className={'mcs:text-xs mcs:text-muted-foreground mcs:mt-1'}>{managedKeys.includes(definition.key)
                        ? 'Set by the allocation in the Network tab.'
                        : binding === null
                          ? 'The egg sets this itself every time the server starts.'
                          : definition.description}</p>
                {typeof binding === 'string' && (
                    <p className={'mcs:text-xs mcs:text-muted-foreground mcs:mt-1'}>
                        Also saved to the <span className={'mcs:font-mono'}>{binding}</span> startup variable, which the egg applies on start.
                    </p>
                )}
                {error && <p className={'mcs:text-xs mcs:text-destructive mcs:mt-1'}>{error}</p>}
            </div>
            <div className={'mcs:shrink-0'}>{control()}</div>
        </div>
    );
}
