import { useState } from 'react';
import { NumberInput, formatDate } from '@pterodactyl/sdk';
import { customHours, expiryPresets, hoursLabel, type ExpiryUnit } from '../lib/options';

/** A row of buttons of which one is picked, like the slide's expiry choice. */
export function Segmented<T extends string | number>({ options, value, onChange, disabled, label }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void; disabled?: boolean; label: string }) {
    return (
        <div role={'radiogroup'} aria-label={label} className={'psh:flex psh:gap-1 psh:rounded-lg psh:border psh:border-border psh:bg-background/40 psh:p-1'}>
            {options.map((option) => {
                const on = option.value === value;

                return (
                    <button
                        key={option.value}
                        type={'button'}
                        role={'radio'}
                        aria-checked={on}
                        disabled={disabled}
                        onClick={() => onChange(option.value)}
                        className={
                            'psh:min-w-0 psh:flex-1 psh:cursor-pointer psh:truncate psh:rounded-md psh:py-1.5 psh:transition-colors psh:disabled:cursor-default ' +
                            (options.length > 4 ? 'psh:px-0.5 psh:text-xs ' : 'psh:px-2 psh:text-sm ') +
                            (on ? 'psh:bg-primary psh:font-semibold psh:text-primary-foreground' : 'psh:text-muted-foreground psh:hover:text-foreground psh:disabled:hover:text-muted-foreground')
                        }
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

type Choice = 'keep' | 'custom' | number;

/** The choice a new link starts on: a day, or the most allowed when that is less. */
export function initialHours(maxHours: number): number {
    return Math.min(24, maxHours);
}

const until = (hours: number) => formatDate(new Date(Date.now() + hours * 3_600_000), 'ddd MMM D, HH:mm');

/**
 * How long the link works: a quick choice, or a custom number of hours or days up to the admin's
 * maximum. When changing a link it starts on "Keep", which leaves the expiry as it is (null).
 */
export default function ExpiryPicker({ maxHours, keepUntil, disabled, onChange }: { maxHours: number; keepUntil: string | null; disabled?: boolean; onChange: (hours: number | null) => void }) {
    const presets = expiryPresets(maxHours);
    const start = initialHours(maxHours);
    const [choice, setChoice] = useState<Choice>(keepUntil ? 'keep' : presets.some((preset) => preset.hours === start) ? start : 'custom');
    const [amount, setAmount] = useState(maxHours >= 72 ? 3 : start);
    const [unit, setUnit] = useState<ExpiryUnit>(maxHours >= 72 ? 'days' : 'hours');
    const custom = customHours(amount, unit, maxHours);
    const hours = choice === 'keep' ? null : choice === 'custom' ? custom.hours : choice;

    const pick = (next: Choice) => {
        setChoice(next);
        onChange(next === 'keep' ? null : next === 'custom' ? custom.hours : next);
    };
    const change = (nextAmount: number, nextUnit: ExpiryUnit) => {
        setAmount(nextAmount);
        setUnit(nextUnit);
        onChange(customHours(nextAmount, nextUnit, maxHours).hours);
    };

    return (
        <div className={'psh:flex psh:flex-col psh:gap-2'}>
            <Segmented<Choice>
                label={'Expires'}
                disabled={disabled}
                value={choice}
                onChange={pick}
                options={[...(keepUntil ? [{ value: 'keep' as const, label: 'Keep' }] : []), ...presets.map((preset) => ({ value: preset.hours, label: preset.label })), { value: 'custom' as const, label: 'Custom' }]}
            />

            {choice === 'custom' && (
                <div className={'psh:flex psh:items-center psh:gap-2'}>
                    <div className={'psh:w-24'}>
                        <NumberInput aria-label={'How long'} value={amount} min={1} step={1} disabled={disabled} onValueChange={(value) => change(value ?? 1, unit)} />
                    </div>
                    <div className={'psh:flex-1'}>
                        <Segmented<ExpiryUnit>
                            label={'Unit'}
                            disabled={disabled}
                            value={unit}
                            onChange={(next) => change(amount, next)}
                            options={[
                                { value: 'hours', label: 'hours' },
                                { value: 'days', label: 'days' },
                            ]}
                        />
                    </div>
                </div>
            )}

            <p className={'psh:text-xs psh:text-muted-foreground'}>
                {hours === null ? `Until ${formatDate(keepUntil!, 'ddd MMM D, HH:mm')}, as now.` : `Until ${until(hours)}.`}
                {choice === 'custom' && custom.capped && <span className={'psh:text-warning'}> {hoursLabel(maxHours)} is the most allowed.</span>}
            </p>
        </div>
    );
}
