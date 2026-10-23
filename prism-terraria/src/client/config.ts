import type { ExtensionConfig } from '@pterodactyl/sdk';

let config: ExtensionConfig = {};

export function setConfig(value: ExtensionConfig): void {
    config = value;
}

export function getConfig(): ExtensionConfig {
    return config;
}

/** Whether the admin shows a server tab, such as `players` or `world`; on until turned off in Prism Properties. */
export function tabEnabled(tab: string): boolean {
    const value = config[`tab_${tab}`];

    return typeof value === 'boolean' ? value : true;
}
