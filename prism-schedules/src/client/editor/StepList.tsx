import { useState } from 'react';
import { Button, NamedIcon, Select, cn } from '@pterodactyl/sdk';
import type { Schedule, Step, StepType } from '../api';
import { getConfig } from '../config';
import { STEP_TYPES, cloneStep, newStep, stepInfo, summary } from '../steps';
import StepFields from './StepFields';

/**
 * A list of steps that can be dragged into order, each opening to its settings. An If/Else step
 * holds a list for each branch.
 */
export default function StepList({ steps, onChange, schedules, disabled, depth }: { steps: Step[]; onChange: (steps: Step[]) => void; schedules: Schedule[]; disabled: boolean; depth: number }) {
    const [open, setOpen] = useState<string | null>(steps.length === 1 ? steps[0].id : null);
    const [dragging, setDragging] = useState<number | null>(null);
    const [over, setOver] = useState<number | null>(null);

    const replace = (index: number, step: Step) => onChange(steps.map((item, at) => (at === index ? step : item)));
    const move = (from: number, to: number) => {
        if (from === to || to < 0 || to >= steps.length) return;
        const next = [...steps];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        onChange(next);
    };
    const add = (type: StepType) => {
        const step = newStep(type);
        onChange([...steps, step]);
        setOpen(step.id);
    };

    return (
        <div className={'psc:flex psc:flex-col psc:gap-2'}>
            {steps.length === 0 && <p className={'psc:rounded-md psc:border psc:border-dashed psc:border-border psc:px-3 psc:py-4 psc:text-center psc:text-sm psc:text-muted-foreground'}>{depth === 0 ? 'No steps yet. Add the first one below.' : 'Nothing here.'}</p>}

            {steps.map((step, index) => {
                const info = stepInfo(step.type);
                const isOpen = open === step.id;

                return (
                    <div
                        key={step.id}
                        onDragOver={(event) => {
                            if (dragging === null) return;
                            event.preventDefault();
                            event.stopPropagation();
                            setOver(index);
                        }}
                        onDrop={(event) => {
                            if (dragging === null) return;
                            event.preventDefault();
                            event.stopPropagation();
                            move(dragging, index);
                            setDragging(null);
                            setOver(null);
                        }}
                        className={cn('psc:rounded-lg psc:border psc:bg-card psc:transition-colors', over === index && dragging !== null && dragging !== index ? 'psc:border-primary' : 'psc:border-border', dragging === index && 'psc:opacity-50')}
                    >
                        <div className={'psc:flex psc:items-center psc:gap-2 psc:px-2 psc:py-2'}>
                            {!disabled && (
                                <span
                                    draggable
                                    onDragStart={(event) => {
                                        event.stopPropagation();
                                        event.dataTransfer.effectAllowed = 'move';
                                        event.dataTransfer.setData('text/plain', step.id);
                                        setDragging(index);
                                    }}
                                    onDragEnd={() => {
                                        setDragging(null);
                                        setOver(null);
                                    }}
                                    className={'psc:cursor-grab psc:px-1 psc:text-muted-foreground psc:active:cursor-grabbing'}
                                    title={'Drag to reorder'}
                                >
                                    <NamedIcon name={'grip-vertical'} size={16} />
                                </span>
                            )}
                            <span className={'psc:flex psc:size-6 psc:shrink-0 psc:items-center psc:justify-center psc:rounded-full psc:bg-muted psc:text-xs psc:font-semibold psc:tabular-nums'}>{index + 1}</span>
                            <button type={'button'} onClick={() => setOpen(isOpen ? null : step.id)} className={'psc:flex psc:min-w-0 psc:flex-1 psc:cursor-pointer psc:items-center psc:gap-2 psc:text-left'}>
                                <NamedIcon name={info.icon} size={16} className={'psc:shrink-0 psc:text-primary'} />
                                <span className={'psc:shrink-0 psc:font-medium'}>{info.label}</span>
                                <span className={'psc:min-w-0 psc:truncate psc:text-sm psc:text-muted-foreground'}>{summary(step, (id) => schedules.find((item) => item.id === id)?.name)}</span>
                            </button>
                            {(step.continueOnFailure || step.retries > 0) && (
                                <span className={'psc:hidden psc:shrink-0 psc:text-xs psc:text-muted-foreground psc:sm:inline'}>
                                    {step.retries > 0 && `${step.retries}× retry`}
                                    {step.retries > 0 && step.continueOnFailure && ' · '}
                                    {step.continueOnFailure && 'carries on'}
                                </span>
                            )}
                            {!disabled && (
                                <div className={'psc:flex psc:shrink-0 psc:items-center'}>
                                    <Button.Text size={'small'} aria-label={'Move up'} title={'Move up'} disabled={index === 0} onClick={() => move(index, index - 1)}>
                                        <NamedIcon name={'arrow-up'} size={14} />
                                    </Button.Text>
                                    <Button.Text size={'small'} aria-label={'Move down'} title={'Move down'} disabled={index === steps.length - 1} onClick={() => move(index, index + 1)}>
                                        <NamedIcon name={'arrow-down'} size={14} />
                                    </Button.Text>
                                    <Button.Text size={'small'} aria-label={'Duplicate'} title={'Duplicate'} onClick={() => onChange([...steps.slice(0, index + 1), cloneStep(step), ...steps.slice(index + 1)])}>
                                        <NamedIcon name={'copy'} size={14} />
                                    </Button.Text>
                                    <Button.Text size={'small'} aria-label={'Remove'} title={'Remove'} onClick={() => onChange(steps.filter((_, at) => at !== index))}>
                                        <NamedIcon name={'trash-2'} size={14} />
                                    </Button.Text>
                                </div>
                            )}
                            <NamedIcon name={isOpen ? 'chevron-up' : 'chevron-down'} size={15} className={'psc:shrink-0 psc:text-muted-foreground'} />
                        </div>

                        {isOpen && (
                            <div className={'psc:flex psc:flex-col psc:gap-4 psc:border-t psc:border-border psc:p-4'}>
                                <StepFields step={step} onChange={(next) => replace(index, next)} schedules={schedules} disabled={disabled} />
                                <div className={'psc:flex psc:flex-wrap psc:items-center psc:gap-x-6 psc:gap-y-2 psc:border-t psc:border-border psc:pt-3 psc:text-sm'}>
                                    <label className={'psc:flex psc:cursor-pointer psc:items-center psc:gap-2'}>
                                        <input type={'checkbox'} checked={step.continueOnFailure} disabled={disabled} onChange={(event) => replace(index, { ...step, continueOnFailure: event.target.checked })} style={{ accentColor: 'var(--primary)' }} />
                                        Carry on if this fails
                                    </label>
                                    <label className={'psc:flex psc:items-center psc:gap-2'}>
                                        Retries
                                        <div className={'psc:w-24'}>
                                            <Select value={String(step.retries)} disabled={disabled} onChange={(next) => replace(index, { ...step, retries: Number(next) })} options={['0', '1', '2', '3'].map((count) => ({ value: count, label: count === '0' ? 'None' : `${count}×` }))} />
                                        </div>
                                    </label>
                                </div>
                            </div>
                        )}

                        {step.type === 'if' && (
                            <div className={'psc:grid psc:gap-3 psc:border-t psc:border-border psc:p-3 psc:md:grid-cols-2'}>
                                {(['then', 'else'] as const).map((branch) => (
                                    <div key={branch} className={'psc:flex psc:flex-col psc:gap-2 psc:rounded-md psc:bg-muted/30 psc:p-2'}>
                                        <p className={cn('psc:text-xs psc:font-semibold psc:uppercase psc:tracking-wide', branch === 'then' ? 'psc:text-green-500' : 'psc:text-yellow-500')}>{branch === 'then' ? 'Then' : 'Else'}</p>
                                        <StepList steps={step[branch] ?? []} onChange={(list) => replace(index, { ...step, [branch]: list })} schedules={schedules} disabled={disabled} depth={depth + 1} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}

            {!disabled && <AddStep onAdd={add} nested={depth > 0} allowIf={depth < 3} />}
        </div>
    );
}

function AddStep({ onAdd, nested, allowIf }: { onAdd: (type: StepType) => void; nested: boolean; allowIf: boolean }) {
    const [open, setOpen] = useState(false);
    const config = getConfig();
    const types = STEP_TYPES.filter((item) => (item.type !== 'discord' || config.discord) && (item.type !== 'if' || allowIf));

    if (!open) {
        return (
            <Button.Text size={'small'} onClick={() => setOpen(true)} className={'psc:self-start'}>
                <NamedIcon name={'plus'} size={14} /> Add step
            </Button.Text>
        );
    }

    return (
        <div className={cn('psc:grid psc:gap-2 psc:rounded-lg psc:border psc:border-dashed psc:border-border psc:p-2', nested ? 'psc:grid-cols-1 psc:sm:grid-cols-2' : 'psc:sm:grid-cols-2 psc:lg:grid-cols-3')}>
            {types.map((item) => (
                <button
                    key={item.type}
                    type={'button'}
                    onClick={() => {
                        onAdd(item.type);
                        setOpen(false);
                    }}
                    className={'psc:flex psc:cursor-pointer psc:items-start psc:gap-2 psc:rounded-md psc:p-2 psc:text-left psc:hover:bg-muted'}
                >
                    <NamedIcon name={item.icon} size={16} className={'psc:mt-0.5 psc:shrink-0 psc:text-primary'} />
                    <span>
                        <span className={'psc:block psc:text-sm psc:font-medium'}>{item.label}</span>
                        <span className={'psc:block psc:text-xs psc:text-muted-foreground'}>{item.description}</span>
                    </span>
                </button>
            ))}
            <Button.Text size={'small'} onClick={() => setOpen(false)} className={'psc:self-center'}>
                Cancel
            </Button.Text>
        </div>
    );
}
