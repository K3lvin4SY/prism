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
add('scheme_switch', type='toggle', label='Light and dark switch', help='Lets people pick light or dark for themselves.', tab='Colours', default=True)

add('catppuccin', type='toggle', label='Use Catppuccin', help="Catppuccin's official colours for every surface, text, the console and the editor, in place of the colour above.", tab='Catppuccin', default=False, attribute='data-pt-ctp')
add('catppuccin_flavor', type='select', label='Flavour in dark mode', help='Light mode always uses Latte, the light flavour. Picking Latte here uses it in dark mode too.', tab='Catppuccin', options=flavours, default='mocha', attribute='data-pt-ctp-flavor')
add('catppuccin_accent', type='select', label='Accent', tab='Catppuccin', options={a: a.capitalize() for a in accents}, default='mauve', attribute='data-pt-ctp-accent')

add('bars', type='select', label='Navigation', tab='Bars', options={'sidebar': 'Sidebar', 'top': 'Top bar', 'dock': 'Dock', 'sidebar_top': 'Sidebar and top bar', 'rail': 'Icon rail', 'rail_top': 'Icon rail and top bar', 'top_dock': 'Top bar and dock'}, default='sidebar', attribute='data-pt-bars')
add('sidebar_width', type='number', label='Sidebar width', tab='Bars', default=16, min=12, max=22, step=1, unit='rem', token='--pt-sidebar-width')
add('dock_magnify', type='toggle', label='Dock icons grow under the pointer', tab='Bars', default=True, attribute='data-pt-magnify')
add('group_nav', type='toggle', label='Group the server pages', help="Splits a server's pages into Manage, Files and data, and Configuration.", tab='Bars', default=True)
add('server_card', type='toggle', label='Server card in the sidebar', help="The open server's status and power buttons above its pages.", tab='Bars', default=True)

add('cards', type='select', label='Server cards', tab='Cards', options={'banner': 'Banner', 'tile': 'Tile', 'neon': 'Neon', 'minimal': 'Minimal', 'compact': 'Compact', 'outline': 'Outline', 'rows': 'Rows'}, default='banner', attribute='data-pt-cards')
add('status_style', type='select', label='Status', tab='Cards', options={'badge': 'Badge', 'dot': 'Dot', 'bar': 'Coloured edge'}, default='badge', attribute='data-pt-status')
add('usage_style', type='select', label='Usage', tab='Cards', options={'bars': 'Bars', 'numbers': 'Numbers', 'hidden': 'Hidden'}, default='bars')
add('egg_colors', type='toggle', label='Colour cards by game', help='Each egg tag gets its own colour on the card.', tab='Cards', default=True)
add('power_buttons', type='toggle', label='Power buttons on cards', tab='Cards', default=True)
add('card_image', type='image', label='Card picture', help="Shown on Banner cards. Without one, a pattern in the game's colour.", tab='Cards', token='--pt-card-image')

add('radius', type='number', label='Corner rounding', tab='Shape', default=10, min=0, max=24, step=1, unit='px', token='--pt-radius')
add('density', type='select', label='Spacing', tab='Shape', options={'compact': 'Compact', 'cozy': 'Cozy', 'comfortable': 'Comfortable'}, default='cozy', attribute='data-pt-density')
add('width', type='select', label='Page width', tab='Shape', options={'normal': 'Normal', 'wide': 'Wide', 'full': 'Full width'}, default='normal', attribute='data-pt-width')
add('font', type='select', label='Font', tab='Shape', options={'plex': 'IBM Plex Sans', 'system': 'System', 'rounded': 'Rounded', 'serif': 'Serif', 'mono': 'Monospace'}, default='plex', attribute='data-pt-font')
add('font_size', type='number', label='Text size', tab='Shape', default=16, min=13, max=18, step=1, unit='px', token='--pt-font-size')

add('background', type='select', label='Background', tab='Background', options={'plain': 'Plain', 'gradient': 'Gradient', 'aurora': 'Aurora (moving)', 'waves': 'Waves (moving)', 'stars': 'Stars (moving)', 'mesh': 'Colour mesh (moving)', 'grid': 'Grid', 'image': 'Picture'}, default='gradient', attribute='data-pt-bg')
add('background_image', type='image', label='Background picture', help='Used when the background is Picture.', tab='Background', token='--pt-bg-image')
add('background_dim', type='number', label='Darken the picture', tab='Background', default=55, min=0, max=95, step=5, unit='%', token='--pt-bg-dim')
add('glass', type='toggle', label='Glass panels', help='Cards and bars let the background show through, blurred.', tab='Background', default=False, attribute='data-pt-glass')
add('blur', type='number', label='Glass blur', tab='Background', default=14, min=0, max=40, step=2, unit='px', token='--pt-blur')

add('motion', type='select', label='Motion', help='People who ask their system for less motion always get it.', tab='Motion', options={'full': 'Full', 'reduced': 'Reduced', 'none': 'None'}, default='full', attribute='data-pt-motion')

add('announce_text', type='text', label='Message', help='Empty shows no banner.', tab='Announcement', default='', maxLength=300)
add('announce_level', type='select', label='Kind', tab='Announcement', options={'info': 'Information', 'success': 'Good news', 'warning': 'Warning', 'danger': 'Problem'}, default='info')
add('announce_style', type='select', label='Style', tab='Announcement', options={'bar': 'Bar across the top', 'card': 'Card above the page'}, default='bar')
add('announce_audience', type='select', label='Shown to', tab='Announcement', options={'everyone': 'Everyone', 'admins': 'Administrators', 'users': 'Everyone but administrators'}, default='everyone')
add('announce_link', type='text', label='Button link', tab='Announcement', default='', maxLength=300)
add('announce_link_label', type='text', label='Button text', tab='Announcement', default='Read more', maxLength=40)
add('announce_from', type='text', label='Show from', help='A date and time such as 2026-11-01 08:00. Empty shows it now.', tab='Announcement', default='', maxLength=20)
add('announce_until', type='text', label='Show until', help='Empty shows it until you clear the message.', tab='Announcement', default='', maxLength=20)
add('announce_dismiss', type='toggle', label='People can close it', help='Closed stays closed in that browser until the message changes.', tab='Announcement', default=True)

for n in (1, 2, 3):
    add(f'link{n}_label', type='text', label=f'Link {n} text', tab='Links', default='', maxLength=40)
    add(f'link{n}_url', type='text', label=f'Link {n} address', help='Shown at the foot of the navigation, such as your Discord or store.' if n == 1 else None, tab='Links', default='', maxLength=300)

add('login_style', type='select', label='Sign-in page', tab='Sign-in', options={'split': 'Split with a picture', 'centered': 'Centred card', 'classic': "The panel's own"}, default='split', attribute='data-pt-login')
add('login_tagline', type='text', label='Tagline', tab='Sign-in', default='Your servers, in one place.', maxLength=120)
add('login_image', type='image', label='Sign-in picture', help='The picture beside the form. Without one, the background.', tab='Sign-in', token='--pt-login-image')

add('command_palette', type='toggle', label='Ctrl+K command palette', help='Jump to any server, page or setting from the keyboard.', tab='Advanced', default=True)
add('admin_styled', type='toggle', label='Style the admin area', help="Off keeps the admin area in the panel's own layout.", tab='Advanced', default=True)

for value in S.values():
    if value.get('help') is None:
        value.pop('help', None)

manifest = {
    '$schema': './node_modules/@pterodactyl/sdk/manifest.schema.json',
    'id': 'prism-themes', 'type': 'theme', 'name': 'Prism Themes', 'version': '0.1.0',
    'description': '16 looks, 30 colours, light and dark, seven navigation layouts, seven server card styles, moving backgrounds, announcements and a Ctrl+K palette. Edit it live in Prism Properties.',
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
