/** The colours, as hue and strength, so swatches can be drawn here; prism-themes/scripts/generate.py has the same table. */
export const PALETTES: Record<string, [string, number, number]> = {
    blue: ['Blue', 255, 0.17], indigo: ['Indigo', 270, 0.17], violet: ['Violet', 287, 0.19], purple: ['Purple', 302, 0.2],
    fuchsia: ['Fuchsia', 322, 0.21], pink: ['Pink', 350, 0.18], rose: ['Rose', 12, 0.19], red: ['Red', 25, 0.2],
    crimson: ['Crimson', 18, 0.23], coral: ['Coral', 35, 0.15], orange: ['Orange', 52, 0.18], peach: ['Peach', 55, 0.1],
    amber: ['Amber', 72, 0.16], gold: ['Gold', 85, 0.13], yellow: ['Yellow', 98, 0.16], lime: ['Lime', 125, 0.18],
    green: ['Green', 145, 0.17], forest: ['Forest', 150, 0.1], emerald: ['Emerald', 162, 0.15], mint: ['Mint', 172, 0.1],
    teal: ['Teal', 185, 0.12], cyan: ['Cyan', 208, 0.12], sky: ['Sky', 232, 0.14], ocean: ['Ocean', 242, 0.12],
    cobalt: ['Cobalt', 264, 0.21], lavender: ['Lavender', 292, 0.1], slate: ['Slate', 255, 0.035], zinc: ['Zinc', 285, 0.012],
    stone: ['Stone', 60, 0.016], graphite: ['Graphite', 250, 0.004],
};

export const swatch = (palette: string) => {
    const entry = PALETTES[palette];

    return entry ? `oklch(0.62 ${entry[2]} ${entry[1]})` : 'var(--primary)';
};

export interface Look {
    id: string;
    name: string;
    description: string;
    settings: Record<string, unknown>;
    /** Background, surface and accent colours for the picture, when they are fixed. */
    swatch?: { base: string; surface: string; accent: string };
}

export const CATPPUCCIN_FLAVOURS = { latte: 'Latte', frappe: 'Frappé', macchiato: 'Macchiato', mocha: 'Mocha' } as const;

/** Catppuccin's official base, surface0 and mauve for each flavour. */
export const CATPPUCCIN: Record<keyof typeof CATPPUCCIN_FLAVOURS, { base: string; surface: string; accent: string }> = {
    latte: { base: '#eff1f5', surface: '#ccd0da', accent: '#8839ef' },
    frappe: { base: '#303446', surface: '#414559', accent: '#ca9ee6' },
    macchiato: { base: '#24273a', surface: '#363a4f', accent: '#c6a0f6' },
    mocha: { base: '#1e1e2e', surface: '#313244', accent: '#cba6f7' },
};

/** Catppuccin Mocha's accents, for the accent picker. */
export const CATPPUCCIN_ACCENTS: Record<string, string> = {
    rosewater: '#f5e0dc', flamingo: '#f2cdcd', pink: '#f5c2e7', mauve: '#cba6f7', red: '#f38ba8', maroon: '#eba0ac', peach: '#fab387',
    yellow: '#f9e2af', green: '#a6e3a1', teal: '#94e2d5', sky: '#89dceb', sapphire: '#74c7ec', blue: '#89b4fa', lavender: '#b4befe',
};

const base = { catppuccin: false, tint: 'subtle', bars: 'sidebar', cards: 'banner', radius: 10, density: 'cozy', width: 'normal', font: 'plex', background: 'gradient', glass: false, motion: 'full', status_style: 'badge', usage_style: 'bars' };

/** A finished design: picking one sets the settings that make it, which can be changed after. */
export const LOOKS: Look[] = [
    { id: 'studio', name: 'Studio', description: 'Sidebar, banner cards, a soft gradient.', settings: { ...base, look: 'studio', palette: 'blue' } },
    { id: 'studio_classic', name: 'Studio classic', description: 'A top bar and tiles, close to the panel you know.', settings: { ...base, look: 'studio_classic', palette: 'indigo', bars: 'top', cards: 'tile', radius: 6, background: 'plain' } },
    { id: 'rail', name: 'Icon rail', description: 'A slim rail of icons and compact cards.', settings: { ...base, look: 'rail', palette: 'violet', bars: 'rail', cards: 'compact', radius: 12 } },
    { id: 'wide', name: 'Wide and grouped', description: 'Grouped sidebar, a top bar and the whole width.', settings: { ...base, look: 'wide', palette: 'sky', bars: 'sidebar_top', width: 'wide', cards: 'rows', group_nav: true } },
    { id: 'command', name: 'Command center', description: 'Dense: rail, top bar, small cards, full width.', settings: { ...base, look: 'command', palette: 'emerald', bars: 'rail_top', density: 'compact', cards: 'compact', font: 'system', width: 'full', usage_style: 'numbers', status_style: 'dot' } },
    { id: 'mono', name: 'Monochrome', description: 'Greys only, outlined cards.', settings: { ...base, look: 'mono', palette: 'graphite', tint: 'none', cards: 'outline', background: 'plain' } },
    { id: 'contrast', name: 'High contrast', description: 'Strong borders and text, for easy reading.', settings: { ...base, look: 'contrast', palette: 'yellow', tint: 'none', cards: 'outline', background: 'plain', status_style: 'badge' } },
    { id: 'glass', name: 'Glass', description: 'Frosted panels over a moving aurora.', settings: { ...base, look: 'glass', palette: 'violet', glass: true, background: 'aurora', cards: 'tile', radius: 16 } },
    { id: 'paper', name: 'Paper', description: 'Warm, light and quiet, with a serif font.', settings: { ...base, look: 'paper', palette: 'stone', tint: 'none', bars: 'top', cards: 'minimal', font: 'serif', background: 'plain' } },
    { id: 'midnight', name: 'Midnight', description: 'Deep blue with twinkling stars.', settings: { ...base, look: 'midnight', palette: 'cobalt', background: 'stars', tint: 'strong' } },
    { id: 'neon', name: 'Neon', description: 'Glowing cards on a grid, with a dock.', settings: { ...base, look: 'neon', palette: 'fuchsia', bars: 'dock', cards: 'neon', background: 'grid' } },
    { id: 'soft', name: 'Soft', description: 'Round corners, a rounded font and plenty of room.', settings: { ...base, look: 'soft', palette: 'lavender', bars: 'top_dock', cards: 'tile', radius: 20, font: 'rounded', density: 'comfortable' } },
    { id: 'terminal', name: 'Terminal', description: 'Monospace, square and green.', settings: { ...base, look: 'terminal', palette: 'green', font: 'mono', radius: 2, cards: 'outline', background: 'grid', tint: 'strong', status_style: 'dot', usage_style: 'numbers' } },
    { id: 'sunset', name: 'Sunset', description: 'Orange waves rolling along the bottom.', settings: { ...base, look: 'sunset', palette: 'orange', background: 'waves', tint: 'strong' } },
    { id: 'forest', name: 'Forest', description: 'Green tiles and a calm gradient.', settings: { ...base, look: 'forest', palette: 'forest', cards: 'tile', tint: 'strong' } },
    { id: 'ocean', name: 'Ocean', description: 'Blue waves under glass.', settings: { ...base, look: 'ocean', palette: 'ocean', background: 'waves', glass: true } },
    { id: 'glassmorphism', name: 'Glassmorphism', description: 'See-through, blurred panels with light edges over a moving colour mesh.', settings: { ...base, look: 'glassmorphism', palette: 'violet', background: 'mesh', glass: true, blur: 20, radius: 18, cards: 'tile', bars: 'sidebar' } },
    ...(['mocha', 'macchiato', 'frappe', 'latte'] as const).map((flavor) => ({
        id: `catppuccin-${flavor}`,
        name: `Catppuccin ${CATPPUCCIN_FLAVOURS[flavor]}`,
        description: flavor === 'latte' ? 'The light flavour, in light and dark mode alike.' : `Catppuccin's official ${CATPPUCCIN_FLAVOURS[flavor]} colours; light mode uses Latte.`,
        settings: { ...base, look: 'catppuccin', catppuccin: true, catppuccin_flavor: flavor, catppuccin_accent: 'mauve', palette: 'violet', background: 'plain', radius: 12, cards: 'tile' },
        swatch: CATPPUCCIN[flavor],
    })),
];
