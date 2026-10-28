import { http } from '@pterodactyl/sdk';

/** What a link may allow; the same keys as Capabilities::OPTIONS. */
export type ShareOption = 'console' | 'command' | 'start' | 'stop' | 'restart' | 'files' | 'backups';

export interface ShareLink {
    id: number;
    label: string;
    permissions: ShareOption[];
    /** What it allows right now, after anything its maker or the admin has taken away. */
    effective: ShareOption[];
    paths: string[];
    backups: string[];
    expires_at: string;
    revoked_at: string | null;
    last_used_at: string | null;
    uses: number;
    active: boolean;
    by: string;
    created_at: string;
}

export interface ShareBackup {
    uuid: string;
    name: string;
    size: number;
    completed_at: string | null;
}

export interface Links {
    links: ShareLink[];
    /** Each option, and why this person cannot give it (null when they can). */
    grantable: Record<ShareOption, string | null>;
    max_hours: number;
    backups: ShareBackup[];
}

export interface LinkInput {
    label: string;
    permissions: ShareOption[];
    paths: string[];
    backups: string[];
    hours?: number;
}

export interface FolderEntry {
    name: string;
    path: string;
    directory: boolean;
}

const base = (server: string) => `/api/client/servers/${server}/extensions/prism-share`;

export const linksKey = (server: string) => ['prism-share', server, 'links'] as const;

export const getLinks = async (server: string) => (await http.get<{ data: Links }>(`${base(server)}/links`)).data.data;

export const createLink = async (server: string, input: LinkInput) => (await http.post<{ data: ShareLink & { token: string } }>(`${base(server)}/links`, input)).data.data;

export const updateLink = async (server: string, id: number, input: LinkInput) => (await http.patch<{ data: ShareLink }>(`${base(server)}/links/${id}`, input)).data.data;

export const revokeLink = (server: string, id: number) => http.delete(`${base(server)}/links/${id}`);

/** A folder of the server, through the panel's own file list. */
export async function listFolder(server: string, directory: string): Promise<FolderEntry[]> {
    const { data } = await http.get<{ data: { attributes: { name: string; is_file: boolean; is_symlink: boolean } }[] }>(`/api/client/servers/${server}/files/list`, { params: { directory } });

    return data.data
        .filter(({ attributes }) => !attributes.is_symlink)
        .map(({ attributes }) => ({ name: attributes.name, path: `${directory.replace(/\/+$/, '')}/${attributes.name}`, directory: !attributes.is_file }))
        .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

/** The address to give out: the token is in the fragment, so it never reaches a server's logs. */
export const shareUrl = (token: string) => `${window.location.origin}/share#${token}`;
