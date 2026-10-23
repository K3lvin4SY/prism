import { useSyncExternalStore } from 'react';

export interface Tab {
    path: string;
    /** A preview tab is replaced by the next file opened with a single click. */
    preview: boolean;
}

/**
 * The editor's open tabs for one server. It lives outside React so the tabs survive switching
 * between the Files, Editor and Trash views, and between server pages.
 */
export class WorkbenchState {
    tabs: Tab[] = [];
    active: string | null = null;
    closed: string[] = [];
    dirty = new Set<string>();
    explorer = true;
    private listeners = new Set<() => void>();
    private version = 0;

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
    };

    getVersion = () => this.version;

    changed(): void {
        this.version++;
        this.listeners.forEach((listener) => listener());
    }

    open(path: string, preview = false): void {
        const existing = this.tabs.find((tab) => tab.path === path);
        if (existing) {
            if (!preview) existing.preview = false;
        } else {
            const previewIndex = this.tabs.findIndex((tab) => tab.preview && !this.dirty.has(tab.path));
            if (preview && previewIndex >= 0) this.tabs[previewIndex] = { path, preview: true };
            else this.tabs.push({ path, preview });
        }
        this.active = path;
        this.changed();
    }

    pin(path: string): void {
        const tab = this.tabs.find((item) => item.path === path);
        if (tab?.preview) {
            tab.preview = false;
            this.changed();
        }
    }

    close(path: string): void {
        const index = this.tabs.findIndex((tab) => tab.path === path);
        if (index < 0) return;
        this.tabs.splice(index, 1);
        this.closed = [path, ...this.closed.filter((item) => item !== path)].slice(0, 20);
        this.dirty.delete(path);
        if (this.active === path) this.active = this.tabs[Math.min(index, this.tabs.length - 1)]?.path ?? null;
        this.changed();
    }

    closeOthers(path: string): string[] {
        const closing = this.tabs.filter((tab) => tab.path !== path).map((tab) => tab.path);
        closing.forEach((item) => this.close(item));

        return closing;
    }

    reopen(): string | null {
        const path = this.closed.shift() ?? null;
        if (path) this.open(path);

        return path;
    }

    move(from: number, to: number): void {
        const [tab] = this.tabs.splice(from, 1);
        if (tab) this.tabs.splice(to, 0, tab);
        this.changed();
    }

    /** Follows a renamed or moved file. */
    renamed(from: string, to: string): void {
        for (const tab of this.tabs) {
            if (tab.path === from || tab.path.startsWith(from + '/')) tab.path = to + tab.path.slice(from.length);
        }
        if (this.active && (this.active === from || this.active.startsWith(from + '/'))) this.active = to + this.active.slice(from.length);
        this.changed();
    }

    setDirty(path: string, dirty: boolean): void {
        if (this.dirty.has(path) === dirty) return;
        dirty ? this.dirty.add(path) : this.dirty.delete(path);
        if (dirty) this.pin(path);
        this.changed();
    }
}

const states = new Map<string, WorkbenchState>();

export function workbenchFor(server: string): WorkbenchState {
    let state = states.get(server);
    if (!state) {
        state = new WorkbenchState();
        states.set(server, state);
    }

    return state;
}

export function useWorkbench(state: WorkbenchState): WorkbenchState {
    useSyncExternalStore(state.subscribe, state.getVersion);

    return state;
}
