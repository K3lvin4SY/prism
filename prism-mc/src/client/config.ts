import type { ExtensionConfig } from '@pterodactyl/sdk';

let config: ExtensionConfig = {};

export function setConfig(value: ExtensionConfig): void {
    config = value;
}

/** A switch from Prism Properties; on until the admin turns it off. */
const on = (key: string) => (typeof config[key] === 'boolean' ? (config[key] as boolean) : true);

export function allowSnapshots(): boolean {
    return on('allow_snapshots');
}

/** Whether the admin shows a server tab, such as `players` or `modpacks`. */
export const tabEnabled = (tab: string) => on(`tab_${tab}`);

export type Feature = 'crossplay' | 'proxy' | 'skins' | 'patchbukkit';

export const featureEnabled = (feature: Feature) => on(`feature_${feature}`);

/** The egg tags that mark a Minecraft server, from Prism Properties; minecraft unless the admin changed them. */
export function eggTags(): string[] {
    const tags = (typeof config.egg_tags === 'string' ? config.egg_tags : '')
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);

    return tags.length > 0 ? tags : ['minecraft'];
}
