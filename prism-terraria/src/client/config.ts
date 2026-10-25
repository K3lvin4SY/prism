import type { ExtensionConfig } from '@pterodactyl/sdk';
import { createConfigStore } from './configStore';

/** The settings, with Prism Core's live preview draft over them in its preview window. */
export const configStore = createConfigStore('prism-terraria', (raw: ExtensionConfig): ExtensionConfig => raw);

export function setConfig(value: ExtensionConfig): void {
    configStore.set(value);
}

export function getConfig(): ExtensionConfig {
    return configStore.get();
}

/** Whether the admin shows a server tab, such as `players` or `world`; on until turned off in Prism Properties. */
export function tabEnabled(tab: string): boolean {
    const value = configStore.get()[`tab_${tab}`];

    return typeof value === 'boolean' ? value : true;
}

/** The egg tags that mark a Terraria server, from Prism Properties; terraria and tria unless the admin changed them. */
export function eggTags(): string[] {
    const tags = (typeof configStore.get().egg_tags === 'string' ? (configStore.get().egg_tags as string) : '')
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);

    return tags.length > 0 ? tags : ['terraria', 'tria'];
}
