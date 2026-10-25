import { Button, Switch } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import type { Conditions } from '../api';
import { Section } from '../components/ui';
import ConditionFields from './ConditionFields';

/** What must hold for the schedule to run when its trigger fires. */
export default function ConditionsTab({ conditions, minecraft, onChange, disabled }: { conditions: Conditions; minecraft: boolean; onChange: (conditions: Conditions) => void; disabled: boolean }) {
    return (
        <div className={'psc:flex psc:flex-col psc:gap-4'}>
            <p className={'psc:text-sm psc:text-muted-foreground'}>All of these must hold when the trigger fires, or the run is skipped and marked so in the history. Run now ignores them.</p>
            <Section title={'Only run when'}>
                <div className={'psc:flex psc:flex-col psc:gap-3'}>
                    {conditions.all.length === 0 && <p className={'psc:text-sm psc:text-muted-foreground'}>No conditions: it runs whenever its trigger fires.</p>}
                    {conditions.all.map((condition, index) => (
                        <div key={index} className={'psc:flex psc:items-center psc:gap-2'}>
                            <span className={'psc:w-10 psc:text-xs psc:font-semibold psc:uppercase psc:text-muted-foreground'}>{index === 0 ? 'If' : 'and'}</span>
                            <div className={'psc:flex-1'}>
                                <ConditionFields condition={condition} minecraft={minecraft} disabled={disabled} onChange={(next) => onChange({ ...conditions, all: conditions.all.map((item, at) => (at === index ? next : item)) })} />
                            </div>
                            {!disabled && (
                                <Button.Text size={'small'} aria-label={'Remove'} onClick={() => onChange({ ...conditions, all: conditions.all.filter((_, at) => at !== index) })}>
                                    <NamedIcon name={'x'} size={14} />
                                </Button.Text>
                            )}
                        </div>
                    ))}
                    {!disabled && conditions.all.length < 10 && (
                        <Button.Text size={'small'} className={'psc:self-start'} onClick={() => onChange({ ...conditions, all: [...conditions.all, { type: 'online' }] })}>
                            <NamedIcon name={'plus'} size={14} /> Add condition
                        </Button.Text>
                    )}
                </div>
            </Section>
            <Switch checked={conditions.lastSucceeded} disabled={disabled} onChange={(lastSucceeded) => onChange({ ...conditions, lastSucceeded })} label={'Only if the last run succeeded'} description={'A failed or stopped run holds the schedule back until it is run by hand.'} />
        </div>
    );
}
