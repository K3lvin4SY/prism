import type { ExtensionConfig } from '@pterodactyl/sdk';

let config: ExtensionConfig = {};

export function setConfig(value: ExtensionConfig): void {
    config = value;
}

export function getConfig(): ExtensionConfig {
    return config;
}
