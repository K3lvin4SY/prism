import { NamedIcon } from '../../icons';
import type { Meta } from '../../api/mods';
import { FilterRow, FilterSection } from '../content/ui';

export interface FilterState {
    categories: string[];
}

export const emptyFilters: FilterState = { categories: [] };

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);

/** The mod portal's categories, laid out like Prism MC's filters. */
export default function FilterSidebar({ meta, state, onChange }: { meta: Meta; state: FilterState; onChange: (state: FilterState) => void }) {
    return (
        <div className={'fct:flex fct:flex-col fct:gap-3'}>
            {state.categories.length > 0 && (
                <button
                    type={'button'}
                    onClick={() => onChange(emptyFilters)}
                    className={'fct:flex fct:items-center fct:justify-center fct:gap-2 fct:rounded-lg fct:border fct:border-border fct:bg-card fct:py-2 fct:text-sm fct:cursor-pointer fct:hover:bg-muted'}
                >
                    <NamedIcon name={'x'} size={14} /> Reset filters
                </button>
            )}

            {meta.factorioVersion && (
                <FilterSection title={'Game version'}>
                    <p className={'fct:px-1 fct:text-sm fct:text-muted-foreground'}>Mods with a release for Factorio {meta.factorioVersion}, the version this server runs.</p>
                </FilterSection>
            )}

            <FilterSection title={'Category'}>
                {Object.entries(meta.categories).map(([id, label]) => (
                    <FilterRow key={id} label={label} on={state.categories.includes(id)} onToggle={() => onChange({ ...state, categories: toggle(state.categories, id) })} />
                ))}
            </FilterSection>
        </div>
    );
}
