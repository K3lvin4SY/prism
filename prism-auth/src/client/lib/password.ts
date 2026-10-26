import type { AuthConfig } from '../config';

export interface PasswordCheck {
    label: string;
    passed: boolean;
}

/** The password rules from Prism Properties, each with whether the password meets it. */
export function passwordChecks(password: string, rules: AuthConfig['password']): PasswordCheck[] {
    const checks: PasswordCheck[] = [{ label: `At least ${rules.min} characters`, passed: [...password].length >= rules.min }];
    if (rules.mixed) checks.push({ label: 'Upper and lower case letters', passed: /\p{Lu}/u.test(password) && /\p{Ll}/u.test(password) });
    if (rules.number) checks.push({ label: 'A number', passed: /\d/.test(password) });

    return checks;
}

/** A username in the panel's shape: letters, numbers, dashes, underscores and dots, starting and ending with a letter or number. */
export const validUsername = (username: string) => /^[a-z0-9]([\w.-]+)[a-z0-9]$/.test(username.toLowerCase());
