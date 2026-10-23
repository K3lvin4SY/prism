import { useState } from 'react';
import { Dialog, NamedIcon } from '@pterodactyl/sdk';
import type { ScheduleInput } from '../api';
import { newStep } from '../steps';
import { GAMES, PRESETS } from '../presets';
import { Pills } from './ui';

/** Starts a schedule from a preset or from nothing. */
export default function PresetDialog({ minecraft, onPick, onClose }: { minecraft: boolean; onPick: (input: ScheduleInput) => void; onClose: () => void }) {
    const [game, setGame] = useState<(typeof GAMES)[number]>(minecraft ? 'Minecraft' : 'All');
    const shown = PRESETS.filter((preset) => game === 'All' || preset.game === game);

    return (
        <Dialog open onClose={onClose} title={'New schedule'}>
            <div className={'psc:flex psc:flex-col psc:gap-4'}>
                <Pills size={'sm'} value={game} onChange={setGame} options={GAMES.map((item) => ({ value: item, label: item }))} />
                <div className={'psc:grid psc:max-h-[60vh] psc:gap-2 psc:overflow-y-auto psc:pr-1 psc:sm:grid-cols-2'}>
                    <Tile
                        icon={'file-plus'}
                        title={'Start from nothing'}
                        description={'An empty schedule with a daily time.'}
                        onClick={() => onPick({ name: 'New schedule', enabled: true, color: null, trigger: { type: 'cron', cron: '0 4 * * *' }, conditions: { all: [], lastSucceeded: false }, steps: [newStep('command')] })}
                    />
                    {shown.map((preset) => (
                        <Tile key={`${preset.game}-${preset.name}`} icon={preset.icon} title={preset.name} tag={game === 'All' ? preset.game : undefined} description={preset.description} onClick={() => onPick(preset.build())} />
                    ))}
                </div>
            </div>
        </Dialog>
    );
}

function Tile({ icon, title, tag, description, onClick }: { icon: string; title: string; tag?: string; description: string; onClick: () => void }) {
    return (
        <button type={'button'} onClick={onClick} className={'psc:flex psc:cursor-pointer psc:items-start psc:gap-3 psc:rounded-lg psc:border psc:border-border psc:p-3 psc:text-left psc:transition-colors psc:hover:border-primary psc:hover:bg-primary/5'}>
            <span className={'psc:flex psc:size-9 psc:shrink-0 psc:items-center psc:justify-center psc:rounded-lg psc:bg-primary/15 psc:text-primary'}>
                <NamedIcon name={icon} size={17} />
            </span>
            <span className={'psc:min-w-0'}>
                <span className={'psc:flex psc:items-center psc:gap-2'}>
                    <span className={'psc:font-medium'}>{title}</span>
                    {tag && <span className={'psc:rounded psc:bg-muted psc:px-1.5 psc:py-0.5 psc:text-[10px] psc:uppercase psc:text-muted-foreground'}>{tag}</span>}
                </span>
                <span className={'psc:block psc:text-xs psc:text-muted-foreground'}>{description}</span>
            </span>
        </button>
    );
}
