import { describe as group, expect, it } from 'vitest';
import { read } from '../config';
import { dayOf, describe, family } from './describe';

group('describe', () => {
    it('puts the detail after the phrase when the entry has it', () => {
        expect(describe('server:console.command', { command: 'say hi' })).toBe('ran a command: say hi');
        expect(describe('server:console.command')).toBe('ran a command');
    });

    it('names a few files and counts the rest', () => {
        expect(describe('server:file.delete', { directory: '/plugins', files: ['a.jar', 'b.jar', 'c.jar', 'd.jar', 'e.jar'] })).toBe('deleted files: a.jar, b.jar, c.jar and 2 more in /plugins');
        expect(describe('server:file.rename', { directory: '/', files: [{ from: 'a.txt', to: 'b.txt' }] })).toBe('renamed files: a.txt → b.txt');
    });

    it('says who a failed sign-in tried to be', () => {
        expect(describe('auth:fail', { user: 'steve' })).toBe('failed to sign in: steve');
    });

    it('reads events it does not know from their name', () => {
        expect(describe('server:prism-notes.delete')).toBe('used prism notes (delete)');
        expect(describe('server:file.mystery')).toBe('used file (mystery)');
        expect(describe('prism-x:happened')).toBe('did happened');
    });
});

group('family', () => {
    it('sorts events by their prefix', () => {
        expect(family('auth:success')).toBe('auth');
        expect(family('admin:node.update')).toBe('admin');
        expect(family('prism-x:thing')).toBe('other');
    });
});

group('dayOf', () => {
    it('gives the local date', () => {
        const local = new Date(2026, 10, 2, 23, 30);
        expect(dayOf(local.toISOString())).toBe('2026-11-02');
    });
});

group('read', () => {
    it('falls back to the PHP defaults', () => {
        expect(read({})).toEqual({ alerts: true });
    });
});
