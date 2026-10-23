import type { Condition, Step, StepType } from './api';

export const STEP_TYPES: { type: StepType; label: string; icon: string; description: string }[] = [
    { type: 'command', label: 'Send command', icon: 'terminal', description: 'Type a command into the console.' },
    { type: 'power', label: 'Power action', icon: 'power', description: 'Start, stop, restart or kill the server.' },
    { type: 'backup', label: 'Create backup', icon: 'archive', description: 'Back up the server, with a Prism Backups profile if you like.' },
    { type: 'wait', label: 'Wait', icon: 'hourglass', description: 'Pause before the next step.' },
    { type: 'waitFor', label: 'Wait for server', icon: 'activity', description: 'Carry on once the server is online or offline.' },
    { type: 'countdown', label: 'Countdown', icon: 'timer', description: 'Warn players at set times, then carry on.' },
    { type: 'discord', label: 'Discord message', icon: 'message-square', description: 'Post to a Discord channel through a webhook.' },
    { type: 'run', label: 'Run another schedule', icon: 'git-branch-plus', description: 'Start one of this server\'s other schedules.' },
    { type: 'if', label: 'If / Else', icon: 'split', description: 'Do one thing or another, depending on a condition.' },
];

export const stepInfo = (type: StepType) => STEP_TYPES.find((item) => item.type === type)!;

/** Countdown announcement times, in seconds. */
export const MARKS = [3600, 1800, 900, 600, 300, 120, 60, 30, 10, 5, 4, 3, 2, 1];

export const id = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 36);

export function newStep(type: StepType): Step {
    const config: Record<StepType, Record<string, unknown>> = {
        command: { command: '' },
        power: { signal: 'restart' },
        backup: { name: '', profile: '', locked: false },
        wait: { seconds: 60 },
        waitFor: { state: 'running', timeout: 300 },
        countdown: { seconds: 600, marks: [600, 300, 60, 30, 10, 5], message: 'The server restarts in {time}', command: 'say {message}' },
        discord: { webhook: '', content: '', username: '' },
        run: { schedule: null },
        if: { type: 'online' },
    };

    return { id: id(), type, config: config[type], continueOnFailure: false, retries: 0, ...(type === 'if' ? { then: [], else: [] } : {}) };
}

/** A copy with new ids, so it is a separate step. */
export function cloneStep(step: Step): Step {
    return {
        ...step,
        id: id(),
        config: { ...step.config, ...(step.type === 'discord' ? { webhook: '', webhookSet: false } : {}) },
        ...(step.then ? { then: step.then.map(cloneStep) } : {}),
        ...(step.else ? { else: step.else.map(cloneStep) } : {}),
    };
}

/** "1h 30m", "10m", "30s". */
export function short(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;

    return [hours && `${hours}h`, minutes && `${minutes}m`, rest && `${rest}s`].filter(Boolean).join(' ') || '0s';
}

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeCondition(condition: Condition): string {
    switch (condition.type) {
        case 'online':
            return 'the server is online';
        case 'offline':
            return 'the server is offline';
        case 'players_above':
            return `more than ${condition.count ?? 0} players are online`;
        case 'players_below':
            return `fewer than ${condition.count ?? 0} players are online`;
        case 'time_between':
            return `the time is between ${condition.from ?? '00:00'} and ${condition.to ?? '00:00'}`;
        case 'weekday':
            return `it is ${(condition.days ?? []).map((day) => DAYS[day]).join(', ') || 'one of no days'}`;
    }
}

/** One line saying what a step does. */
export function summary(step: Step, scheduleName: (id: number) => string | undefined): string {
    const config = step.config;
    switch (step.type) {
        case 'command':
            return config.command ? `/${String(config.command).replace(/^\//, '')}` : 'No command yet';
        case 'power':
            return `${String(config.signal).charAt(0).toUpperCase()}${String(config.signal).slice(1)} the server`;
        case 'backup':
            return `Back up${config.profile ? ` with ${config.profile}` : ''}${config.locked ? ', locked' : ''}`;
        case 'wait':
            return `Wait ${short(Number(config.seconds))}`;
        case 'waitFor':
            return `Until ${config.state === 'running' ? 'online' : 'offline'}, at most ${short(Number(config.timeout))}`;
        case 'countdown':
            return `${short(Number(config.seconds))}, announced ${(config.marks as number[]).filter((mark) => mark <= Number(config.seconds)).length} times`;
        case 'discord':
            return config.content ? String(config.content) : 'No message yet';
        case 'run':
            return config.schedule ? (scheduleName(Number(config.schedule)) ?? 'A deleted schedule') : 'No schedule picked';
        case 'if':
            return `If ${describeCondition(config as Condition)}`;
    }
}

/** Every step, in branches too. */
export function flatten(steps: Step[]): Step[] {
    return steps.flatMap((step) => [step, ...(step.type === 'if' ? [...flatten(step.then ?? []), ...flatten(step.else ?? [])] : [])]);
}
