import { Input, Select, cn } from '@pterodactyl/sdk';
import type { Condition, ConditionType } from '../api';
import { DAYS } from '../steps';

const TYPES: { value: ConditionType; label: string; minecraft?: boolean }[] = [
    { value: 'online', label: 'The server is online' },
    { value: 'offline', label: 'The server is offline' },
    { value: 'players_above', label: 'More players than', minecraft: true },
    { value: 'players_below', label: 'Fewer players than', minecraft: true },
    { value: 'time_between', label: 'The time is between' },
    { value: 'weekday', label: 'The day is' },
];

/** One condition: its kind and the values it needs. */
export default function ConditionFields({ condition, onChange, minecraft, disabled }: { condition: Condition; onChange: (condition: Condition) => void; minecraft: boolean; disabled: boolean }) {
    const types = TYPES.filter((type) => !type.minecraft || minecraft || type.value === condition.type);

    return (
        <div className={'psc:flex psc:flex-wrap psc:items-center psc:gap-2'}>
            <div className={'psc:w-56'}>
                <Select
                    value={condition.type}
                    disabled={disabled}
                    onChange={(type) => onChange({ type: type as ConditionType, ...(type === 'time_between' ? { from: '22:00', to: '06:00' } : type === 'weekday' ? { days: [1, 2, 3, 4, 5] } : String(type).startsWith('players') ? { count: 1 } : {}) })}
                    options={types.map((type) => ({ value: type.value, label: type.label }))}
                />
            </div>
            {(condition.type === 'players_above' || condition.type === 'players_below') && (
                <Input type={'number'} min={0} value={condition.count ?? 0} disabled={disabled} onChange={(event) => onChange({ ...condition, count: Math.max(0, Number(event.target.value)) })} className={'psc:w-24'} aria-label={'Players'} />
            )}
            {condition.type === 'time_between' && (
                <>
                    <Input type={'time'} value={condition.from ?? '00:00'} disabled={disabled} onChange={(event) => onChange({ ...condition, from: event.target.value })} className={'psc:w-32'} aria-label={'From'} />
                    <span className={'psc:text-sm psc:text-muted-foreground'}>and</span>
                    <Input type={'time'} value={condition.to ?? '00:00'} disabled={disabled} onChange={(event) => onChange({ ...condition, to: event.target.value })} className={'psc:w-32'} aria-label={'To'} />
                </>
            )}
            {condition.type === 'weekday' && (
                <div className={'psc:flex psc:gap-1'}>
                    {DAYS.map((label, day) => {
                        const on = (condition.days ?? []).includes(day);

                        return (
                            <button
                                key={day}
                                type={'button'}
                                disabled={disabled}
                                onClick={() => onChange({ ...condition, days: on ? (condition.days ?? []).filter((item) => item !== day) : [...(condition.days ?? []), day] })}
                                className={cn('psc:cursor-pointer psc:rounded-md psc:border psc:px-2 psc:py-1 psc:text-xs', on ? 'psc:border-primary psc:bg-primary psc:text-primary-foreground' : 'psc:border-border psc:text-muted-foreground')}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
