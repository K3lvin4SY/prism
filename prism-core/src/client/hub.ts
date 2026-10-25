import { DRAFT_EVENT, draftKey, inPreview } from './configStore';

/** The messages between Prism Properties and its preview window. */
export const PREVIEW_MESSAGE = 'prism-preview';
export const READY_MESSAGE = 'prism-preview:ready';

/**
 * In the preview window Prism Properties opens: take each extension's draft from the editor,
 * keep it for the window's later pages, and pass it on to the page. Every Prism extension
 * listens there for its own (configStore.ts). Then tell the editor this page is ready, so it
 * sends the drafts again after each page load.
 */
export function startPreviewHub(): void {
    if (!inPreview()) return;
    const editor = window.opener as Window;

    window.addEventListener('message', (event: MessageEvent) => {
        if (event.origin !== window.location.origin || event.source !== editor) return;
        const data = event.data as { type?: string; extension?: unknown; settings?: unknown } | null;
        if (data?.type !== PREVIEW_MESSAGE || typeof data.extension !== 'string' || !data.settings || typeof data.settings !== 'object') return;

        try {
            window.sessionStorage.setItem(draftKey(data.extension), JSON.stringify(data.settings));
        } catch {
            // Kept for this page only.
        }
        window.dispatchEvent(new CustomEvent(DRAFT_EVENT, { detail: { extension: data.extension, settings: data.settings } }));
    });

    try {
        editor.postMessage({ type: READY_MESSAGE }, window.location.origin);
    } catch {
        // The editor has gone; the saved settings show.
    }
}
