import { NamedIcon } from '../../icons';
import { SOURCE_NAMES, type Meta, type SourceName } from '../../api/mods';
import { FilterRow, FilterSection } from '../content/ui';

export interface FilterState {
    /** Empty means both. */
    sources: SourceName[];
    categories: string[];
    sides: string[];
    gameVersion: string | null;
}

export const emptyFilters: FilterState = { sources: [], categories: [], sides: [], gameVersion: null };

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);

const SIDE_LABELS: Record<string, string> = { Server: 'Runs on the server', Client: 'Runs for players' };

/** Provider, game version, side and type filters, laid out like Prism MC's. */
export default function FilterSidebar({ meta, state, configured, onChange }: { meta: Meta; state: FilterState; configured: Record<SourceName, boolean>; onChange: (state: FilterState) => void }) {
    const changed = state.sources.length > 0 || state.categories.length > 0 || state.sides.length > 0 || state.gameVersion !== null;

    return (
        <div className={'cks:flex cks:flex-col cks:gap-3'}>
            {changed && (
                <button
                    type={'button'}
                    onClick={() => onChange(emptyFilters)}
                    className={'cks:flex cks:items-center cks:justify-center cks:gap-2 cks:rounded-lg cks:border cks:border-border cks:bg-card cks:py-2 cks:text-sm cks:cursor-pointer cks:hover:bg-muted'}
                >
                    <NamedIcon name={'x'} size={14} /> Reset filters
                </button>
            )}

            <FilterSection title={'Provider'}>
                {(['modio', 'steam'] as const).map((source) => (
                    <FilterRow
                        key={source}
                        label={configured[source] ? SOURCE_NAMES[source] : `${SOURCE_NAMES[source]} (not set up)`}
                        on={state.sources.length === 0 ? configured[source] : state.sources.includes(source)}
                        onToggle={() => {
                            // Both on is the same as none chosen.
                            const current: SourceName[] = state.sources.length === 0 ? (['modio', 'steam'] as SourceName[]).filter((name) => configured[name]) : state.sources;
                            const next = toggle(current, source);
                            onChange({ ...state, sources: next.length === 2 ? [] : next });
                        }}
                    />
                ))}
            </FilterSection>

            {meta.gameVersions.length > 0 && (
                <FilterSection title={'Game version'}>
                    <div className={'cks:max-h-56 cks:overflow-y-auto cks:pr-1'}>
                        {meta.gameVersions.map((version) => (
                            <FilterRow key={version} label={version} on={state.gameVersion === version} onToggle={() => onChange({ ...state, gameVersion: state.gameVersion === version ? null : version })} />
                        ))}
                    </div>
                </FilterSection>
            )}

            <FilterSection title={'Runs on'}>
                {meta.sides.map((side) => (
                    <FilterRow key={side} label={SIDE_LABELS[side] ?? side} on={state.sides.includes(side)} onToggle={() => onChange({ ...state, sides: toggle(state.sides, side) })} />
                ))}
            </FilterSection>

            <FilterSection title={'Type'}>
                {meta.categories.map((category) => (
                    <FilterRow key={category} label={category} on={state.categories.includes(category)} onToggle={() => onChange({ ...state, categories: toggle(state.categories, category) })} />
                ))}
            </FilterSection>
        </div>
    );
}
