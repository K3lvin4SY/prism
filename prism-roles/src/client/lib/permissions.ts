import type { PermissionGroup, Role } from '../api';

export const WEBSOCKET = 'websocket.connect';

/**
 * What applying a role sets the subuser form to: the role's permissions this person may give
 * on the form, plus the permissions they cannot change kept as they are.
 */
export function applyRole(role: Pick<Role, 'permissions'>, selected: readonly string[], editable: readonly string[]): string[] {
    const can = new Set(editable);
    const kept = selected.filter((key) => !can.has(key));

    return [...new Set([...role.permissions.filter((key) => can.has(key)), ...kept, WEBSOCKET])].sort();
}

/** The role's permissions this person cannot give here, which applying it leaves out. */
export function missing(role: Pick<Role, 'permissions'>, editable: readonly string[]): string[] {
    const can = new Set([...editable, WEBSOCKET]);

    return role.permissions.filter((key) => !can.has(key));
}

/** The role that exactly matches the form, if one does; websocket access is always given. */
export function matching<T extends Pick<Role, 'permissions'>>(roles: T[], selected: readonly string[]): T | undefined {
    const want = new Set([...selected, WEBSOCKET]);

    return roles.find((role) => {
        const has = new Set([...role.permissions, WEBSOCKET]);

        return has.size === want.size && [...has].every((key) => want.has(key));
    });
}

/** A group's keys switched on or off together. */
export function toggleGroup(permissions: readonly string[], prefix: string, group: PermissionGroup, on: boolean): string[] {
    const keys = Object.keys(group.keys).map((key) => `${prefix}.${key}`);
    const rest = permissions.filter((key) => !keys.includes(key));

    return (on ? [...rest, ...keys] : rest).sort();
}

/** "control.start" → "Control: start", for permissions shown on their own. */
export const permissionLabel = (key: string) => {
    const [group, ...rest] = key.replace(/^ext\./, '').split('.');

    return `${group.charAt(0).toUpperCase()}${group.slice(1)}: ${rest.join('.').replace(/[-_]/g, ' ')}`;
};
