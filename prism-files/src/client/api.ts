import { http } from '@pterodactyl/sdk';
import type { EditorSettings, Keybinds } from './config';

export interface FileEntry {
    name: string;
    path: string;
    directory: boolean;
    size: number;
    mode: string;
    modeBits: string;
    mimetype: string;
    modified: string;
    symlink: boolean;
}

export interface TrashItem {
    id: string;
    path: string;
    name: string;
    size: number;
    directory: boolean;
    deletedAt: string;
    by: string | null;
}

export interface Preferences {
    view?: 'list' | 'grid';
    showHidden?: boolean;
    editor?: Partial<EditorSettings>;
    keybinds?: Partial<Keybinds>;
    explorer?: boolean;
}

const core = (server: string) => `/api/client/servers/${server}/files`;
const prism = (server: string) => `/api/client/servers/${server}/extensions/prism-files`;
const relative = (path: string) => path.replace(/^\/+/, '');

export const fileKeys = {
    list: (server: string, directory: string) => ['prism-files', server, 'list', directory] as const,
    state: (server: string) => ['prism-files', server, 'state'] as const,
};

interface ApiFile {
    attributes: { name: string; mode: string | null; mode_bits: string | null; size: number | null; is_file: boolean; is_symlink: boolean; mimetype: string; modified_at: string };
}

export async function listFiles(server: string, directory: string): Promise<FileEntry[]> {
    const { data } = await http.get<{ data: ApiFile[] }>(`${core(server)}/list`, { params: { directory } });

    return data.data
        .map(({ attributes: file }) => ({
            name: file.name,
            path: (directory.replace(/\/+$/, '') + '/' + file.name).replace(/^\/*/, '/'),
            directory: !file.is_file,
            size: file.size ?? 0,
            mode: file.mode ?? '',
            modeBits: file.mode_bits ?? '',
            mimetype: file.mimetype,
            modified: file.modified_at,
            symlink: file.is_symlink,
        }))
        .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

export async function readFile(server: string, path: string): Promise<string> {
    const { data } = await http.get<string>(`${core(server)}/contents`, { params: { file: path }, responseType: 'text', transformResponse: (body: string) => body });

    return data;
}

export async function downloadUrl(server: string, path: string): Promise<string> {
    return (await http.get<{ attributes: { url: string } }>(`${core(server)}/download`, { params: { file: path } })).data.attributes.url;
}

export async function createFolder(server: string, directory: string, name: string): Promise<void> {
    await http.post(`${core(server)}/create-folder`, { root: directory, name });
}

export async function copyFile(server: string, path: string): Promise<void> {
    await http.post(`${core(server)}/copy`, { location: path });
}

export async function compress(server: string, directory: string, files: string[]): Promise<{ attributes: { name: string } }> {
    return (await http.post(`${core(server)}/compress`, { root: directory, files })).data;
}

export async function decompress(server: string, directory: string, file: string): Promise<void> {
    await http.post(`${core(server)}/decompress`, { root: directory, file }, { timeout: 300_000 });
}

export async function chmod(server: string, directory: string, files: { file: string; mode: string }[]): Promise<void> {
    await http.post(`${core(server)}/chmod`, { root: directory, files });
}

export async function pull(server: string, url: string, directory: string): Promise<void> {
    await http.post(`${core(server)}/pull`, { url, directory });
}

// Prism's own routes check protected paths and conflicts first.

export async function getState(server: string): Promise<{ trash: { items: TrashItem[]; ignored: boolean }; preferences: Preferences | [] }> {
    return (await http.get(`${prism(server)}/state`)).data;
}

export async function savePreferences(server: string, preferences: Preferences): Promise<void> {
    await http.put(`${prism(server)}/preferences`, { preferences });
}

export async function rename(server: string, root: string, files: { from: string; to: string }[]): Promise<void> {
    await http.post(`${prism(server)}/rename`, { root: relative(root), files: files.map((file) => ({ from: relative(file.from), to: relative(file.to) })) });
}

export async function writeFile(server: string, path: string, content: string, expected: string | null, force = false): Promise<{ modified: string | null; size: number | null }> {
    return (await http.post(`${prism(server)}/write`, { path, content, expected, force })).data;
}

export async function trashFiles(server: string, directory: string, files: string[]): Promise<void> {
    await http.post(`${prism(server)}/trash`, { directory: relative(directory), files });
}

export async function deleteFiles(server: string, directory: string, files: string[]): Promise<void> {
    await http.post(`${prism(server)}/delete`, { directory: relative(directory), files });
}

export async function restoreTrash(server: string, ids: string[], conflict: 'skip' | 'replace' | 'rename'): Promise<{ restored: string[]; conflicts: string[] }> {
    return (await http.post(`${prism(server)}/trash/restore`, { ids, conflict })).data;
}

export async function purgeTrash(server: string, ids: string[]): Promise<void> {
    await http.post(`${prism(server)}/trash/purge`, { ids });
}

export async function emptyTrash(server: string): Promise<void> {
    await http.post(`${prism(server)}/trash/empty`);
}

export async function ignoreTrash(server: string): Promise<void> {
    await http.post(`${prism(server)}/trash/ignore`);
}
