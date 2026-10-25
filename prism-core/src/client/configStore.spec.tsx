import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DRAFT_EVENT, createConfigStore, draftKey } from './configStore';

const read = (raw: Record<string, unknown>) => ({ search: raw.feature_search !== false, size: Number(raw.size ?? 13) });
const send = (extension: string, settings: Record<string, unknown>) => act(() => void window.dispatchEvent(new CustomEvent(DRAFT_EVENT, { detail: { extension, settings } })));

describe('createConfigStore', () => {
    afterEach(() => {
        window.name = '';
        window.sessionStorage.clear();
        Object.defineProperty(window, 'opener', { value: null, configurable: true });
    });

    it('holds just the saved settings outside the preview window', () => {
        const store = createConfigStore('prism-test', read);
        store.set({ feature_search: false });
        send('prism-test', { feature_search: true });

        expect(store.get()).toEqual({ search: false, size: 13 });
    });

    describe('in the preview window', () => {
        beforeEach(() => {
            window.name = 'prism-preview';
            Object.defineProperty(window, 'opener', { value: window, configurable: true });
        });

        it('lays a draft over the saved settings, and a backend refresh keeps it', () => {
            const store = createConfigStore('prism-test', read);
            store.set({ feature_search: true, size: 14 });
            send('prism-test', { feature_search: false });
            expect(store.get()).toEqual({ search: false, size: 14 });

            store.set({ feature_search: true, size: 16 });
            expect(store.get()).toEqual({ search: false, size: 16 });
        });

        it("ignores another extension's draft", () => {
            const store = createConfigStore('prism-test', read);
            store.set({ size: 14 });
            send('prism-other', { size: 20 });

            expect(store.get().size).toBe(14);
        });

        it('starts from the draft kept for an earlier page', () => {
            window.sessionStorage.setItem(draftKey('prism-test'), JSON.stringify({ size: 18 }));
            const store = createConfigStore('prism-test', read);
            store.set({ size: 14 });

            expect(store.get().size).toBe(18);
        });

        it('renders a live component again with each draft', () => {
            const store = createConfigStore('prism-test', read);
            store.set({});
            const Search = store.live(() => <p>{store.get().search ? 'search on' : 'search off'}</p>);
            render(<Search />);
            expect(screen.getByText('search on')).toBeTruthy();

            send('prism-test', { feature_search: false });
            expect(screen.getByText('search off')).toBeTruthy();
        });
    });
});
