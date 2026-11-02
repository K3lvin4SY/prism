import type { Usage } from '../api';

export type Size = { memory: number; disk: number; cpu: number };

/** Whether anything at all can still be created: a server slot and at least the minimum of each. */
export function canCreate(remaining: Usage | null, minimum: Size): boolean {
    return !!remaining && remaining.servers >= 1 && remaining.memory >= minimum.memory && remaining.disk >= minimum.disk && remaining.cpu >= minimum.cpu;
}

/** A starting size: half of what is left, rounded to steps, but never under the minimum or over what is left. */
export function suggested(remaining: Usage, minimum: Size): Size {
    const pick = (left: number, least: number, step: number) => Math.min(left, Math.max(least, Math.floor(left / 2 / step) * step));

    return { memory: pick(remaining.memory, minimum.memory, 256), disk: pick(remaining.disk, minimum.disk, 1024), cpu: pick(remaining.cpu, minimum.cpu, 10) };
}

/** Why this size does not fit, as the server would say, or null when it does. Mirrors Quotas::misfit. */
export function misfit(remaining: Usage, size: Size): string | null {
    if (remaining.servers < 1) return 'You have as many servers as your quota allows. Delete one first.';
    if (size.memory > remaining.memory) return `That is more memory than you have left: ${remaining.memory} MiB.`;
    if (size.disk > remaining.disk) return `That is more disk than you have left: ${remaining.disk} MiB.`;
    if (size.cpu > remaining.cpu) return `That is more CPU than you have left: ${remaining.cpu}%.`;

    return null;
}

/** How full a limit is, in percent; a limit of 0 is full. */
export function percentUsed(used: number, limit: number): number {
    if (limit <= 0) return 100;

    return Math.min(100, (used / limit) * 100);
}

/** 1536 → "1.5 GiB". */
export function mib(value: number): string {
    if (value >= 1024) {
        const gib = value / 1024;

        return `${Number.isInteger(gib) ? gib : gib.toFixed(1)} GiB`;
    }

    return `${value} MiB`;
}
