import type { ProfileMode } from './api';

export interface Preset {
    game: 'Any game' | 'Minecraft' | 'Rust' | 'ARK' | 'Valheim' | 'Terraria';
    name: string;
    description: string;
    mode: ProfileMode;
    patterns: string[];
}

/** Starting points for a profile; each can be changed after it is picked. */
export const PRESETS: Preset[] = [
    { game: 'Any game', name: 'No logs or caches', description: 'Everything except logs, crash reports and caches.', mode: 'exclude', patterns: ['logs/', '*.log', 'crash-reports/', 'cache/', '.cache/', 'tmp/'] },
    { game: 'Any game', name: 'No archives', description: 'Leaves out zips and tarballs lying around, often old backups.', mode: 'exclude', patterns: ['*.zip', '*.tar', '*.tar.gz', '*.tgz', '*.7z', '*.rar'] },
    { game: 'Minecraft', name: 'Lean server', description: 'No logs, caches, libraries or server jars; they come back on start.', mode: 'exclude', patterns: ['logs/', 'crash-reports/', 'cache/', 'libraries/', 'versions/', '.fabric/', 'debug/', '*.log', '*.jar', '!plugins/**/*.jar', '!mods/**/*.jar'] },
    { game: 'Minecraft', name: 'Worlds only', description: 'The overworld, the Nether and the End.', mode: 'include', patterns: ['world', 'world_nether', 'world_the_end'] },
    { game: 'Minecraft', name: 'Plugins and settings', description: 'Plugins with their data, and the server\'s settings files.', mode: 'include', patterns: ['plugins', 'config', 'server.properties', 'bukkit.yml', 'spigot.yml', 'paper-global.yml', 'ops.json', 'whitelist.json', 'banned-players.json', 'banned-ips.json'] },
    { game: 'Minecraft', name: 'Mods and settings', description: 'Mods, their settings and the server\'s settings files.', mode: 'include', patterns: ['mods', 'config', 'defaultconfigs', 'kubejs', 'server.properties', 'ops.json', 'whitelist.json'] },
    { game: 'Rust', name: 'Saves and Oxide', description: 'The map and player saves, and Oxide plugins with their data.', mode: 'include', patterns: ['server', 'oxide', 'carbon'] },
    { game: 'Rust', name: 'No game files', description: 'Everything except the game itself, which reinstalls.', mode: 'exclude', patterns: ['RustDedicated_Data/', 'Bundles/', '*.log'] },
    { game: 'ARK', name: 'Saved data', description: 'Maps, players, tribes and settings.', mode: 'include', patterns: ['ShooterGame/Saved'] },
    { game: 'Valheim', name: 'Worlds', description: 'The world saves, local and legacy.', mode: 'include', patterns: ['.config/unity3d/IronGate/Valheim/worlds_local', '.config/unity3d/IronGate/Valheim/worlds'] },
    { game: 'Terraria', name: 'Worlds and settings', description: 'Worlds, the server config and TShock\'s data.', mode: 'include', patterns: ['saves', 'worlds', 'tshock', 'serverconfig.txt'] },
];

export const GAMES = ['All', ...new Set(PRESETS.map((preset) => preset.game))] as const;
