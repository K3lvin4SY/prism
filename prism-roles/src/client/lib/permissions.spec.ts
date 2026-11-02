import { describe, expect, it } from 'vitest';
import { applyRole, matching, missing, permissionLabel, toggleGroup } from './permissions';

const moderator = { permissions: ['websocket.connect', 'control.console', 'control.start', 'user.read'] };

describe('applyRole', () => {
    it('gives the role where the form allows it', () => {
        expect(applyRole(moderator, [], ['control.console', 'control.start', 'user.read', 'file.read'])).toEqual(['control.console', 'control.start', 'user.read', 'websocket.connect']);
    });

    it('drops what the person may not give and keeps what they may not change', () => {
        expect(applyRole(moderator, ['backup.delete', 'file.read'], ['control.console', 'file.read'])).toEqual(['backup.delete', 'control.console', 'websocket.connect']);
    });
});

describe('missing', () => {
    it('lists the role permissions this person cannot give', () => {
        expect(missing(moderator, ['control.console'])).toEqual(['control.start', 'user.read']);
    });
});

describe('matching', () => {
    it('finds the role equal to the form, websocket or not', () => {
        const roles = [{ id: 1, permissions: ['file.read'] }, { id: 2, ...moderator }];
        expect(matching(roles, ['control.console', 'control.start', 'user.read'])?.id).toBe(2);
        expect(matching(roles, ['control.console'])).toBeUndefined();
    });
});

describe('toggleGroup', () => {
    it('switches a whole group', () => {
        const group = { description: '', keys: { start: '', stop: '' } };
        expect(toggleGroup(['file.read'], 'control', group, true)).toEqual(['control.start', 'control.stop', 'file.read']);
        expect(toggleGroup(['control.start', 'file.read'], 'control', group, false)).toEqual(['file.read']);
    });
});

describe('permissionLabel', () => {
    it('reads well', () => {
        expect(permissionLabel('control.start')).toBe('Control: start');
        expect(permissionLabel('ext.prism-notes.read')).toBe('Prism-notes: read');
        expect(permissionLabel('database.view_password')).toBe('Database: view password');
    });
});
