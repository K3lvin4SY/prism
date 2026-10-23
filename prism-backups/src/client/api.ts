import { http } from '@pterodactyl/sdk';

export type ProfileMode = 'exclude' | 'include';

export interface Profile {
    id: number;
    name: string;
    mode: ProfileMode;
    /** One pattern or picked path a line. */
    patterns: string;
    applyPteroignore: boolean;
    lockBackups: boolean;
    isDefault: boolean;
}

export type ProfileInput = Omit<Profile, 'id'>;

export interface Job {
    id: number;
    type: 'browse' | 'restore';
    backup: string;
    status: 'pending' | 'running' | 'done' | 'failed';
    progress: number;
    message: string | null;
    stage: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface State {
    config: Record<string, unknown>;
    /** Whether this person gets profiles, browsing and the rest. */
    extras: boolean;
    owner: boolean;
    profiles: Profile[];
    /** The profile each backup was made with. */
    meta: Record<string, string | null>;
    /** Backups the panel has a copy of, ready to browse. */
    opened: string[];
    jobs: Job[];
}

/** One entry of a backup: path, size, folder, modified. */
export interface Entry {
    p: string;
    s: number;
    d: boolean;
    t: string;
}

export interface DirectoryEntry {
    name: string;
    file: boolean;
    size: number;
}

const base = (server: string) => `/api/client/servers/${server}/extensions/prism-backups`;

export const keys = {
    state: (server: string) => ['prism-backups', server, 'state'] as const,
    browse: (server: string, uuid: string) => ['prism-backups', server, 'browse', uuid] as const,
    directory: (server: string, directory: string) => ['prism-backups', server, 'directory', directory] as const,
    ignore: (server: string) => ['prism-backups', server, 'pteroignore'] as const,
};

export const api = {
    state: async (server: string) => (await http.get<State>(`${base(server)}/state`)).data,
    browse: async (server: string, uuid: string) => (await http.get<{ ready: boolean; job: Job | null; entries: Entry[] }>(`${base(server)}/backups/${uuid}/browse`)).data,
    open: async (server: string, uuid: string) => (await http.post<{ job: Job | null }>(`${base(server)}/backups/${uuid}/browse`)).data.job,
    restoreFiles: async (server: string, uuid: string, paths: string[], destination: string) => (await http.post<{ job: Job }>(`${base(server)}/backups/${uuid}/restore-files`, { paths, destination })).data.job,
    job: async (server: string, id: number) => (await http.get<{ job: Job }>(`${base(server)}/jobs/${id}`)).data.job,
    createProfile: async (server: string, profile: ProfileInput) => (await http.post<{ profile: Profile }>(`${base(server)}/profiles`, profile)).data.profile,
    updateProfile: async (server: string, id: number, profile: ProfileInput) => (await http.put<{ profile: Profile }>(`${base(server)}/profiles/${id}`, profile)).data.profile,
    deleteProfile: (server: string, id: number) => http.delete(`${base(server)}/profiles/${id}`),
    directory: async (server: string, directory: string) => (await http.get<{ entries: DirectoryEntry[] }>(`${base(server)}/files`, { params: { directory } })).data.entries,
    readIgnore: async (server: string) => (await http.get<{ exists: boolean; content: string }>(`${base(server)}/pteroignore`)).data,
    writeIgnore: (server: string, content: string) => http.put(`${base(server)}/pteroignore`, { content }),
};

/** The line that makes a backup use a profile, here and in schedule backup tasks. */
export const profileMarker = (name: string) => `# prism-backups: profile=${name}`;

/** The line that makes a backup use only the server's .pteroignore, even with a default profile. */
export const NO_PROFILE = '# prism-backups: none';
