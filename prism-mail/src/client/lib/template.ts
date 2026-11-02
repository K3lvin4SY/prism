import type { Wording } from '../api';

export const FIELDS = ['subject', 'greeting', 'intro', 'action', 'outro'] as const;

export const EMPTY: Wording = { subject: '', greeting: '', intro: '', action: '', outro: '' };

/** The {placeholders} a text uses that the email does not fill, so they would be sent as typed. */
export function unknownPlaceholders(text: string, known: readonly string[]): string[] {
    const found = [...text.matchAll(/\{([a-z_]+)\}/gi)].map((match) => match[1]);

    return [...new Set(found.filter((name) => !known.includes(name)))];
}

/** Whether two wordings differ, ignoring spaces at the ends that the panel trims anyway. */
export function changed(a: Wording, b: Wording): boolean {
    return FIELDS.some((field) => a[field].trim() !== b[field].trim());
}

/** Whether any field has the admin's own wording. */
export function customised(wording: Wording): boolean {
    return FIELDS.some((field) => wording[field].trim() !== '');
}
