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

/** A signed upload URL is good for 15 minutes; it is used for 10. */
export const URL_LIFETIME = 10 * 60_000;
/** Folder listings are refreshed at most this often while uploads finish. */
export const REFRESH_DELAY = 1500;

class UploadRejected extends Error {
    constructor(
        readonly status: number,
        message: string
    ) {
        super(message);
    }
}

/**
 * The upload queue: files go to the node through signed upload URLs a few at a time, with
 * progress, retry and cancel. Folders dropped on the page keep their structure.
 *
 * The Panel limits API requests a minute, so a big upload asks it as little as possible: one
 * signed URL serves every file until it is near its expiry, and the folders that got files are
 * refreshed together rather than after each file.
 */
export class UploadQueue {
    uploads: Upload[] = [];
    private requests = new Map<number, XMLHttpRequest>();
    private listeners = new Set<() => void>();
    private nextId = 1;
    private version = 0;
    private signed: { url: Promise<string>; at: number } | null = null;
    private touched = new Set<string>();
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;

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

    private requeue(upload: Upload): void {
        upload.status = 'queued';
        upload.loaded = 0;
        upload.error = undefined;
    }

    retry(id: number): void {
        const upload = this.uploads.find((item) => item.id === id);
        if (!upload) return;
        this.requeue(upload);
        this.changed();
        this.pump();
    }

    /** Puts every failed upload back in the queue. */
    retryFailed(): void {
        const failed = this.uploads.filter((upload) => upload.status === 'failed');
        if (failed.length === 0) return;
        failed.forEach((upload) => this.requeue(upload));
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

    /** The signed URL, shared by every upload while it is fresh. */
    private uploadUrl(): Promise<string> {
        if (this.signed && Date.now() - this.signed.at < URL_LIFETIME) return this.signed.url;

        const url = http.get<{ attributes: { url: string } }>(`/api/client/servers/${this.server}/files/upload`).then(({ data }) => data.attributes.url);
        const signed = { url, at: Date.now() };
        this.signed = signed;
        url.catch(() => {
            if (this.signed === signed) this.signed = null;
        });

        return url;
    }

    private post(upload: Upload, signedUrl: string): Promise<void> {
        const url = new URL(signedUrl);
        url.searchParams.set('directory', upload.directory);

        return new Promise<void>((resolve, reject) => {
            const request = new XMLHttpRequest();
            this.requests.set(upload.id, request);
            request.open('POST', url.toString());
            request.upload.onprogress = (event) => {
                upload.loaded = event.loaded;
                this.changed();
            };
            request.onload = () =>
                request.status >= 200 && request.status < 300 ? resolve() : reject(new UploadRejected(request.status, request.responseText.slice(0, 200) || `HTTP ${request.status}`));
            request.onerror = () => reject(new Error('The upload was interrupted.'));
            request.onabort = () => reject(new Error('cancelled'));
            const form = new FormData();
            form.append('files', upload.file, upload.file.name);
            request.send(form);
        });
    }

    private async send(upload: Upload): Promise<void> {
        upload.status = 'uploading';
        this.changed();

        try {
            const url = await this.uploadUrl();
            try {
                await this.post(upload, url);
            } catch (error) {
                // The node no longer takes the URL: get a new one and try once more.
                if (!(error instanceof UploadRejected) || (error.status !== 401 && error.status !== 403)) throw error;
                if (this.signed && (await this.signed.url.catch(() => null)) === url) this.signed = null;
                upload.loaded = 0;
                await this.post(upload, await this.uploadUrl());
            }

            upload.status = 'done';
            upload.loaded = upload.size;
            this.touch(upload.directory);
        } catch (error) {
            if ((upload.status as Upload['status']) !== 'cancelled') {
                upload.status = 'failed';
                upload.error = error instanceof Error ? error.message : String(error);
            }
        } finally {
            this.requests.delete(upload.id);
            this.changed();
            this.pump();
            if (!this.uploads.some((item) => item.status === 'uploading' || item.status === 'queued')) this.refresh();
        }
    }

    /** Notes a folder that got a file; the listings are refreshed shortly, all together. */
    private touch(directory: string): void {
        this.touched.add(directory);
        this.refreshTimer ??= setTimeout(() => this.refresh(), REFRESH_DELAY);
    }

    private refresh(): void {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
        const directories = [...this.touched];
        this.touched.clear();
        directories.forEach((directory) => this.onFinished(directory));
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
