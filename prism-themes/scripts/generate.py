# Writes extension.json (the theme settings) and the built-in presets for Prism Properties
# (prism-extensions/src/client/themes/builtins.json). Run from prism-themes: python scripts/generate.py .
#
# A theme is one set of values for the settings below: two color palettes (dark and light) of
# the same roles, type and shape, surfaces, background and motion. A preset is a named set of
# those values, so built-in presets and people's own are made with the same tool.
import json, os, sys

root = sys.argv[1]
extensions = os.path.join(root, '..', 'prism-extensions', 'src', 'client', 'themes')

# role: (label, help, group)
ROLES = {
    'background': ('Background', 'Behind everything.', 'Surfaces'),
    'surface': ('Cards', 'Cards, panels and dialogs.', 'Surfaces'),
    'sidebar': ('Sidebar and bars', 'The navigation and top bars.', 'Surfaces'),
    'raised': ('Raised', 'Menus, hovered rows and quiet fills.', 'Surfaces'),
    'deep': ('Deep', 'Wells: the console, code and sunken areas.', 'Surfaces'),
    'border': ('Borders', 'Lines between things.', 'Lines and text'),
    'text': ('Text', None, 'Lines and text'),
    'muted_text': ('Quiet text', 'Descriptions and hints.', 'Lines and text'),
    'primary': ('Primary', 'Buttons, links, the active page.', 'Brand'),
    'on_primary': ('Text on color', 'Text on primary and the status colors.', 'Brand'),
    'success': ('Success', None, 'Status'),
    'warning': ('Warning', None, 'Status'),
    'danger': ('Danger', None, 'Status'),
    'red': ('Red', 'Errors in the console.', 'Code and console'),
    'green': ('Green', 'Strings and good news.', 'Code and console'),
    'yellow': ('Yellow', 'Types and warnings.', 'Code and console'),
    'blue': ('Blue', 'Functions.', 'Code and console'),
    'magenta': ('Magenta', 'Keywords.', 'Code and console'),
    'cyan': ('Cyan', 'Operators and info.', 'Code and console'),
}
MODES = {'d': 'Dark', 'l': 'Light'}


def num(value):
    text = f'{value:.4f}'.rstrip('0').rstrip('.')

    return text if text not in ('', '-0') else '0'


def ok(l, c, h):
    return f'oklch({num(l)} {num(c)} {num(h % 360)})'


def generated(hue, chroma, tint='subtle'):
    """A palette from one color, by the formulas the old Color setting used."""
    n = {'none': 0, 'subtle': chroma * 0.12, 'strong': chroma * 0.28}[tint]
    dark = {
        'background': ok(.165, n, hue), 'surface': ok(.205, n, hue), 'sidebar': ok(.185, n, hue), 'raised': ok(.25, n, hue), 'deep': ok(.145, n, hue),
        'border': ok(.3, n, hue), 'text': ok(.95, n * .3, hue), 'muted_text': ok(.72, n * 1.2, hue), 'primary': ok(.64, chroma, hue), 'on_primary': ok(.99, 0, 0),
        'success': ok(.72, .17, 150), 'warning': ok(.8, .15, 80), 'danger': ok(.65, .2, 25),
        'red': ok(.7, .17, 25), 'green': ok(.76, .15, 145), 'yellow': ok(.86, .13, 95), 'blue': ok(.72, .13, 250), 'magenta': ok(.72, .17, 330), 'cyan': ok(.78, .11, 200),
    }
    light = {
        'background': ok(.975, n, hue), 'surface': ok(1, 0, 0), 'sidebar': ok(.96, n, hue), 'raised': ok(.95, n, hue), 'deep': ok(.955, n, hue),
        'border': ok(.9, n, hue), 'text': ok(.21, n * .6, hue), 'muted_text': ok(.5, n * 1.2, hue), 'primary': ok(.56, chroma, hue), 'on_primary': ok(.99, 0, 0),
        'success': ok(.55, .15, 150), 'warning': ok(.68, .15, 70), 'danger': ok(.55, .21, 25),
        'red': ok(.55, .2, 25), 'green': ok(.55, .15, 145), 'yellow': ok(.62, .13, 85), 'blue': ok(.52, .15, 255), 'magenta': ok(.55, .2, 330), 'cyan': ok(.58, .1, 200),
    }

    return dark, light


# Catppuccin's official palette, https://catppuccin.com/palette.
CTP = {
    'latte': {'pink': '#ea76cb', 'mauve': '#8839ef', 'red': '#d20f39', 'peach': '#fe640b', 'yellow': '#df8e1d', 'green': '#40a02b', 'teal': '#179299', 'blue': '#1e66f5', 'text': '#4c4f69', 'subtext0': '#6c6f85', 'surface0': '#ccd0da', 'surface1': '#bcc0cc', 'base': '#eff1f5', 'mantle': '#e6e9ef', 'crust': '#dce0e8'},
    'frappe': {'pink': '#f4b8e4', 'mauve': '#ca9ee6', 'red': '#e78284', 'peach': '#ef9f76', 'yellow': '#e5c890', 'green': '#a6d189', 'teal': '#81c8be', 'blue': '#8caaee', 'text': '#c6d0f5', 'subtext0': '#a5adce', 'surface0': '#414559', 'surface1': '#51576d', 'base': '#303446', 'mantle': '#292c3c', 'crust': '#232634'},
    'macchiato': {'pink': '#f5bde6', 'mauve': '#c6a0f6', 'red': '#ed8796', 'peach': '#f5a97f', 'yellow': '#eed49f', 'green': '#a6da95', 'teal': '#8bd5ca', 'blue': '#8aadf4', 'text': '#cad3f5', 'subtext0': '#a5adcb', 'surface0': '#363a4f', 'surface1': '#494d64', 'base': '#24273a', 'mantle': '#1e2030', 'crust': '#181926'},
    'mocha': {'pink': '#f5c2e7', 'mauve': '#cba6f7', 'red': '#f38ba8', 'peach': '#fab387', 'yellow': '#f9e2af', 'green': '#a6e3a1', 'teal': '#94e2d5', 'blue': '#89b4fa', 'text': '#cdd6f4', 'subtext0': '#a6adc8', 'surface0': '#313244', 'surface1': '#45475a', 'base': '#1e1e2e', 'mantle': '#181825', 'crust': '#11111b'},
}


def catppuccin(flavour):
    """Each role from the Catppuccin style guide: base behind, mantle and crust for panes."""
    c = CTP[flavour]

    return {
        'background': c['base'], 'surface': c['mantle'], 'sidebar': c['crust'], 'raised': c['surface0'], 'deep': c['crust'],
        'border': c['surface0'], 'text': c['text'], 'muted_text': c['subtext0'], 'primary': c['mauve'], 'on_primary': c['crust'],
        'success': c['green'], 'warning': c['yellow'], 'danger': c['red'],
        'red': c['red'], 'green': c['green'], 'yellow': c['yellow'], 'blue': c['blue'], 'magenta': c['pink'], 'cyan': c['teal'],
    }


def colors(dark, light):
    return {**{f'd_{role}': value for role, value in dark.items()}, **{f'l_{role}': value for role, value in light.items()}}


BASE = {'radius': 10, 'font': 'plex', 'font_size': 16, 'switches': 'rounded', 'surface_style': 'raised', 'blur': 14, 'opacity': 70, 'background': 'gradient', 'background_dim': 55, 'motion': 'full'}

PRESETS = [
    {'id': 'studio', 'name': 'Studio', 'description': 'Blue, with soft shadows and a gradient behind.', 'values': {**colors(*generated(255, .17)), **BASE}},
    {'id': 'studio-classic', 'name': 'Studio classic', 'description': 'Indigo and flat, close to the panel you know.', 'values': {**colors(*generated(270, .17)), **BASE, 'radius': 6, 'surface_style': 'flat', 'background': 'plain'}},
    {'id': 'terminal', 'name': 'Terminal', 'description': 'Green on black, monospace and square.', 'values': {**colors(*generated(145, .17, 'strong')), **BASE, 'radius': 2, 'font': 'mono', 'surface_style': 'outlined', 'background': 'grid', 'switches': 'square'}},
    *[
        {'id': f'catppuccin-{flavour}', 'name': f'Catppuccin {label}', 'description': 'The light flavour in light and dark mode.' if flavour == 'latte' else f'Catppuccin {label} in dark mode, Latte in light mode.',
         'values': {**colors(catppuccin(flavour), catppuccin('latte')), **BASE, 'radius': 12, 'surface_style': 'flat', 'background': 'plain'}}
        for flavour, label in [('mocha', 'Mocha'), ('macchiato', 'Macchiato'), ('frappe', 'Frappé'), ('latte', 'Latte')]
    ],
]

STUDIO = PRESETS[0]['values']
S = {}


def add(key, **kw):
    if kw.get('help') is None:
        kw.pop('help', None)
    S[key] = kw


for mode, mode_label in MODES.items():
    for role, (label, help_text, group) in ROLES.items():
        add(f'{mode}_{role}', type='color', label=f'{label} ({mode_label.lower()})', help=help_text, tab=f'{mode_label} colors', default=STUDIO[f'{mode}_{role}'], token=f"--pt-{mode}-{role.replace('_', '-')}")

add('radius', type='number', label='Corner rounding', tab='Type and shape', default=STUDIO['radius'], min=0, max=24, step=1, unit='px', token='--pt-radius')
add('font', type='select', label='Font', tab='Type and shape', options={'plex': 'IBM Plex Sans', 'system': 'System', 'rounded': 'Rounded', 'serif': 'Serif', 'mono': 'Monospace'}, default=STUDIO['font'], attribute='data-pt-font')
add('font_size', type='number', label='Text size', tab='Type and shape', default=STUDIO['font_size'], min=13, max=18, step=1, unit='px', token='--pt-font-size')
add('switches', type='select', label='Switches', help='The shape of every Prism switch, such as Files, Editor and Trash. Square follows the corner rounding.', tab='Type and shape', options={'rounded': 'Rounded', 'square': 'Square'}, default=STUDIO['switches'], attribute='data-pt-switches')

add('surface_style', type='select', label='Cards and bars', help='How cards, menus and bars stand out from the background.', tab='Surfaces', options={'flat': 'Flat', 'raised': 'Soft shadow', 'outlined': 'Outlined', 'glow': 'Glow', 'glass': 'Glass'}, default=STUDIO['surface_style'], attribute='data-pt-surface')
add('blur', type='number', label='Glass blur', help='For Glass.', tab='Surfaces', default=STUDIO['blur'], min=0, max=40, step=2, unit='px', token='--pt-blur')
add('opacity', type='number', label='Glass solidity', help='For Glass: how much of the card color covers what is behind.', tab='Surfaces', default=STUDIO['opacity'], min=30, max=100, step=5, unit='%', token='--pt-opacity')

add('background', type='select', label='Background', tab='Background', options={'plain': 'Plain', 'gradient': 'Gradient', 'aurora': 'Aurora (moving)', 'waves': 'Waves (moving)', 'stars': 'Stars (moving)', 'mesh': 'Color mesh (moving)', 'grid': 'Grid', 'image': 'Picture'}, default=STUDIO['background'], attribute='data-pt-bg')
add('background_image', type='image', label='Background picture', help='Used when the background is Picture.', tab='Background', token='--pt-bg-image')
add('background_dim', type='number', label='Darken the picture', tab='Background', default=STUDIO['background_dim'], min=0, max=95, step=5, unit='%', token='--pt-bg-dim')

add('motion', type='select', label='Motion', help='People who ask their system for less motion always get it.', tab='Motion', options={'full': 'Full', 'reduced': 'Reduced', 'none': 'None'}, default=STUDIO['motion'], attribute='data-pt-motion')

# Bookkeeping for Prism Properties: written to nothing on the page.
add('preset', type='text', label='Preset', help='The preset these values came from.', tab='Presets', default='Studio', maxLength=80)
add('presets', type='text', label='Your presets', help='Presets made in Prism Properties.', tab='Presets', default='[]', maxLength=200000)

manifest = {
    '$schema': './node_modules/@pterodactyl/sdk/manifest.schema.json',
    'id': 'prism-themes', 'type': 'theme', 'name': 'Prism Themes', 'version': '0.2.0',
    'description': 'One theme tool: colors for dark and light, type and shape, surfaces, backgrounds and motion, with built-in presets such as Catppuccin and your own. The layout is Prism Layout.',
    'author': 'Donkare', 'icon': 'palette',
    'requires': {'panel': '^2.0.0-dev', 'sdk': '>=2.0.0-beta.6 <3.0'},
    'ui': {'entry': 'dist/client.js'},
    'theme': {'extends': 'classic', 'stylesheet': 'dist/theme.css', 'schemes': ['dark', 'light'], 'settings': S},
}
open(os.path.join(root, 'extension.json'), 'w', encoding='utf8').write(json.dumps(manifest, indent=4, ensure_ascii=False) + '\n')

roles = [{'key': role, 'label': label, 'help': help_text, 'group': group} for role, (label, help_text, group) in ROLES.items()]
open(os.path.join(extensions, 'builtins.json'), 'w', encoding='utf8').write(json.dumps({'roles': roles, 'presets': PRESETS}, indent=2, ensure_ascii=False) + '\n')

print(len(S), 'settings,', len(PRESETS), 'presets')
