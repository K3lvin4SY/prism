import { readRegion, type RegionSurface } from './anvil';
import RegionWorker from './regionWorker?worker';

/**
 * A few workers that read region files side by side, so the page stays smooth and several
 * regions are read at once. Where workers cannot start, files are read on the page instead.
 */

type Reply = { id: number; type: 'progress'; fraction: number } | { id: number; type: 'done'; surface: RegionSurface } | { id: number; type: 'error'; message: string };

interface Task {
    id: number;
    buffer: ArrayBuffer;
    dimension: string;
    onProgress?: (fraction: number) => void;
    resolve: (surface: RegionSurface) => void;
    reject: (error: Error) => void;
}

const SIZE = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));

const idle: Worker[] = [];
const busy = new Map<Worker, Task>();
const queue: Task[] = [];
let started = 0;
let broken = false;
let nextId = 1;

function finish(worker: Worker) {
    busy.delete(worker);
    idle.push(worker);
    next();
}

function spawn(): Worker | null {
    try {
        const worker = new RegionWorker();
        worker.onmessage = (event: MessageEvent<Reply>) => {
            const task = busy.get(worker);
            if (!task || event.data.id !== task.id) return;
            if (event.data.type === 'progress') return task.onProgress?.(event.data.fraction);
            if (event.data.type === 'done') task.resolve(event.data.surface);
            else task.reject(new Error(event.data.message));
            finish(worker);
        };
        // A worker that fails to load at all: read on the page from now on. Its task's bytes
        // went to the worker, so that task fails and the map asks for the file again.
        worker.onerror = (event) => {
            event.preventDefault();
            const task = busy.get(worker);
            busy.delete(worker);
            worker.terminate();
            broken = true;
            task?.reject(new Error('The map worker stopped.'));
            next();
        };

        return worker;
    } catch {
        broken = true;

        return null;
    }
}

function next() {
    while (queue.length > 0) {
        if (broken) {
            const task = queue.shift()!;
            readRegion(task.buffer, task.dimension, task.onProgress).then(task.resolve, task.reject);
            continue;
        }

        let worker = idle.pop();
        if (!worker && started < SIZE) {
            started++;
            worker = spawn() ?? undefined;
            if (!worker) continue;
        }
        if (!worker) return;

        const task = queue.shift()!;
        busy.set(worker, task);
        worker.postMessage({ id: task.id, buffer: task.buffer, dimension: task.dimension }, [task.buffer]);
    }
}

/** Reads a region file in a worker. The buffer is handed over and cannot be used afterwards. */
export function readRegionInWorker(buffer: ArrayBuffer, dimension: string, onProgress?: (fraction: number) => void): Promise<RegionSurface> {
    return new Promise((resolve, reject) => {
        queue.push({ id: nextId++, buffer, dimension, onProgress, resolve, reject });
        next();
    });
}
