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
