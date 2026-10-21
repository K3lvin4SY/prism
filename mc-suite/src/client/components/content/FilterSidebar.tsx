import { useMemo, useState } from 'react';
import { Checkbox, Input, NamedIcon } from '@pterodactyl/sdk';
import type { Filters } from '../../api/content';
import { FilterRow, FilterSection, LOADER_COLORS, TagIcon, tagLabel } from './tags';

export interface FilterState {
    categories: string[];
    exclude: string[];
    /** null means the server's own loaders. */
    loaders: string[] | null;
    /** null means the server's own Minecraft version. */
    gameVersions: string[] | null;
}

export const emptyFilters: FilterState = { categories: [], exclude: [], loaders: null, gameVersions: null };

const LOADERS_SHOWN = 3;

interface Props {
    filters: Filters;
    state: FilterState;
    onChange: (state: FilterState) => void;
}

const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);

/** Game version, loader and category filters, laid out like Modrinth's discover sidebar. */
export default function FilterSidebar({ filters, state, onChange }: Props) {
    const [versionSearch, setVersionSearch] = useState('');
    const [allVersions, setAllVersions] = useState(false);
    const [moreLoaders, setMoreLoaders] = useState(false);

    const versions = state.gameVersions ?? (filters.serverVersion ? [filters.serverVersion] : []);
    const loaders = state.loaders ?? filters.serverLoaders;

    const versionList = useMemo(() => {
        const term = versionSearch.trim();

        const matching = filters.gameVersions.filter(
            (entry) => (allVersions || entry.type === 'release' || versions.includes(entry.version)) && (term === '' || entry.version.includes(term))
        );

        // Selected versions are pinned to the top so they stay in view.
        return [...matching.filter((entry) => versions.includes(entry.version)), ...matching.filter((entry) => !versions.includes(entry.version))];
    }, [filters.gameVersions, versionSearch, allVersions, versions]);

    const shownLoaders = moreLoaders
        ? filters.loaders
        : filters.loaders.filter((loader, index) => index < LOADERS_SHOWN || loaders.includes(loader.name));

    const changed = state.categories.length > 0 || state.exclude.length > 0 || state.loaders !== null || state.gameVersions !== null;

    return (
        <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
            {changed && (
                <button
                    type={'button'}
                    onClick={() => onChange(emptyFilters)}
                    className={'mcs:flex mcs:items-center mcs:justify-center mcs:gap-2 mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:py-2 mcs:text-sm mcs:cursor-pointer mcs:hover:bg-muted'}
                >
                    <NamedIcon name={'x'} size={14} /> Reset filters
                </button>
            )}

            <FilterSection title={'Game version'}>
                <div className={'mcs:flex mcs:flex-col mcs:gap-2'}>
                    <Input value={versionSearch} onChange={(event) => setVersionSearch(event.target.value)} placeholder={'Search…'} />
                    <div className={'mcs:max-h-56 mcs:overflow-y-auto mcs:pr-1'}>
                        {versionList.map((entry) => (
                            <FilterRow
                                key={entry.version}
                                label={entry.version === filters.serverVersion ? `${entry.version} (this server)` : entry.version}
                                state={versions.includes(entry.version) ? 'on' : 'off'}
                                onToggle={() => onChange({ ...state, gameVersions: toggle(versions, entry.version) })}
                            />
                        ))}
                        {versionList.length === 0 && <p className={'mcs:px-2 mcs:py-1 mcs:text-xs mcs:text-muted-foreground'}>No versions match.</p>}
                    </div>
                    <label className={'mcs:flex mcs:items-center mcs:gap-2 mcs:px-2 mcs:text-sm'}>
                        <Checkbox checked={allVersions} onChange={setAllVersions} /> Show all versions
                    </label>
                </div>
            </FilterSection>

            <FilterSection title={'Loader'}>
                {shownLoaders.map((loader) => (
                    <FilterRow
                        key={loader.name}
                        label={tagLabel(loader.name)}
                        icon={<TagIcon icon={loader.icon} />}
                        color={LOADER_COLORS[loader.name]}
                        state={loaders.includes(loader.name) ? 'on' : 'off'}
                        onToggle={() => onChange({ ...state, loaders: toggle(loaders, loader.name) })}
                    />
                ))}
                {filters.loaders.length > LOADERS_SHOWN && (
                    <button
                        type={'button'}
                        onClick={() => setMoreLoaders(!moreLoaders)}
                        className={'mcs:flex mcs:items-center mcs:gap-2 mcs:px-2 mcs:py-1 mcs:text-sm mcs:text-muted-foreground mcs:cursor-pointer mcs:hover:text-foreground'}
                    >
                        <NamedIcon name={moreLoaders ? 'chevron-up' : 'chevron-down'} size={14} /> {moreLoaders ? 'Show less' : 'Show more'}
                    </button>
                )}
            </FilterSection>

            <FilterSection title={'Category'}>
                {filters.categories.map((category) => (
                    <FilterRow
                        key={category.name}
                        label={tagLabel(category.name)}
                        icon={<TagIcon icon={category.icon} />}
                        state={state.categories.includes(category.name) ? 'on' : state.exclude.includes(category.name) ? 'excluded' : 'off'}
                        onToggle={() =>
                            onChange({
                                ...state,
                                categories: toggle(state.categories, category.name),
                                exclude: state.exclude.filter((name) => name !== category.name),
                            })
                        }
                        onExclude={() =>
                            onChange({
                                ...state,
                                exclude: toggle(state.exclude, category.name),
                                categories: state.categories.filter((name) => name !== category.name),
                            })
                        }
                    />
                ))}
            </FilterSection>
        </div>
    );
}
