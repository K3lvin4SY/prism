import type { ShareOption } from '../api';

export interface OptionInfo {
    key: ShareOption;
    label: string;
    /** For the badges in the links table. */
    short: string;
    description: string;
    /** Shown when it is switched on. */
    warning?: string;
}

/** What a link can allow, in the order the dialog shows them. */
export const OPTIONS: OptionInfo[] = [
    { key: 'console', short: 'Console', label: 'Watch the console', description: 'See the console and live CPU, memory and network use.' },
    { key: 'command', short: 'Commands', label: 'Send console commands', description: 'Type commands into the console.', warning: 'Anyone with the link can run any command, such as making themselves an operator.' },
    { key: 'start', short: 'Start', label: 'Start the server', description: 'A Start button.' },
    { key: 'stop', short: 'Stop', label: 'Stop the server', description: 'A Stop button.' },
    { key: 'restart', short: 'Restart', label: 'Restart the server', description: 'A Restart button.' },
    { key: 'files', short: 'Files', label: 'Download files', description: 'Only from the folders and files you pick below.' },
    { key: 'backups', short: 'Backups', label: 'Download backups', description: 'Only the backups you pick below. A backup is the way to share a whole world.' },
];

export const optionLabel = (key: ShareOption) => OPTIONS.find((option) => option.key === key)?.label ?? key;

export const optionShort = (key: ShareOption) => OPTIONS.find((option) => option.key === key)?.short ?? key;

/** Keeps the options consistent: commands need the console. */
export function toggleOption(current: ShareOption[], key: ShareOption, on: boolean): ShareOption[] {
    let next = on ? [...new Set([...current, key])] : current.filter((option) => option !== key);
    if (key === 'command' && on && !next.includes('console')) next = [...next, 'console'];
    if (key === 'console' && !on) next = next.filter((option) => option !== 'command');

    return OPTIONS.map((option) => option.key).filter((option) => next.includes(option));
}

export const EXPIRY_PRESETS = [
    { hours: 1, label: '1 hour' },
    { hours: 24, label: '1 day' },
    { hours: 168, label: '7 days' },
];

/** The quick expiry choices the admin allows; anything else is picked as a custom length. */
export function expiryPresets(maxHours: number): { hours: number; label: string }[] {
    return EXPIRY_PRESETS.filter((preset) => preset.hours <= maxHours);
}

export type ExpiryUnit = 'hours' | 'days';

/** A custom length in whole hours, kept between one hour and the admin's maximum. */
export function customHours(amount: number, unit: ExpiryUnit, maxHours: number): { hours: number; capped: boolean } {
    const hours = Math.round((Number.isFinite(amount) ? amount : 0) * (unit === 'days' ? 24 : 1));

    return { hours: Math.min(maxHours, Math.max(1, hours)), capped: hours > maxHours };
}

/** A length of hours in words: "36 hours", "7 days". */
export function hoursLabel(hours: number): string {
    if (hours % 24 === 0) return hours === 24 ? '1 day' : `${hours / 24} days`;

    return hours === 1 ? '1 hour' : `${hours} hours`;
}

/** How long a link still works, short: "6 days left", "23 h left", "40 min left". */
export function timeLeft(expiresAt: string, now = Date.now()): string {
    const minutes = Math.max(1, Math.floor((new Date(expiresAt).getTime() - now) / 60_000));
    if (minutes < 60) return `${minutes} min left`;
    if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} h left`;

    return `${Math.round(minutes / 1440)} days left`;
}
