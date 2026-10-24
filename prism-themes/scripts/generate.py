# Writes extension.json (the theme settings) and src/palettes.css. Run from prism-themes: python scripts/generate.py .
import json, sys, os

root = sys.argv[1]
# name: (label, hue, chroma)
palettes = {
    'blue': ('Blue', 255, .17), 'indigo': ('Indigo', 270, .17), 'violet': ('Violet', 287, .19), 'purple': ('Purple', 302, .2),
    'fuchsia': ('Fuchsia', 322, .21), 'pink': ('Pink', 350, .18), 'rose': ('Rose', 12, .19), 'red': ('Red', 25, .2),
    'crimson': ('Crimson', 18, .23), 'coral': ('Coral', 35, .15), 'orange': ('Orange', 52, .18), 'peach': ('Peach', 55, .1),
    'amber': ('Amber', 72, .16), 'gold': ('Gold', 85, .13), 'yellow': ('Yellow', 98, .16), 'lime': ('Lime', 125, .18),
    'green': ('Green', 145, .17), 'forest': ('Forest', 150, .1), 'emerald': ('Emerald', 162, .15), 'mint': ('Mint', 172, .1),
    'teal': ('Teal', 185, .12), 'cyan': ('Cyan', 208, .12), 'sky': ('Sky', 232, .14), 'ocean': ('Ocean', 242, .12),
    'cobalt': ('Cobalt', 264, .21), 'lavender': ('Lavender', 292, .1), 'slate': ('Slate', 255, .035), 'zinc': ('Zinc', 285, .012),
    'stone': ('Stone', 60, .016), 'graphite': ('Graphite', 250, .004),
}
looks = {
    'studio': 'Studio', 'studio_classic': 'Studio classic', 'rail': 'Icon rail', 'wide': 'Wide and grouped', 'command': 'Command center',
    'mono': 'Monochrome', 'contrast': 'High contrast', 'glass': 'Glass', 'paper': 'Paper', 'midnight': 'Midnight', 'neon': 'Neon',
    'soft': 'Soft', 'terminal': 'Terminal', 'sunset': 'Sunset', 'forest': 'Forest', 'ocean': 'Ocean',
    'catppuccin': 'Catppuccin', 'glassmorphism': 'Glassmorphism',
}

# Catppuccin's official palette, https://catppuccin.com/palette: every colour of each flavour.
catppuccin = {
    'latte': {'rosewater': '#dc8a78', 'flamingo': '#dd7878', 'pink': '#ea76cb', 'mauve': '#8839ef', 'red': '#d20f39', 'maroon': '#e64553', 'peach': '#fe640b', 'yellow': '#df8e1d', 'green': '#40a02b', 'teal': '#179299', 'sky': '#04a5e5', 'sapphire': '#209fb5', 'blue': '#1e66f5', 'lavender': '#7287fd', 'text': '#4c4f69', 'subtext1': '#5c5f77', 'subtext0': '#6c6f85', 'overlay2': '#7c7f93', 'overlay1': '#8c8fa1', 'overlay0': '#9ca0b0', 'surface2': '#acb0be', 'surface1': '#bcc0cc', 'surface0': '#ccd0da', 'base': '#eff1f5', 'mantle': '#e6e9ef', 'crust': '#dce0e8'},
    'frappe': {'rosewater': '#f2d5cf', 'flamingo': '#eebebe', 'pink': '#f4b8e4', 'mauve': '#ca9ee6', 'red': '#e78284', 'maroon': '#ea999c', 'peach': '#ef9f76', 'yellow': '#e5c890', 'green': '#a6d189', 'teal': '#81c8be', 'sky': '#99d1db', 'sapphire': '#85c1dc', 'blue': '#8caaee', 'lavender': '#babbf1', 'text': '#c6d0f5', 'subtext1': '#b5bfe2', 'subtext0': '#a5adce', 'overlay2': '#949cbb', 'overlay1': '#838ba7', 'overlay0': '#737994', 'surface2': '#626880', 'surface1': '#51576d', 'surface0': '#414559', 'base': '#303446', 'mantle': '#292c3c', 'crust': '#232634'},
    'macchiato': {'rosewater': '#f4dbd6', 'flamingo': '#f0c6c6', 'pink': '#f5bde6', 'mauve': '#c6a0f6', 'red': '#ed8796', 'maroon': '#ee99a0', 'peach': '#f5a97f', 'yellow': '#eed49f', 'green': '#a6da95', 'teal': '#8bd5ca', 'sky': '#91d7e3', 'sapphire': '#7dc4e4', 'blue': '#8aadf4', 'lavender': '#b7bdf8', 'text': '#cad3f5', 'subtext1': '#b8c0e0', 'subtext0': '#a5adcb', 'overlay2': '#939ab7', 'overlay1': '#8087a2', 'overlay0': '#6e738d', 'surface2': '#5b6078', 'surface1': '#494d64', 'surface0': '#363a4f', 'base': '#24273a', 'mantle': '#1e2030', 'crust': '#181926'},
    'mocha': {'rosewater': '#f5e0dc', 'flamingo': '#f2cdcd', 'pink': '#f5c2e7', 'mauve': '#cba6f7', 'red': '#f38ba8', 'maroon': '#eba0ac', 'peach': '#fab387', 'yellow': '#f9e2af', 'green': '#a6e3a1', 'teal': '#94e2d5', 'sky': '#89dceb', 'sapphire': '#74c7ec', 'blue': '#89b4fa', 'lavender': '#b4befe', 'text': '#cdd6f4', 'subtext1': '#bac2de', 'subtext0': '#a6adc8', 'overlay2': '#9399b2', 'overlay1': '#7f849c', 'overlay0': '#6c7086', 'surface2': '#585b70', 'surface1': '#45475a', 'surface0': '#313244', 'base': '#1e1e2e', 'mantle': '#181825', 'crust': '#11111b'},
}
flavours = {'latte': 'Latte', 'frappe': 'Frappé', 'macchiato': 'Macchiato', 'mocha': 'Mocha'}
accents = ['rosewater', 'flamingo', 'pink', 'mauve', 'red', 'maroon', 'peach', 'yellow', 'green', 'teal', 'sky', 'sapphire', 'blue', 'lavender']
S = {}

def add(key, **kw):
    S[key] = kw

add('look', type='select', label='Look', help='The finished design the rest builds on. Prism Properties sets the other settings to match when you pick one.', tab='Look', options=looks, default='studio', attribute='data-pt-look')

add('palette', type='select', label='Colour', tab='Colours', options={**{k: v[0] for k, v in palettes.items()}, 'custom': 'Custom'}, default='blue', attribute='data-pt-palette')
add('accent', type='color', label='Custom colour', help='Used when the colour is Custom.', tab='Colours', default='#6366f1', token='--pt-accent')
add('tint', type='select', label='Tint the greys', help='How much of the colour the backgrounds and borders take on.', tab='Colours', options={'none': 'None', 'subtle': 'Subtle', 'strong': 'Strong'}, default='subtle', attribute='data-pt-tint')

add('catppuccin', type='toggle', label='Use Catppuccin', help="Catppuccin's official colours for every surface, text, the console and the editor, in place of the colour above.", tab='Catppuccin', default=False, attribute='data-pt-ctp')
add('catppuccin_flavor', type='select', label='Flavour in dark mode', help='Light mode always uses Latte, the light flavour. Picking Latte here uses it in dark mode too.', tab='Catppuccin', options=flavours, default='mocha', attribute='data-pt-ctp-flavor')
add('catppuccin_accent', type='select', label='Accent', tab='Catppuccin', options={a: a.capitalize() for a in accents}, default='mauve', attribute='data-pt-ctp-accent')

add('radius', type='number', label='Corner rounding', tab='Shape', default=10, min=0, max=24, step=1, unit='px', token='--pt-radius')
add('font', type='select', label='Font', tab='Shape', options={'plex': 'IBM Plex Sans', 'system': 'System', 'rounded': 'Rounded', 'serif': 'Serif', 'mono': 'Monospace'}, default='plex', attribute='data-pt-font')
add('font_size', type='number', label='Text size', tab='Shape', default=16, min=13, max=18, step=1, unit='px', token='--pt-font-size')
add('switches', type='select', label='Switches', help='The shape of every Prism switch, such as Files, Editor and Trash. Square follows the corner rounding above.', tab='Shape', options={'rounded': 'Rounded', 'square': 'Square'}, default='rounded', attribute='data-pt-switches')

add('background', type='select', label='Background', tab='Background', options={'plain': 'Plain', 'gradient': 'Gradient', 'aurora': 'Aurora (moving)', 'waves': 'Waves (moving)', 'stars': 'Stars (moving)', 'mesh': 'Colour mesh (moving)', 'grid': 'Grid', 'image': 'Picture'}, default='gradient', attribute='data-pt-bg')
add('background_image', type='image', label='Background picture', help='Used when the background is Picture.', tab='Background', token='--pt-bg-image')
add('background_dim', type='number', label='Darken the picture', tab='Background', default=55, min=0, max=95, step=5, unit='%', token='--pt-bg-dim')
add('glass', type='toggle', label='Glass panels', help='Cards and bars let the background show through, blurred.', tab='Background', default=False, attribute='data-pt-glass')
add('blur', type='number', label='Glass blur', tab='Background', default=14, min=0, max=40, step=2, unit='px', token='--pt-blur')

add('motion', type='select', label='Motion', help='People who ask their system for less motion always get it.', tab='Motion', options={'full': 'Full', 'reduced': 'Reduced', 'none': 'None'}, default='full', attribute='data-pt-motion')

for value in S.values():
    if value.get('help') is None:
        value.pop('help', None)

manifest = {
    '$schema': './node_modules/@pterodactyl/sdk/manifest.schema.json',
    'id': 'prism-themes', 'type': 'theme', 'name': 'Prism Themes', 'version': '0.1.0',
    'description': '16 looks, 30 colours, Catppuccin, light and dark, fonts, glass and moving backgrounds. The layout is Prism Layout. Edit it live in Prism Properties.',
    'author': 'Donkare', 'icon': 'palette',
    'requires': {'panel': '^2.0.0-dev', 'sdk': '>=2.0.0-beta.6 <3.0'},
    'ui': {'entry': 'dist/client.js'},
    'theme': {'extends': 'classic', 'stylesheet': 'dist/theme.css', 'schemes': ['dark', 'light'], 'settings': S},
}
open(os.path.join(root, 'extension.json'), 'w', encoding='utf8').write(json.dumps(manifest, indent=4) + '\n')

css = ['/* Generated from the palette table in scripts/generate.py (python scripts/generate.py .): the hue and strength of each colour. */']
for k, (label, h, c) in palettes.items():
    css.append(f"[data-pt-palette='{k}'] {{ --pt-h: {h}; --pt-c: {c}; }}")
open(os.path.join(root, 'src', 'palettes.css'), 'w', encoding='utf8').write('\n'.join(css) + '\n')
ctp = ['/* Generated by scripts/generate.py from Catppuccin\'s official palette (https://catppuccin.com/palette). */']
for flavour, colours in catppuccin.items():
    body = ' '.join(f'--ctp-{name}: {value};' for name, value in colours.items())
    if flavour == 'latte':
        # Light mode is always Latte; dark mode is Latte only when it is picked.
        ctp.append(f"[data-pt-ctp='true'].light, [data-pt-ctp='true'][data-pt-ctp-flavor='latte'].dark {{ {body} }}")
    else:
        ctp.append(f"[data-pt-ctp='true'][data-pt-ctp-flavor='{flavour}'].dark {{ {body} }}")
for accent in accents:
    ctp.append(f"[data-pt-ctp='true'][data-pt-ctp-accent='{accent}'] {{ --ctp-accent: var(--ctp-{accent}); }}")
# The terminal's black and white follow the official ports: Latte inverts them.
ctp.append("""
[data-pt-ctp='true'].dark:not([data-pt-ctp-flavor='latte']) {
    --ctp-term-black: var(--ctp-surface1);
    --ctp-term-bright-black: var(--ctp-surface2);
    --ctp-term-white: var(--ctp-subtext1);
    --ctp-term-bright-white: var(--ctp-subtext0);
}

[data-pt-ctp='true'].light,
[data-pt-ctp='true'][data-pt-ctp-flavor='latte'].dark {
    --ctp-term-black: var(--ctp-subtext1);
    --ctp-term-bright-black: var(--ctp-subtext0);
    --ctp-term-white: var(--ctp-surface2);
    --ctp-term-bright-white: var(--ctp-surface1);
}

/* Each role of the panel, from the Catppuccin style guide: base behind, mantle and crust for panes.
   :root makes these win over the looks, which come later in the stylesheet. */
:root[data-pt-ctp='true'].dark,
:root[data-pt-ctp='true'].light {
    --background: var(--ctp-base);
    --foreground: var(--ctp-text);
    --card: var(--ctp-mantle);
    --card-foreground: var(--ctp-text);
    --popover: var(--ctp-surface0);
    --popover-foreground: var(--ctp-text);
    --muted: var(--ctp-surface0);
    --muted-foreground: var(--ctp-subtext0);
    --secondary: var(--ctp-surface1);
    --secondary-foreground: var(--ctp-text);
    --sunken: var(--ctp-crust);
    --border: var(--ctp-surface0);
    --input: var(--ctp-mantle);
    --input-border: var(--ctp-surface1);
    --primary: var(--ctp-accent);
    --primary-foreground: var(--ctp-crust);
    --accent: var(--ctp-accent);
    --accent-foreground: var(--ctp-crust);
    --ring: color-mix(in srgb, var(--ctp-accent) 60%, transparent);
    --destructive: var(--ctp-red);
    --destructive-foreground: var(--ctp-crust);
    --success: var(--ctp-green);
    --success-foreground: var(--ctp-crust);
    --warning: var(--ctp-yellow);
    --warning-foreground: var(--ctp-crust);
    --caution: var(--ctp-peach);
    --caution-foreground: var(--ctp-crust);
    --chart-1: var(--ctp-blue);
    --chart-2: var(--ctp-green);
    --chart-3: var(--ctp-peach);
    --chart-4: var(--ctp-mauve);
    --chart-5: var(--ctp-teal);
    --sidebar: var(--ctp-crust);
    --sidebar-foreground: var(--ctp-text);
    --sidebar-border: var(--ctp-surface0);
    --sidebar-accent: var(--ctp-surface0);
    --sidebar-accent-foreground: var(--ctp-text);
    --sidebar-primary: var(--ctp-accent);
    --sidebar-primary-foreground: var(--ctp-crust);
    --selection: color-mix(in srgb, var(--ctp-overlay2) 30%, transparent);
    --selection-foreground: var(--ctp-text);
    --scrollbar-track: var(--ctp-crust);
    --scrollbar-thumb: var(--ctp-surface1);
    --scrollbar-thumb-fill: var(--ctp-surface2);
    --terminal-background: var(--ctp-crust);
    --terminal-foreground: var(--ctp-text);
    --terminal-cursor: var(--ctp-rosewater);
    --terminal-selection: color-mix(in srgb, var(--ctp-overlay2) 30%, transparent);
    --terminal-selection-foreground: var(--ctp-text);
    --terminal-ansi-black: var(--ctp-term-black);
    --terminal-ansi-red: var(--ctp-red);
    --terminal-ansi-green: var(--ctp-green);
    --terminal-ansi-yellow: var(--ctp-yellow);
    --terminal-ansi-blue: var(--ctp-blue);
    --terminal-ansi-magenta: var(--ctp-pink);
    --terminal-ansi-cyan: var(--ctp-teal);
    --terminal-ansi-white: var(--ctp-term-white);
    --terminal-ansi-bright-black: var(--ctp-term-bright-black);
    --terminal-ansi-bright-red: var(--ctp-red);
    --terminal-ansi-bright-green: var(--ctp-green);
    --terminal-ansi-bright-yellow: var(--ctp-yellow);
    --terminal-ansi-bright-blue: var(--ctp-blue);
    --terminal-ansi-bright-magenta: var(--ctp-pink);
    --terminal-ansi-bright-cyan: var(--ctp-teal);
    --terminal-ansi-bright-white: var(--ctp-term-bright-white);
    --editor-background: var(--ctp-base);
    --editor-foreground: var(--ctp-text);
    --editor-caret: var(--ctp-rosewater);
    --editor-active-line: color-mix(in srgb, var(--ctp-surface0) 50%, transparent);
    --editor-selection: color-mix(in srgb, var(--ctp-overlay2) 30%, transparent);
    --editor-selected-foreground: var(--ctp-text);
    --editor-muted: var(--ctp-overlay1);
    --editor-border: var(--ctp-surface0);
    --editor-tooltip: var(--ctp-surface0);
    --editor-tooltip-border: var(--ctp-surface1);
    --editor-search-match: color-mix(in srgb, var(--ctp-yellow) 30%, transparent);
    --editor-search-match-selected: color-mix(in srgb, var(--ctp-peach) 45%, transparent);
    --editor-syntax-keyword: var(--ctp-mauve);
    --editor-syntax-string: var(--ctp-green);
    --editor-syntax-function: var(--ctp-blue);
    --editor-syntax-constant: var(--ctp-peach);
    --editor-syntax-type: var(--ctp-yellow);
    --editor-syntax-operator: var(--ctp-sky);
    --editor-syntax-definition: var(--ctp-blue);
    --editor-syntax-name: var(--ctp-lavender);
    --editor-syntax-invalid: var(--ctp-red);
}
""")
open(os.path.join(root, 'src', 'catppuccin.css'), 'w', encoding='utf8').write('\n'.join(ctp) + '\n')

print(len(S), 'settings', len(palettes), 'palettes', len(looks), 'looks')
