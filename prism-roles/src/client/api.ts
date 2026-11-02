import { http } from '@pterodactyl/sdk';

export interface Role {
    id: number;
    name: string;
    description: string;
    color: string | null;
    permissions: string[];
    /** panel: made by an admin for everyone; mine: the viewer's own; owner: the server owner's. */
    scope: 'panel' | 'mine' | 'owner';
    owner: string | null;
    /** How many subusers are linked to it, where the list counts them. */
    used: number | null;
}

export interface RoleInput {
    name: string;
    description: string;
    color: string | null;
    permissions: string[];
}

export interface PermissionGroup {
    description: string;
    keys: Record<string, string>;
}

export interface Assignment {
    /** The subuser's user uuid, as the panel's subuser routes name them. */
    subuser: string;
    username: string;
    role: { id: number; name: string; color: string | null };
    customised: boolean;
    /** False when the role changed since and could not be given again. */
    current: boolean;
}

export interface MyRoles {
    roles: Role[];
    personal: boolean;
    max: number;
}

type Saved = { data: Role; meta?: { changed: number } };

/** Where a list of roles is kept: the admin's panel-wide roles, or the signed-in user's own. */
export interface RoleStore {
    key: readonly unknown[];
    save: (input: RoleInput, id?: number) => Promise<Saved>;
    remove: (id: number) => Promise<unknown>;
}

const admin = '/api/admin/extensions/prism-roles/roles';
const mine = '/api/client/extensions/prism-roles/roles';
const server = (id: string) => `/api/client/servers/${id}/extensions/prism-roles`;

export const adminRolesKey = ['prism-roles', 'admin'] as const;
export const myRolesKey = ['prism-roles', 'mine'] as const;
export const permissionsKey = ['prism-roles', 'permissions'] as const;
export const serverRolesKey = (id: string) => ['prism-roles', id, 'roles'] as const;
export const assignmentsKey = (id: string) => ['prism-roles', id, 'assignments'] as const;

export const getAdminRoles = async () => (await http.get<{ data: Role[] }>(admin)).data.data;
export const getMyRoles = async () => (await http.get<{ data: MyRoles }>(mine)).data.data;

export const adminStore: RoleStore = {
    key: adminRolesKey,
    save: async (input, id) => (id ? await http.patch<Saved>(`${admin}/${id}`, input) : await http.post<Saved>(admin, input)).data,
    remove: (id) => http.delete(`${admin}/${id}`),
};

export const myStore: RoleStore = {
    key: myRolesKey,
    save: async (input, id) => (id ? await http.patch<Saved>(`${mine}/${id}`, input) : await http.post<Saved>(mine, input)).data,
    remove: (id) => http.delete(`${mine}/${id}`),
};

/** Every permission a subuser can be given: the panel's own groups and the extensions'. */
export async function getPermissionGroups(): Promise<Record<string, PermissionGroup>> {
    const { data } = await http.get<{ attributes: { permissions: Record<string, PermissionGroup> } }>('/api/client/permissions');

    return data.attributes.permissions;
}

export const getServerRoles = async (id: string) => (await http.get<{ data: Role[] }>(`${server(id)}/roles`)).data.data;
export const getAssignments = async (id: string) => (await http.get<{ data: Assignment[] }>(`${server(id)}/assignments`)).data.data;
export const setPending = (id: string, role: number, permissions: readonly string[]) => http.put(`${server(id)}/pending`, { role, permissions });
export const forgetPending = (id: string) => http.delete(`${server(id)}/pending`);
export const reapply = (id: string, subuser: string) => http.post(`${server(id)}/assignments/${subuser}/reapply`);
export const unlink = (id: string, subuser: string) => http.delete(`${server(id)}/assignments/${subuser}`);
