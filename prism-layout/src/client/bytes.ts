const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** Bytes short enough for a card, in steps of 1024: one decimal under 100, none above, as 566 MB or 1.5 GB. */
export function shortBytes(bytes: number): string {
    let value = Math.max(0, bytes);
    let unit = 0;
    while (value >= 1024 && unit < UNITS.length - 1) {
        value /= 1024;
        unit++;
    }

    return `${unit === 0 || value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')} ${UNITS[unit]}`;
}
