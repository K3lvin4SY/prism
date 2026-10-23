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
}
S = {}


def add(key, **kw):
    S[key] = kw


add('look', type='select', label='Look', help='The finished design the rest builds on. Prism Properties sets the other settings to match when you pick one.', tab='Look', options=looks, default='studio', attribute='data-pt-look')

add('palette', type='select', label='Colour', tab='Colours', options={**{k: v[0] for k, v in palettes.items()}, 'custom': 'Custom'}, default='blue', attribute='data-pt-palette')
add('accent', type='color', label='Custom colour', help='Used when the colour is Custom.', tab='Colours', default='#6366f1', token='--pt-accent')
add('tint', type='select', label='Tint the greys', help='How much of the colour the backgrounds and borders take on.', tab='Colours', options={'none': 'None', 'subtle': 'Subtle', 'strong': 'Strong'}, default='subtle', attribute='data-pt-tint')
add('scheme_switch', type='toggle', label='Light and dark switch', help='Lets people pick light or dark for themselves.', tab='Colours', default=True)

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

add('background', type='select', label='Background', tab='Background', options={'plain': 'Plain', 'gradient': 'Gradient', 'aurora': 'Aurora (moving)', 'waves': 'Waves (moving)', 'stars': 'Stars (moving)', 'grid': 'Grid', 'image': 'Picture'}, default='gradient', attribute='data-pt-bg')
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
print(len(S), 'settings', len(palettes), 'palettes', len(looks), 'looks')
