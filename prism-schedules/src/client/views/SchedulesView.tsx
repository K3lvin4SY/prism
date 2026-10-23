import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, NamedIcon, Spinner, httpErrorToHuman, toast, useCurrentServerRequired } from '@pterodactyl/sdk';
import type { ViewProps } from '@pterodactyl/sdk/theme';
import { api, keys, type ScheduleInput, type State } from '../api';
import Calendar from '../components/Calendar';
import PresetDialog from '../components/PresetDialog';
import ScheduleList from '../components/ScheduleList';
import { Pills } from '../components/ui';
import { applyConfig, getConfig } from '../config';
import Editor from '../editor/Editor';
import { flatten } from '../steps';

type Mode = 'plus' | 'classic';
const MODE_KEY = 'prism-schedules:mode';

function readMode(): Mode {
    try {
        const stored = window.localStorage.getItem(MODE_KEY);
        if (stored === 'plus' || stored === 'classic') return stored;
    } catch {
        // Storage can be blocked; the admin's default applies.
    }

    return getConfig().defaultView;
}

/** The open schedule lives in the address bar's hash, so a reload keeps it. */
function readHash(): { open: number | 'new' | null; tab: string | null } {
    const match = window.location.hash.match(/^#(new|schedule-(\d+))(?:\/(\w+))?$/);
    if (!match) return { open: null, tab: null };

    return { open: match[1] === 'new' ? 'new' : Number(match[2]), tab: match[3] ?? null };
}

/** Prism Schedules in place of the panel's schedule list, with a switch back to it. */
export default function SchedulesView({ Default }: ViewProps<'server.schedules'>) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const state = useQuery({
        queryKey: keys.state(identifier),
        queryFn: () => api.state(identifier),
        refetchOnMount: 'always',
        retry: false,
        refetchInterval: (query) => (query.state.data?.runs.some((run) => run.status === 'running') ? 3000 : 30_000),
    });
    applyConfig(state.data?.config);
    const [mode, setMode] = useState<Mode>(readMode);

    const choose = (next: Mode) => {
        setMode(next);
        try {
            window.localStorage.setItem(MODE_KEY, next);
        } catch {
            // Remembered for this visit only.
        }
    };

    if (!getConfig().enabled) return <Default />;

    const switcher = (
        <Pills
            value={mode}
            onChange={choose}
            options={[
                { value: 'plus', label: 'Prism' },
                { value: 'classic', label: 'Classic' },
            ]}
        />
    );

    if (mode === 'classic') {
        return (
            <div className={'psc:flex psc:flex-col psc:gap-4'}>
                <div className={'psc:flex psc:items-center psc:justify-end psc:gap-3'}>
                    <span className={'psc:text-sm psc:text-muted-foreground'}>The panel&apos;s own schedules</span>
                    {switcher}
                </div>
                <Default />
            </div>
        );
    }

    if (state.isLoading) return <Spinner centered />;
    if (state.isError || !state.data) return <Alert type={'danger'}>{httpErrorToHuman(state.error)}</Alert>;

    return <Plus state={state.data} switcher={switcher} />;
}

function Plus({ state, switcher }: { state: State; switcher: React.ReactNode }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const config = getConfig();
    const [location, setLocation] = useState(readHash);
    const [view, setView] = useState<'list' | 'calendar'>('list');
    const [presets, setPresets] = useState(false);
    const [draft, setDraft] = useState<ScheduleInput | null>(null);
    const importer = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const follow = () => setLocation(readHash());
        window.addEventListener('hashchange', follow);

        return () => window.removeEventListener('hashchange', follow);
    }, []);

    const go = (open: number | 'new' | null, tab: string | null = null) => {
        const hash = open === null ? '' : `#${open === 'new' ? 'new' : `schedule-${open}`}${tab ? `/${tab}` : ''}`;
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`);
        setLocation({ open, tab });
    };

    const start = (input: ScheduleInput) => {
        setDraft(input);
        setPresets(false);
        go('new');
    };

    const importFile = async (file: File) => {
        try {
            const parsed = JSON.parse(await file.text()) as Partial<ScheduleInput>;
            if (!parsed || typeof parsed.name !== 'string' || !parsed.trigger || !Array.isArray(parsed.steps)) throw new Error('This is not a schedule export.');
            start({ name: parsed.name, enabled: parsed.enabled ?? true, color: parsed.color ?? null, trigger: parsed.trigger, conditions: parsed.conditions ?? { all: [], lastSucceeded: false }, steps: parsed.steps });
            toast.success('Imported. Check it over, then save.');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'The file could not be read.');
        }
    };

    if (location.open !== null) {
        const schedule = location.open === 'new' ? null : state.schedules.find((item) => item.id === location.open);
        if (location.open !== 'new' && !schedule) {
            return (
                <div className={'psc:flex psc:flex-col psc:gap-3'}>
                    <Alert type={'warning'}>That schedule no longer exists.</Alert>
                    <Button isSecondary onClick={() => go(null)}>
                        Back to the schedules
                    </Button>
                </div>
            );
        }

        return <Editor key={location.open} state={state} schedule={schedule ?? null} draft={location.open === 'new' ? draft : null} tab={location.tab} onTab={(tab) => go(location.open, tab)} onClose={() => go(null)} onSaved={(id) => go(id)} />;
    }

    const full = state.schedules.length >= config.maxSchedules;
    const running = state.runs.filter((run) => run.status === 'running').length;

    return (
        <div className={'psc:flex psc:flex-col psc:gap-4'}>
            <div className={'psc:flex psc:flex-wrap psc:items-end psc:gap-3'}>
                <div className={'psc:min-w-56 psc:flex-1'}>
                    <h2 className={'psc:text-lg psc:font-semibold'}>Schedules</h2>
                    <p className={'psc:text-sm psc:text-muted-foreground'}>
                        {state.schedules.length} {state.schedules.length === 1 ? 'schedule' : 'schedules'} · {flatten(state.schedules.flatMap((schedule) => schedule.steps)).length} steps
                        {running > 0 && ` · ${running} running now`} · times are {state.timezone}
                    </p>
                </div>
                <Pills
                    value={view}
                    onChange={setView}
                    options={[
                        { value: 'list', label: 'List' },
                        { value: 'calendar', label: 'Calendar' },
                    ]}
                />
                {switcher}
                {state.permissions.create && (
                    <>
                        <input ref={importer} type={'file'} accept={'.json,application/json'} className={'psc:hidden'} onChange={(event) => event.target.files?.[0] && void importFile(event.target.files[0])} />
                        <Button isSecondary disabled={full} onClick={() => importer.current?.click()}>
                            <NamedIcon name={'upload'} size={14} /> Import
                        </Button>
                        <Button disabled={full} onClick={() => setPresets(true)}>
                            <NamedIcon name={'plus'} size={14} /> New schedule
                        </Button>
                    </>
                )}
            </div>

            {full && state.permissions.create && <Alert type={'info'}>This server has the {config.maxSchedules} schedules the administrator allows.</Alert>}

            {view === 'calendar' ? <Calendar state={state} onOpen={(id) => go(id)} /> : <ScheduleList state={state} onOpen={(id, tab) => go(id, tab ?? null)} onNew={() => setPresets(true)} />}

            {presets && <PresetDialog minecraft={state.minecraft} onPick={start} onClose={() => setPresets(false)} />}
        </div>
    );
}
