import type { Meta, ModsState } from '../../api/mods';
import { FilterSection } from '../content/ui';

/** What the browser shows: mods with a Linux server build for this game build. */
export default function FilterSidebar({ meta, state }: { meta: Meta; state: ModsState | undefined }) {
    return (
        <div className={'sfy:flex sfy:flex-col sfy:gap-3'}>
            <FilterSection title={'This server'}>
                <div className={'sfy:flex sfy:flex-col sfy:gap-2 sfy:px-1 sfy:text-sm sfy:text-muted-foreground'}>
                    <p>{meta.changelist ? `Game build ${meta.changelist}. Mods offer their newest version with a Linux server build for it.` : 'The game build shows once the server has started; until then the newest Linux server build is offered.'}</p>
                    {state && <p>{state.loader ? 'The Satisfactory Mod Loader is installed.' : 'Every mod needs the Satisfactory Mod Loader; it is installed with the first mod.'}</p>}
                </div>
            </FilterSection>
        </div>
    );
}
