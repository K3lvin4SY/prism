import { http } from '@pterodactyl/sdk';

export type StepType = 'command' | 'power' | 'backup' | 'wait' | 'waitFor' | 'countdown' | 'discord' | 'run' | 'if';
export type ConditionType = 'online' | 'offline' | 'players_above' | 'players_below' | 'time_between' | 'weekday';
export type TriggerType = 'cron' | 'start' | 'stop' | 'crash' | 'empty' | 'manual';

export interface Condition {
    type: ConditionType;
    count?: number;
    from?: string;
    to?: string;
    days?: number[];
}

export interface Step {
    id: string;
    type: StepType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: Record<string, any>;
    continueOnFailure: boolean;
    retries: number;
    then?: Step[];
    else?: Step[];
}

export interface Trigger {
    type: TriggerType;
    cron?: string;
    minutes?: number;
}

export interface Conditions {
    all: Condition[];
    lastSucceeded: boolean;
}

export interface ScheduleInput {
    name: string;
    enabled: boolean;
    color: string | null;
    trigger: Trigger;
    conditions: Conditions;
    steps: Step[];
}

export interface Schedule extends ScheduleInput {
    id: number;
    pausedUntil: string | null;
    nextRunAt: string | null;
    lastRunAt: string | null;
    lastStatus: RunStatus | null;
    /** Runs in the coming week, for the calendar. */
    upcoming: string[];
}

export type RunStatus = 'running' | 'done' | 'failed' | 'cancelled' | 'skipped';

export interface LogLine {
    at: string;
    level: 'info' | 'success' | 'warning' | 'error';
    text: string;
    step: string | null;
}

export interface Run {
    id: number;
    scheduleId: number;
    status: RunStatus;
    trigger: string;
    step: string | null;
    detail: string | null;
    startedAt: string;
    finishedAt: string | null;
    log?: LogLine[];
}

export interface State {
    config: Record<string, unknown>;
    timezone: string;
    minecraft: boolean;
    permissions: { create: boolean; update: boolean; delete: boolean };
    schedules: Schedule[];
    runs: Run[];
    servers: { identifier: string; name: string }[];
}

const base = (server: string) => `/api/client/servers/${server}/extensions/prism-schedules`;

export const keys = {
    state: (server: string) => ['prism-schedules', server, 'state'] as const,
    runs: (server: string, schedule: number) => ['prism-schedules', server, 'runs', schedule] as const,
    run: (server: string, run: number) => ['prism-schedules', server, 'run', run] as const,
    cron: (server: string, cron: string) => ['prism-schedules', server, 'cron', cron] as const,
};

export const api = {
    state: async (server: string) => (await http.get<State>(`${base(server)}/state`)).data,
    cron: async (server: string, cron: string) => (await http.post<{ valid: boolean; next: string[] }>(`${base(server)}/cron`, { cron })).data,
    create: async (server: string, input: ScheduleInput) => (await http.post<{ schedule: Schedule }>(`${base(server)}/schedules`, input)).data.schedule,
    update: async (server: string, id: number, input: ScheduleInput) => (await http.put<{ schedule: Schedule }>(`${base(server)}/schedules/${id}`, input)).data.schedule,
    remove: (server: string, id: number) => http.delete(`${base(server)}/schedules/${id}`),
    run: async (server: string, id: number) => (await http.post<{ run: Run }>(`${base(server)}/schedules/${id}/run`)).data.run,
    pause: async (server: string, id: number, until: string | null) => (await http.post<{ schedule: Schedule }>(`${base(server)}/schedules/${id}/pause`, { until })).data.schedule,
    copy: async (server: string, id: number, servers: string[]) => (await http.post<{ copied: string[] }>(`${base(server)}/schedules/${id}/copy`, { servers })).data.copied,
    runs: async (server: string, id: number) => (await http.get<{ runs: Run[] }>(`${base(server)}/schedules/${id}/runs`)).data.runs,
    showRun: async (server: string, id: number) => (await http.get<{ run: Run }>(`${base(server)}/runs/${id}`)).data.run,
    stop: async (server: string, id: number) => (await http.post<{ run: Run }>(`${base(server)}/runs/${id}/stop`)).data.run,
};

export const toInput = (schedule: Schedule): ScheduleInput => ({
    name: schedule.name,
    enabled: schedule.enabled,
    color: schedule.color,
    trigger: schedule.trigger,
    conditions: schedule.conditions,
    steps: schedule.steps,
});
