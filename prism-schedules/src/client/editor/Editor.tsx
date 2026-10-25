import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Input, Switch, httpErrorToHuman, toast, useCurrentServerRequired } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { api, keys, toInput, type Schedule, type ScheduleInput, type State } from '../api';
import { Pills } from '../components/ui';
import { getConfig } from '../config';
import { flatten } from '../steps';
import ConditionsTab from './ConditionsTab';
import HistoryTab from './HistoryTab';
import SettingsTab from './SettingsTab';
import StepList from './StepList';
import TriggerTab from './TriggerTab';

type Tab = 'steps' | 'trigger' | 'conditions' | 'settings' | 'history';

const BLANK: ScheduleInput = { name: 'New schedule', enabled: true, color: null, trigger: { type: 'cron', cron: '0 4 * * *' }, conditions: { all: [], lastSucceeded: false }, steps: [] };

/** One schedule: its steps, when it runs, what must hold, its settings and its runs. */
export default function Editor({ state, schedule, draft, tab, onTab, onClose, onSaved }: { state: State; schedule: Schedule | null; draft: ScheduleInput | null; tab: string | null; onTab: (tab: string) => void; onClose: () => void; onSaved: (id: number) => void }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const queryClient = useQueryClient();
    const config = getConfig();
    const initial = schedule ? toInput(schedule) : (draft ?? BLANK);
    const [value, setValue] = useState<ScheduleInput>(initial);
    const [saved, setSaved] = useState(JSON.stringify(initial));
    const [saving, setSaving] = useState(false);
    const [starting, setStarting] = useState(false);
    const canEdit = schedule ? state.permissions.update : state.permissions.create;
    const dirty = JSON.stringify(value) !== saved || !schedule;
    const current: Tab = (['steps', 'trigger', 'conditions', 'settings', 'history'] as Tab[]).includes(tab as Tab) && (schedule || tab !== 'history') ? (tab as Tab) : 'steps';
    const running = schedule ? state.runs.find((run) => run.scheduleId === schedule.id && run.status === 'running') : undefined;
    const stepCount = flatten(value.steps).length;

    // Leaving with unsaved changes asks first.
    useEffect(() => {
        if (!dirty || !canEdit) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);

        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty, canEdit]);

    const update = (patch: Partial<ScheduleInput>) => setValue((previous) => ({ ...previous, ...patch }));

    const save = async () => {
        setSaving(true);
        try {
            const result = schedule ? await api.update(identifier, schedule.id, value) : await api.create(identifier, value);
            await queryClient.invalidateQueries({ queryKey: keys.state(identifier) });
            const next = toInput(result);
            setValue(next);
            setSaved(JSON.stringify(next));
            toast.success(schedule ? 'Schedule saved.' : 'Schedule created.');
            if (!schedule) onSaved(result.id);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setSaving(false);
        }
    };

    const runNow = async () => {
        if (!schedule) return;
        setStarting(true);
        try {
            await api.run(identifier, schedule.id);
            await queryClient.invalidateQueries({ queryKey: keys.state(identifier) });
            toast.success('Started.');
            onTab('history');
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setStarting(false);
        }
    };

    const tabs: { value: Tab; label: string }[] = [
        { value: 'steps', label: `Steps (${stepCount})` },
        { value: 'trigger', label: 'Trigger' },
        { value: 'conditions', label: `Conditions${value.conditions.all.length ? ` (${value.conditions.all.length})` : ''}` },
        { value: 'settings', label: 'Settings' },
        ...(schedule ? [{ value: 'history' as const, label: 'History' }] : []),
    ];

    return (
        <div className={'psc:flex psc:flex-col psc:gap-4'}>
            <div className={'psc:flex psc:flex-wrap psc:items-center psc:gap-3'}>
                <Button isSecondary size={'small'} onClick={onClose}>
                    <NamedIcon name={'arrow-left'} size={14} /> All schedules
                </Button>
                <div className={'psc:min-w-56 psc:flex-1'}>
                    <Input value={value.name} onChange={(event) => update({ name: event.target.value })} disabled={!canEdit} maxLength={100} aria-label={'Name'} className={'psc:max-w-md psc:font-semibold'} />
                </div>
                <Switch checked={value.enabled} disabled={!canEdit} onChange={(enabled) => update({ enabled })} label={'Enabled'} />
                {schedule && state.permissions.update && (
                    <Button isSecondary isLoading={starting} disabled={!!running || dirty} onClick={runNow} title={dirty ? 'Save first' : undefined}>
                        <NamedIcon name={'play'} size={14} /> Run now
                    </Button>
                )}
                {canEdit && (
                    <Button isLoading={saving} disabled={!dirty || !value.name.trim() || stepCount === 0 || stepCount > config.maxSteps} onClick={save}>
                        {schedule ? 'Save' : 'Create schedule'}
                    </Button>
                )}
            </div>

            <Pills value={current} onChange={onTab} options={tabs} />

            {stepCount > config.maxSteps && <p className={'psc:text-sm psc:text-destructive'}>A schedule can have at most {config.maxSteps} steps.</p>}

            {current === 'steps' && <StepList steps={value.steps} onChange={(steps) => update({ steps })} schedules={state.schedules.filter((item) => item.id !== schedule?.id)} disabled={!canEdit} depth={0} />}
            {current === 'trigger' && <TriggerTab state={state} trigger={value.trigger} onChange={(trigger) => update({ trigger })} disabled={!canEdit} />}
            {current === 'conditions' && <ConditionsTab conditions={value.conditions} minecraft={state.minecraft} onChange={(conditions) => update({ conditions })} disabled={!canEdit} />}
            {current === 'settings' && <SettingsTab state={state} schedule={schedule} value={value} onChange={update} disabled={!canEdit} onDeleted={onClose} />}
            {current === 'history' && schedule && <HistoryTab schedule={schedule} steps={value.steps} />}
        </div>
    );
}
