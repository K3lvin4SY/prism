/** Simple schedule times as cron expressions, and cron expressions in words. */

export type CronMode = 'minutes' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

export interface CronParts {
    mode: CronMode;
    every: number;
    minute: number;
    hour: number;
    days: number[];
    dayOfMonth: number;
    custom: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function build(parts: CronParts): string {
    switch (parts.mode) {
        case 'minutes':
            return `*/${Math.max(1, Math.min(59, parts.every))} * * * *`;
        case 'hourly':
            return parts.every > 1 ? `${parts.minute} */${parts.every} * * *` : `${parts.minute} * * * *`;
        case 'daily':
            return `${parts.minute} ${parts.hour} * * *`;
        case 'weekly':
            return `${parts.minute} ${parts.hour} * * ${parts.days.length ? [...parts.days].sort().join(',') : '*'}`;
        case 'monthly':
            return `${parts.minute} ${parts.hour} ${parts.dayOfMonth} * *`;
        case 'custom':
            return parts.custom.trim();
    }
}

const number = (value: string) => (/^\d+$/.test(value) ? Number(value) : null);

/** The simple form a cron expression came from, or custom when it fits none. */
export function parse(cron: string): CronParts {
    const fallback: CronParts = { mode: 'custom', every: 15, minute: 0, hour: 4, days: [1], dayOfMonth: 1, custom: cron };
    const fields = cron.trim().split(/\s+/);
    if (fields.length !== 5) return fallback;
    const [minute, hour, dom, month, dow] = fields;
    if (month !== '*') return fallback;

    const step = minute.match(/^\*\/(\d+)$/);
    if (step && hour === '*' && dom === '*' && dow === '*') return { ...fallback, mode: 'minutes', every: Number(step[1]) };

    const m = number(minute);
    if (m === null) return fallback;
    if (dom === '*' && dow === '*') {
        if (hour === '*') return { ...fallback, mode: 'hourly', every: 1, minute: m };
        const hourStep = hour.match(/^\*\/(\d+)$/);
        if (hourStep) return { ...fallback, mode: 'hourly', every: Number(hourStep[1]), minute: m };
    }

    const h = number(hour);
    if (h === null) return fallback;
    if (dom === '*' && dow === '*') return { ...fallback, mode: 'daily', minute: m, hour: h };
    if (dom === '*' && /^\d(,\d)*$/.test(dow)) return { ...fallback, mode: 'weekly', minute: m, hour: h, days: dow.split(',').map(Number).map((day) => day % 7) };
    if (number(dom) !== null && dow === '*') return { ...fallback, mode: 'monthly', minute: m, hour: h, dayOfMonth: Number(dom) };

    return fallback;
}

const time = (hour: number, minute: number) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

export function describe(cron: string): string {
    const parts = parse(cron);
    switch (parts.mode) {
        case 'minutes':
            return parts.every === 1 ? 'Every minute' : `Every ${parts.every} minutes`;
        case 'hourly':
            return parts.every > 1 ? `Every ${parts.every} hours at :${String(parts.minute).padStart(2, '0')}` : `Every hour at :${String(parts.minute).padStart(2, '0')}`;
        case 'daily':
            return `Every day at ${time(parts.hour, parts.minute)}`;
        case 'weekly':
            return `${parts.days.length === 7 ? 'Every day' : parts.days.map((day) => DAY_NAMES[day]).join(', ')} at ${time(parts.hour, parts.minute)}`;
        case 'monthly':
            return `On day ${parts.dayOfMonth} of each month at ${time(parts.hour, parts.minute)}`;
        case 'custom':
            return `Cron: ${cron}`;
    }
}
