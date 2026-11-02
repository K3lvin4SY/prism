import type { ExtensionConfig } from '@pterodactyl/sdk';
import { createConfigStore } from './configStore';

/** Prism Nodes keeps all its settings on the server; the browser needs none of them. */
export type NodesConfig = Record<string, never>;

export function read(_raw: ExtensionConfig): NodesConfig {
    return {};
}

/** The settings, with Prism Core's live preview draft over them in its preview window. */
export const configStore = createConfigStore('prism-nodes', read);

export function setConfig(raw: ExtensionConfig): void {
    configStore.set(raw);
}

export function getConfig(): NodesConfig {
    return configStore.get();
}
