/**
 * Where item pictures come from. Rendered inventory icons (3D blocks) come first; plain item
 * and block textures are the fallbacks. Mods have no public icons, so they get a placeholder.
 */

/** The newest version the rendered-icon site has. */
const NEWEST_RENDERED = '1.21.11';

function iconVersion(version: string | null | undefined): string {
    // Releases from 26.1 on are numbered by year; the icon sites stop before them.
    return version && /^1\.\d+(\.\d+)?$/.test(version) ? version : NEWEST_RENDERED;
}

export function itemIconUrls(id: string, version: string | null | undefined): string[] {
    const [namespace, name] = id.includes(':') ? id.split(':', 2) : ['minecraft', id];
    if (namespace !== 'minecraft' || !/^[a-z0-9_]+$/.test(name)) return [];

    const v = iconVersion(version);

    return [
        `https://mc.nerothe.com/img/${v}/minecraft_${name}.png`,
        `https://assets.mcasset.cloud/${v}/assets/minecraft/textures/item/${name}.png`,
        `https://assets.mcasset.cloud/${v}/assets/minecraft/textures/block/${name}.png`,
    ];
}
