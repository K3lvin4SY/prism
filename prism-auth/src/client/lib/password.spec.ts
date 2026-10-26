import { describe, expect, it } from 'vitest';
import { read } from '../config';
import { passwordChecks, validUsername } from './password';

describe('passwordChecks', () => {
    it('asks only for the length by default', () => {
        expect(passwordChecks('short', { min: 8, mixed: false, number: false })).toEqual([{ label: 'At least 8 characters', passed: false }]);
        expect(passwordChecks('long enough', { min: 8, mixed: false, number: false }).every((check) => check.passed)).toBe(true);
    });

    it('adds mixed case and a number when the settings ask for them', () => {
        const rules = { min: 8, mixed: true, number: true };
        expect(passwordChecks('alllowercase', rules).map((check) => check.passed)).toEqual([true, false, false]);
        expect(passwordChecks('Mixed4Case', rules).map((check) => check.passed)).toEqual([true, true, true]);
    });
});

describe('validUsername', () => {
    it('follows the panel username rule', () => {
        expect(validUsername('steve')).toBe(true);
        expect(validUsername('steve_99.mc')).toBe(true);
        expect(validUsername('-steve')).toBe(false);
        expect(validUsername('st')).toBe(false);
        expect(validUsername('ste ve')).toBe(false);
    });
});

describe('read', () => {
    it('falls back to the PHP defaults', () => {
        expect(read({})).toMatchObject({
            buttonStyle: 'rows',
            dividerText: 'Or continue with',
            autoCreate: false,
            signup: { enabled: false, username: 'choose', names: true, terms: '', botTrap: true, turnstile: '' },
            password: { min: 8, mixed: false, number: false },
        });
    });

    it('never asks for passwords shorter than the panel allows', () => {
        expect(read({ password_min: 4 }).password.min).toBe(8);
        expect(read({ password_min: 12, button_style: 'icons', signup_username: 'generate' })).toMatchObject({ buttonStyle: 'icons', signup: { username: 'generate' }, password: { min: 12 } });
    });
});
