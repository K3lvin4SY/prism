import type { ShareOption } from '../api';

export interface OptionInfo {
    key: ShareOption;
    label: string;
    description: string;
    /** Shown when it is switched on. */
    warning?: string;
}

/** What a link can allow, in the order the dialog shows them. */
export const OPTIONS: OptionInfo[] = [
    { key: 'console', label: 'Watch the console', description: 'See the console and live CPU, memory and network use.' },
    { key: 'command', label: 'Send console commands', description: 'Type commands into the console.', warning: 'Anyone with the link can run any command, such as making themselves an operator.' },
    { key: 'start', label: 'Start the server', description: 'A Start button.' },
    { key: 'stop', label: 'Stop the server', description: 'A Stop button.' },
    { key: 'restart', label: 'Restart the server', description: 'A Restart button.' },
    { key: 'files', label: 'Download files', description: 'Only from the folders and files you pick below.' },
    { key: 'backups', label: 'Download backups', description: 'Only the backups you pick below. A backup is the way to share a whole world.' },
];

export const optionLabel = (key: ShareOption) => OPTIONS.find((option) => option.key === key)?.label ?? key;

/** Keeps the options consistent: commands need the console. */
export function toggleOption(current: ShareOption[], key: ShareOption, on: boolean): ShareOption[] {
    let next = on ? [...new Set([...current, key])] : current.filter((option) => option !== key);
    if (key === 'command' && on && !next.includes('console')) next = [...next, 'console'];
    if (key === 'console' && !on) next = next.filter((option) => option !== 'command');

    return OPTIONS.map((option) => option.key).filter((option) => next.includes(option));
}

export const EXPIRY_CHOICES = [
    { hours: 1, label: '1 hour' },
    { hours: 24, label: '1 day' },
    { hours: 72, label: '3 days' },
    { hours: 168, label: '1 week' },
    { hours: 720, label: '30 days' },
];

/** The expiry choices the admin allows, with the admin's maximum as the last when it is between them. */
export function expiryChoices(maxHours: number): { hours: number; label: string }[] {
    const allowed = EXPIRY_CHOICES.filter((choice) => choice.hours <= maxHours);
    if (!allowed.some((choice) => choice.hours === maxHours)) allowed.push({ hours: maxHours, label: `${maxHours} hours (the most allowed)` });

    return allowed;
}
