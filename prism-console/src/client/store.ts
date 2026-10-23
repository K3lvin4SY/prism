import { useSyncExternalStore } from 'react';
import { makeLine, type ConsoleLine, type Level } from './lib/lines';
import { PullTracker, type PullProgress } from './lib/pull';

export interface StatsSample {
    time: number;
    /** Percent of one core. */
    cpu: number;
    memory: number;
    disk: number;
    rx: number;
    tx: number;
}

/**
 * Everything PrismConsole keeps for one server while the person stays in the panel: the
 * console lines, the resource samples for the charts, and image pull progress. The feed in the
 * server layout fills it, so it keeps collecting while another server page shows.
 */
export class ServerConsoleStore {
    lines: ConsoleLine[] = [];
    counts: Record<Level, number> = { error: 0, warning: 0, info: 0, player: 0, debug: 0, system: 0 };
    samples: StatsSample[] = [];
    state: string | null = null;
    uptime = 0;
    pull = new PullTracker();
    pullProgress: PullProgress | null = null;
    /** The backlog from the logs endpoint has been added. */
    backlogLoaded = false;
    version = 0;
    private listeners = new Set<() => void>();
    private pending = false;

    constructor(public maxLines: number) {}

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
    };

    getVersion = () => this.version;

    /** Coalesces bursts of output into one render per frame. */
    private changed(): void {
        if (this.pending) return;
        this.pending = true;
        const flush = () => {
            this.pending = false;
            this.version++;
            this.listeners.forEach((listener) => listener());
        };
        typeof requestAnimationFrame === 'function' ? requestAnimationFrame(flush) : setTimeout(flush, 16);
    }

    push(data: string, system = false): void {
        for (const raw of data.replace(/\r\n/g, '\n').split('\n')) {
            if (raw === '' && !system) continue;
            if (this.pull.feed(raw)) {
                this.pullProgress = this.pull.snapshot();
            }

            const line = makeLine(raw, system);
            this.lines.push(line);
            this.counts[line.level]++;
        }
        this.trim();
        this.changed();
    }

    /** Older output fetched after live lines already arrived goes before them. */
    prepend(raws: string[]): void {
        const lines = raws.map((raw) => makeLine(raw, false, Date.now() - 1));
        lines.forEach((line) => this.counts[line.level]++);
        this.lines = [...lines, ...this.lines];
        this.backlogLoaded = true;
        this.trim();
        this.changed();
    }

    private trim(): void {
        const over = this.lines.length - this.maxLines;
        if (over <= 0) return;
        for (const line of this.lines.slice(0, over)) this.counts[line.level]--;
        this.lines = this.lines.slice(over);
    }

    clear(): void {
        this.lines = [];
        this.counts = { error: 0, warning: 0, info: 0, player: 0, debug: 0, system: 0 };
        this.changed();
    }

    sample(sample: StatsSample, state: string | null, uptime: number): void {
        this.samples = [...this.samples, sample].slice(-120);
        this.state = state;
        this.uptime = uptime;
        this.changed();
    }

    setState(state: string): void {
        this.state = state;
        this.changed();
    }

    dismissPull(): void {
        this.pullProgress = null;
        this.changed();
    }
}

const stores = new Map<string, ServerConsoleStore>();

export function storeFor(uuid: string, maxLines: number): ServerConsoleStore {
    let store = stores.get(uuid);
    if (!store) {
        store = new ServerConsoleStore(maxLines);
        stores.set(uuid, store);
    }

    return store;
}

/** Re-renders when the store changes and returns it. */
export function useStore(store: ServerConsoleStore): ServerConsoleStore {
    useSyncExternalStore(store.subscribe, store.getVersion);

    return store;
}
