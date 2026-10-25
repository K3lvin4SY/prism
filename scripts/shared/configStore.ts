import { createElement, useSyncExternalStore, type ComponentType } from 'react';
import type { ExtensionConfig } from '@pterodactyl/sdk';

/*
 * An extension's settings as a store, with Prism Core's live preview built in.
 *
 * Prism Core opens the real panel in a window named `prism-preview` and passes each editor's
 * unsaved settings on to the page there as a `prism-preview:draft` event, keeping the last one
 * in sessionStorage so it survives moving between pages. Here, a draft for this extension is
 * laid over its saved settings and every component wrapped with `live` renders again. Anywhere
 * else there is no draft, and the store holds just the saved settings.
 */

export const PREVIEW_WINDOW = 'prism-preview';
export const DRAFT_EVENT = 'prism-preview:draft';
export const draftKey = (extension: string) => `prism-preview:${extension}`;

type Settings = Record<string, unknown>;

/** Whether this page is Prism Core's preview window. */
export const inPreview = (): boolean => typeof window !== 'undefined' && window.name === PREVIEW_WINDOW && !!window.opener;

const isSettings = (value: unknown): value is Settings => !!value && typeof value === 'object' && !Array.isArray(value);

/** The draft for an extension kept in the preview window, or nothing. */
export function readDraft(extension: string): Settings {
    if (!inPreview()) return {};
    try {
        const value: unknown = JSON.parse(window.sessionStorage.getItem(draftKey(extension)) ?? '{}');

        return isSettings(value) ? value : {};
    } catch {
        return {};
    }
}

/** Calls back with each draft for this extension, in the preview window only. */
export function onDraft(extension: string, callback: (settings: Settings) => void): void {
    if (!inPreview()) return;
    window.addEventListener(DRAFT_EVENT, (event) => {
        const detail = (event as CustomEvent<{ extension?: string; settings?: unknown }>).detail;
        if (detail?.extension === extension && isSettings(detail.settings)) callback(detail.settings);
    });
}

export interface ConfigStore<T> {
    /** The saved settings, from setup or a backend response; a draft stays laid over them. */
    set(raw: ExtensionConfig): void;
    get(): T;
    /** The settings in a component, which renders again when a draft changes them. */
    use(): T;
    /** A component that renders again, with everything inside it, when a draft changes the settings. */
    live<P extends object>(component: ComponentType<P>): ComponentType<P>;
    /** `live` for a lazily loaded module's default export, keeping the module's type. */
    liveModule<M extends { default: ComponentType<never> }>(module: M): M;
}

export function createConfigStore<T>(extension: string, read: (raw: ExtensionConfig) => T): ConfigStore<T> {
    let saved: Settings = {};
    let draft = readDraft(extension);
    let value = read({ ...draft } as ExtensionConfig);
    const listeners = new Set<() => void>();

    const compute = () => {
        value = read({ ...saved, ...draft } as ExtensionConfig);
        listeners.forEach((listener) => listener());
    };

    onDraft(extension, (settings) => {
        draft = settings;
        compute();
    });

    const subscribe = (listener: () => void) => {
        listeners.add(listener);

        return () => listeners.delete(listener);
    };
    const get = () => value;
    const use = () => useSyncExternalStore(subscribe, get, get);

    const live = <P extends object>(component: ComponentType<P>): ComponentType<P> => {
        function Live(props: P) {
            use();

            return createElement(component, props);
        }
        Live.displayName = `Live(${component.displayName ?? component.name ?? 'Component'})`;

        return Live;
    };

    return {
        set(raw) {
            saved = { ...(raw as Settings) };
            compute();
        },
        get,
        use,
        live,
        liveModule: <M extends { default: ComponentType<never> }>(module: M): M => ({ ...module, default: live(module.default as ComponentType<object>) }) as M,
    };
}
