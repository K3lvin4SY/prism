/**
 * Unsaved editor content, kept in the browser's IndexedDB so it survives a reload and comes
 * back as a draft. Everything is best effort: without IndexedDB, drafts are simply not kept.
 */
export interface Draft {
    key: string;
    server: string;
    path: string;
    content: string;
    /** The file's modification time when the edit started. */
    base: string | null;
    saved: number;
}

const DB = 'prism-files';
const STORE = 'drafts';

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
    opening ??= new Promise((resolve) => {
        try {
            const request = indexedDB.open(DB, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });

    return opening;
}

const key = (server: string, path: string) => `${server}:${path}`;

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
    const db = await open();
    if (!db) return null;

    return new Promise((resolve) => {
        try {
            const request = action(db.transaction(STORE, mode).objectStore(STORE));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

export function saveDraft(server: string, path: string, content: string, base: string | null): Promise<unknown> {
    return run('readwrite', (store) => store.put({ key: key(server, path), server, path, content, base, saved: Date.now() } satisfies Draft));
}

export function deleteDraft(server: string, path: string): Promise<unknown> {
    return run('readwrite', (store) => store.delete(key(server, path)));
}

export async function getDraft(server: string, path: string): Promise<Draft | null> {
    return (await run<Draft>('readonly', (store) => store.get(key(server, path)) as IDBRequest<Draft>)) ?? null;
}

export async function listDrafts(server: string): Promise<Draft[]> {
    const all = (await run<Draft[]>('readonly', (store) => store.getAll() as IDBRequest<Draft[]>)) ?? [];

    return all.filter((draft) => draft.server === server);
}
