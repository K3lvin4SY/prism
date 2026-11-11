/**
 * Drawn map regions kept in the browser (IndexedDB) between visits, one picture per server,
 * dimension and region. Saving a region replaces its earlier picture.
 */

const DATABASE = 'prism-mc-map';
const STORE = 'regions';

export interface StoredRegion {
    key: string;
    server: string;
    dimension: string;
    /** When the region file was last saved, as the Panel reported it when this picture was drawn. */
    modified: string | null;
    /** Which drawing code made it; see DRAW_VERSION in mapTiles.ts. */
    version: number;
    image: Blob;
    /** A 128px picture for zoomed-out views; pictures kept before it existed have none. */
    thumb?: Blob;
    drawnAt: number;
}

export const regionKey = (server: string, dimension: string, x: number, z: number) => `${server}:${dimension}:${x}:${z}`;

let opening: Promise<IDBDatabase | null> | null = null;

/** The database, or null where the browser has none (private windows in some browsers). */
function open(): Promise<IDBDatabase | null> {
    opening ??= new Promise((resolve) => {
        try {
            const request = indexedDB.open(DATABASE, 1);
            request.onupgradeneeded = () => {
                const store = request.result.createObjectStore(STORE, { keyPath: 'key' });
                store.createIndex('area', ['server', 'dimension']);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
        } catch {
            resolve(null);
        }
    });

    return opening;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
    return open().then(
        (database) =>
            new Promise<T | null>((resolve) => {
                if (!database) return resolve(null);
                try {
                    const transaction = database.transaction(STORE, mode);
                    const request = work(transaction.objectStore(STORE));
                    transaction.oncomplete = () => resolve(request ? request.result : null);
                    transaction.onerror = () => resolve(null);
                    transaction.onabort = () => resolve(null);
                } catch {
                    resolve(null);
                }
            })
    );
}

export async function loadRegion(key: string): Promise<StoredRegion | null> {
    return (await run<StoredRegion | undefined>('readonly', (store) => store.get(key))) ?? null;
}

/** Every picture kept for one dimension of a server, read in one go. */
export async function loadArea(server: string, dimension: string): Promise<StoredRegion[]> {
    return (await run<StoredRegion[]>('readonly', (store) => store.index('area').getAll(IDBKeyRange.only([server, dimension])))) ?? [];
}

/** Stores a newly drawn region in place of the one drawn before. */
export async function saveRegion(region: StoredRegion): Promise<void> {
    await run('readwrite', (store) => store.put(region));
}

/** Removes the pictures of regions the world no longer has. */
export async function pruneRegions(server: string, dimension: string, keep: Set<string>): Promise<void> {
    await run('readwrite', (store) => {
        const request = store.index('area').openKeyCursor(IDBKeyRange.only([server, dimension]));
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            if (!keep.has(String(cursor.primaryKey))) store.delete(cursor.primaryKey);
            cursor.continue();
        };
    });
}
