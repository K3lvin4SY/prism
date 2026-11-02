import type { Allocated } from '../api';

/** 1536 → "1.5 GiB" from megabytes, as the panel stores memory and disk. */
export function megabytes(mb: number): string {
    if (mb >= 1024 * 1024) return `${round(mb / 1024 / 1024)} TiB`;
    if (mb >= 1024) return `${round(mb / 1024)} GiB`;

    return `${Math.round(mb)} MiB`;
}

/** Bytes as megabytes, then as above. */
export function bytes(value: number): string {
    return megabytes(value / 1024 / 1024);
}

const round = (value: number) => (value >= 100 ? Math.round(value) : Math.round(value * 10) / 10);

/**
 * How full a node is by what it gave its servers, against its limit with overallocation.
 * Unlimited (overallocate -1) has no percent.
 */
export function allocatedPercent(allocated: Allocated): number | null {
    if (allocated.overallocate < 0 || allocated.limit <= 0) return null;
    const max = allocated.limit * (1 + Math.max(0, allocated.overallocate) / 100);

    return (allocated.used / max) * 100;
}

/** Points for a sparkline: values scaled into a width × height box, oldest on the left. */
export function sparkline(values: number[], width: number, height: number, ceiling?: number): string {
    if (values.length === 0) return '';
    const top = Math.max(ceiling ?? 0, ...values, 1);
    const step = values.length > 1 ? width / (values.length - 1) : 0;

    return values.map((value, index) => `${round2(index * step)},${round2(height - (value / top) * height)}`).join(' ');
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** A progress bar's tone from how full it is. */
export function fullness(percent: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
    if (percent === null) return 'neutral';
    if (percent >= 90) return 'danger';
    if (percent >= 75) return 'warning';

    return 'success';
}
