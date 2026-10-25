import type { ExtensionConfig } from '@pterodactyl/sdk';
import { createConfigStore } from './configStore';

/** The settings, with Prism Core's live preview draft over them in its preview window. */
export const configStore = createConfigStore('prism-mc', (raw: ExtensionConfig): ExtensionConfig => raw);

export function setConfig(value: ExtensionConfig): void {
    configStore.set(value);
}

/** A switch from Prism Properties; on until the admin turns it off. */
const on = (key: string) => (typeof configStore.get()[key] === 'boolean' ? (configStore.get()[key] as boolean) : true);

export function allowSnapshots(): boolean {
    return configStore.get().allow_snapshots === true;
}

/** Whether the admin shows a server tab, such as `players` or `modpacks`. */
export const tabEnabled = (tab: string) => on(`tab_${tab}`);

export type Feature = 'crossplay' | 'proxy' | 'skins' | 'patchbukkit';

export const featureEnabled = (feature: Feature) => on(`feature_${feature}`);

/** The egg tags that mark a Minecraft server, from Prism Properties; minecraft unless the admin changed them. */
export function eggTags(): string[] {
    const tags = (typeof configStore.get().egg_tags === 'string' ? (configStore.get().egg_tags as string) : '')
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);

    return tags.length > 0 ? tags : ['minecraft'];
}
