import type { ExtensionConfig } from '@pterodactyl/sdk';

let config: ExtensionConfig = {};

export function setConfig(value: ExtensionConfig): void {
    config = value;
}

export function allowSnapshots(): boolean {
    return typeof config.allow_snapshots === 'boolean' ? config.allow_snapshots : true;
}
