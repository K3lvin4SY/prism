import { describe, expect, it } from 'vitest';
import { expiryChoices, toggleOption } from './options';

describe('toggleOption', () => {
    it('turns the console on with commands, and commands off with the console', () => {
        expect(toggleOption([], 'command', true)).toEqual(['console', 'command']);
        expect(toggleOption(['console', 'command', 'files'], 'console', false)).toEqual(['files']);
    });

    it('keeps a fixed order and no repeats', () => {
        expect(toggleOption(['backups', 'start'], 'start', true)).toEqual(['start', 'backups']);
    });
});

describe('expiryChoices', () => {
    it('offers only what the admin allows, ending at the maximum', () => {
        expect(expiryChoices(168).map((choice) => choice.hours)).toEqual([1, 24, 72, 168]);
        expect(expiryChoices(48).map((choice) => choice.hours)).toEqual([1, 24, 48]);
    });
});
