import { useSyncExternalStore } from 'react';
import { http } from '@pterodactyl/sdk';
import { dirname, join } from './paths';

export interface Upload {
    id: number;
    name: string;
    /** The folder it goes into. */
    directory: string;
    size: number;
    loaded: number;
    status: 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled';
    error?: string;
    file: File;
}

/**
 * The upload queue: files go to the node through signed upload URLs a few at a time, with
 * progress, retry and cancel. Folders dropped on the page keep their structure.
 */
export class UploadQueue {
    uploads: Upload[] = [];
    private requests = new Map<number, XMLHttpRequest>();
    private listeners = new Set<() => void>();
    private nextId = 1;
    private version = 0;

    constructor(
        private readonly server: string,
        private readonly parallel: () => number,
        private readonly onFinished: (directory: string) => void
    ) {}

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
    };

    getVersion = () => this.version;

    private changed(): void {
        this.version++;
        this.listeners.forEach((listener) => listener());
    }

    /** Adds files; `relative` keeps a dropped folder's structure, like "world/region/r.0.0.mca". */
    add(files: { file: File; relative?: string }[], directory: string): void {
        for (const { file, relative } of files) {
            const target = relative ? dirname(join(directory, relative)) : directory;
            this.uploads.push({ id: this.nextId++, name: relative ?? file.name, directory: target, size: file.size, loaded: 0, status: 'queued', file });
        }
        this.changed();
        this.pump();
    }

    retry(id: number): void {
        const upload = this.uploads.find((item) => item.id === id);
        if (!upload) return;
        upload.status = 'queued';
        upload.loaded = 0;
        upload.error = undefined;
        this.changed();
        this.pump();
    }

    cancel(id: number): void {
        const upload = this.uploads.find((item) => item.id === id);
        if (!upload) return;
        this.requests.get(id)?.abort();
        upload.status = 'cancelled';
        this.changed();
        this.pump();
    }

    clearFinished(): void {
        this.uploads = this.uploads.filter((upload) => upload.status === 'queued' || upload.status === 'uploading');
        this.changed();
    }

    private pump(): void {
        const running = this.uploads.filter((upload) => upload.status === 'uploading').length;
        const next = this.uploads.filter((upload) => upload.status === 'queued').slice(0, Math.max(0, this.parallel() - running));
        next.forEach((upload) => void this.send(upload));
    }

    private async send(upload: Upload): Promise<void> {
        upload.status = 'uploading';
        this.changed();

        try {
            const { data } = await http.get<{ attributes: { url: string } }>(`/api/client/servers/${this.server}/files/upload`);
            const url = new URL(data.attributes.url);
            url.searchParams.set('directory', upload.directory);

            await new Promise<void>((resolve, reject) => {
                const request = new XMLHttpRequest();
                this.requests.set(upload.id, request);
                request.open('POST', url.toString());
                request.upload.onprogress = (event) => {
                    upload.loaded = event.loaded;
                    this.changed();
                };
                request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(request.responseText.slice(0, 200) || `HTTP ${request.status}`)));
                request.onerror = () => reject(new Error('The upload was interrupted.'));
                request.onabort = () => reject(new Error('cancelled'));
                const form = new FormData();
                form.append('files', upload.file, upload.file.name);
                request.send(form);
            });

            upload.status = 'done';
            upload.loaded = upload.size;
            this.onFinished(upload.directory);
        } catch (error) {
            if ((upload.status as Upload['status']) !== 'cancelled') {
                upload.status = 'failed';
                upload.error = error instanceof Error ? error.message : String(error);
            }
        } finally {
            this.requests.delete(upload.id);
            this.changed();
            this.pump();
        }
    }
}

export function useQueue(queue: UploadQueue): Upload[] {
    useSyncExternalStore(queue.subscribe, queue.getVersion);

    return queue.uploads;
}

/** Reads a drop: plain files, or folders walked through the entries API. */
export async function readDrop(transfer: DataTransfer): Promise<{ file: File; relative?: string }[]> {
    const entries = [...transfer.items].map((item) => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => !!entry);
    if (entries.length === 0) return [...transfer.files].map((file) => ({ file }));

    const files: { file: File; relative?: string }[] = [];
    const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
        if (entry.isFile) {
            const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
            files.push({ file, relative: prefix ? `${prefix}/${file.name}` : undefined });
        } else if (entry.isDirectory) {
            const reader = (entry as FileSystemDirectoryEntry).createReader();
            let batch: FileSystemEntry[];
            do {
                batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
                for (const child of batch) await walk(child, prefix ? `${prefix}/${entry.name}` : entry.name);
            } while (batch.length > 0);
        }
    };

    for (const entry of entries) await walk(entry, '');

    return files;
}
