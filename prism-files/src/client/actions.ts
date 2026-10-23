import { useQueryClient } from '@tanstack/react-query';
import { httpErrorToHuman, toast, useCurrentUser, useServerPermission } from '@pterodactyl/sdk';
import { createFolder, deleteFiles, fileKeys, rename, trashFiles, writeFile } from './api';
import { getConfig } from './config';
import { basename, dirname, join, matchesAny } from './lib/paths';

export interface FilePermissions {
    read: boolean;
    readContent: boolean;
    create: boolean;
    update: boolean;
    remove: boolean;
    archive: boolean;
}

export function useFilePermissions(): FilePermissions {
    return {
        read: useServerPermission('file.read'),
        readContent: useServerPermission('file.read-content'),
        create: useServerPermission('file.create'),
        update: useServerPermission('file.update'),
        remove: useServerPermission('file.delete'),
        archive: useServerPermission('file.archive'),
    };
}

/** Whether a path is protected for this user, as the backend will judge it. */
export function useIsProtected(): (path: string) => boolean {
    const user = useCurrentUser();
    const config = getConfig();
    const exempt = !!user?.rootAdmin && !config.protectAdmins;

    return (path: string) => !exempt && config.protected.length > 0 && matchesAny(path, config.protected);
}

/** The file changes both the list and the editor's explorer use, with toasts and refreshes. */
export function useFileActions(server: string) {
    const queryClient = useQueryClient();
    const refresh = (...directories: string[]) => Promise.all(directories.map((directory) => queryClient.invalidateQueries({ queryKey: fileKeys.list(server, directory) })));
    const fail = (error: unknown) => {
        toast.error(httpErrorToHuman(error));
        throw error;
    };

    return {
        refresh,

        async newFolder(directory: string, name: string) {
            await createFolder(server, directory, name).catch(fail);
            await refresh(directory);
        },

        async newFile(directory: string, name: string) {
            const path = join(directory, name);
            await writeFile(server, path, '', null).catch(fail);
            await refresh(directory);

            return path;
        },

        /** Renames or moves; `to` is a full path. */
        async move(items: { from: string; to: string }[]) {
            await rename(server, '/', items).catch(fail);
            await refresh(...new Set(items.flatMap((item) => [dirname(item.from), dirname(item.to)])));
        },

        /** Deletes into the trash when it is on, for good otherwise. */
        async remove(directory: string, names: string[]) {
            const trash = getConfig().trash;
            await (trash ? trashFiles(server, directory, names) : deleteFiles(server, directory, names)).catch(fail);
            await Promise.all([refresh(directory), queryClient.invalidateQueries({ queryKey: fileKeys.state(server) })]);
            toast.success(trash ? `Moved ${names.length === 1 ? names[0] : `${names.length} items`} to the trash.` : `Deleted ${names.length === 1 ? names[0] : `${names.length} items`}.`);
        },
    };
}

/** Asks for a name, checking it is a valid file name. */
export function validName(name: string): string | null {
    const trimmed = name.trim();
    if (trimmed === '') return 'Enter a name.';
    if (/[\\:*?"<>|]/.test(trimmed) || trimmed === '.' || trimmed === '..') return 'That name has characters a file cannot have.';

    return null;
}

export { basename, dirname, join };
