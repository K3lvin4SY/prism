# Writes extension.json (the theme settings) and the built-in presets for Prism Properties
# (prism-core/src/client/themes/builtins.json). Run from prism-themes: python scripts/generate.py .
#
# A theme is one set of values for the settings below: two color palettes (dark and light) of
# the same roles, type and shape, surfaces, background and motion. A preset is a named set of
# those values, so built-in presets and people's own are made with the same tool.
import json, os, sys

root = sys.argv[1]
extensions = os.path.join(root, '..', 'prism-core', 'src', 'client', 'themes')

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


STOPS = 5
SPEED = dict(type='number', label='Speed', min=25, max=200, step=25, default=100)
FADE = dict(type='select', label='Fade', options={'top': 'Toward the bottom', 'edges': 'Toward the edges', 'none': 'No fade'}, default='top')
# Where a radial or angular gradient is centred: option => CSS position.
POSITIONS = {'top-left': '0% 0%', 'top': '50% 0%', 'top-right': '100% 0%', 'left': '0% 50%', 'center': '50% 50%', 'right': '100% 50%', 'bottom-left': '0% 100%', 'bottom': '50% 100%', 'bottom-right': '100% 100%'}

# Each background's settings shared by dark and light mode, shown under the gallery when it is
# chosen. Numbers are tokens (--pt-bg-<kind>-<name>), selects and toggles <html> attributes.
BACKGROUND = {
    'gradient': {
        'type': dict(type='select', label='Type', options={'linear': 'Linear', 'radial': 'Radial', 'conic': 'Angular'}, default='radial'),
        'angle': dict(type='number', label='Angle', min=0, max=359, step=1, unit='deg', default=180),
        'center': dict(type='select', label='Center', options={key: key.replace('-', ' ').capitalize() for key in POSITIONS}, default='top-left'),
    },
    'grid': {
        'size': dict(type='number', label='Cell size', min=8, max=128, step=4, unit='px', default=32),
        'width': dict(type='number', label='Line width', min=1, max=4, step=1, unit='px', default=1),
        'fade': FADE,
    },
    'dots': {
        'size': dict(type='number', label='Spacing', min=8, max=96, step=4, unit='px', default=24),
        'dot': dict(type='number', label='Dot size', min=1, max=8, step=1, unit='px', default=2),
        'fade': FADE,
    },
    'aurora': {
        'size': dict(type='number', label='Size', min=30, max=90, step=5, unit='vmax', default=60),
        'speed': SPEED,
    },
    'stars': {
        'density': dict(type='number', label='How many', min=1, max=6, step=1, default=3),
        'size': dict(type='number', label='Star size', min=50, max=250, step=25, default=100),
        'twinkle': dict(type='toggle', label='Twinkle', help='Stars fade in and out slowly.', default=True),
    },
    'image': {
        'fit': dict(type='select', label='Fill', options={'cover': 'Cover the page', 'tile': 'Repeat'}, default='cover'),
        'blur': dict(type='number', label='Blur', min=0, max=24, step=1, unit='px', default=0),
    },
}
# Each background's colors, one per mode (bg_<mode>_<kind>[_<name>]), any color with its opacity.
# The gradient's stops are colors and positions of their own, below.
MODE_COLORS = {'grid': {'': 'Line color'}, 'dots': {'': 'Dot color'}, 'aurora': {'1': 'First color', '2': 'Second color', '3': 'Third color'}, 'stars': {'': 'Star color'}}
BG_SHARED = {f'bg_{kind}_{name}': spec['default'] for kind, params in BACKGROUND.items() for name, spec in params.items()}


def tint(color, alpha):
    """A palette color with an opacity, in the panel's color syntax."""
    if color.startswith('#'):
        return color[:7] + ('' if alpha >= 1 else f'{round(alpha * 255):02x}')

    return color if alpha >= 1 else f'{color[:-1]} / {num(alpha)})'


def background_colors(dark, light):
    """The background colors a preset starts with, made from its palette."""
    out = {}
    for mode, palette in (('d', dark), ('l', light)):
        weight = 1 if mode == 'd' else .7
        stops = [(tint(palette['primary'], .22 * weight), 0), (tint(palette['primary'], 0), 70)]
        out[f'bg_{mode}_gradient_stops'] = len(stops)
        for index in range(1, STOPS + 1):
            color, at = stops[min(index, len(stops)) - 1]
            out[f'bg_{mode}_gradient_{index}'] = color
            out[f'bg_{mode}_gradient_{index}_at'] = at
        out[f'bg_{mode}_grid'] = tint(palette['text'], .06)
        out[f'bg_{mode}_dots'] = tint(palette['text'], .16)
        out[f'bg_{mode}_aurora_1'] = tint(palette['primary'], .35 * weight)
        out[f'bg_{mode}_aurora_2'] = tint(palette['blue'], .3 * weight)
        out[f'bg_{mode}_aurora_3'] = tint(palette['cyan'], .22 * weight)
        out[f'bg_{mode}_stars'] = tint(palette['text'], .7)

    return out


BASE = {'radius': 10, 'font': 'plex', 'labels': 'sans', 'font_size': 16, 'switches': 'rounded', 'surface_style': 'raised', 'blur': 14, 'opacity': 70, 'background': 'gradient', 'background_dim': 55, **BG_SHARED, 'motion': 'full'}


def look(dark, light, **changes):
    """A preset's values: its palettes, the base look with background colors made from them, and its changes."""
    return {**colors(dark, light), **BASE, **background_colors(dark, light), **changes}


# Prism Slate: the look of Prism's own pictures. Deep navy behind near-black cards, periwinkle for
# the brand, Inter for text and JetBrains Mono for the small labels.
SLATE_DARK = {
    'background': '#1a2340', 'surface': '#0d111f', 'sidebar': '#121830', 'raised': '#222b4d', 'deep': '#0a0d18',
    'border': '#2c355a', 'text': '#f5f7ff', 'muted_text': '#aeb7d9', 'primary': '#98adfe', 'on_primary': '#0d111f',
    'success': '#4ade80', 'warning': '#fcc864', 'danger': '#ff6b81',
    'red': '#ff6b81', 'green': '#4ade80', 'yellow': '#fcc864', 'blue': '#98adfe', 'magenta': '#d6a4ff', 'cyan': '#67e8f9',
}
SLATE_LIGHT = {
    'background': '#eef1fb', 'surface': '#ffffff', 'sidebar': '#e5e9f8', 'raised': '#e3e8f8', 'deep': '#dfe4f5',
    'border': '#cfd6ef', 'text': '#141a33', 'muted_text': '#5b6488', 'primary': '#4f63d8', 'on_primary': '#ffffff',
    'success': '#15934a', 'warning': '#b7791f', 'danger': '#d23a55',
    'red': '#d23a55', 'green': '#15934a', 'yellow': '#a16207', 'blue': '#4f63d8', 'magenta': '#9b4fd8', 'cyan': '#0e7490',
}

# Prism Slate first: it is the look a new panel starts with.
PRESETS = [
    {'id': 'prism-slate', 'name': 'Prism Slate', 'description': "Prism's own look: navy and periwinkle, Inter, monospace labels.",
     'values': look(SLATE_DARK, SLATE_LIGHT, radius=14, font='inter', labels='mono', surface_style='raised', background='plain')},
    {'id': 'studio', 'name': 'Studio', 'description': 'Blue, with soft shadows and a gradient behind.', 'values': look(*generated(255, .17))},
    {'id': 'studio-classic', 'name': 'Studio classic', 'description': 'Indigo and flat, close to the panel you know.', 'values': look(*generated(270, .17), radius=6, surface_style='flat', background='plain')},
    {'id': 'terminal', 'name': 'Terminal', 'description': 'Green on black, monospace and square.', 'values': look(*generated(145, .17, 'strong'), radius=2, font='mono', surface_style='outlined', background='grid', switches='square')},
    *[
        {'id': f'catppuccin-{flavour}', 'name': f'Catppuccin {label}', 'description': 'The light flavour in light and dark mode.' if flavour == 'latte' else f'Catppuccin {label} in dark mode, Latte in light mode.',
         'values': look(catppuccin(flavour), catppuccin('latte'), radius=12, surface_style='flat', background='plain')}
        for flavour, label in [('mocha', 'Mocha'), ('macchiato', 'Macchiato'), ('frappe', 'Frappé'), ('latte', 'Latte')]
    ],
]

# A new panel starts with Prism Slate: every setting's default is its value.
DEFAULT = next(preset for preset in PRESETS if preset['id'] == 'prism-slate')
DEFAULTS = DEFAULT['values']
# The presets a new panel starts with in Your presets.
OWN_PRESETS = [{'id': 'own-mvmql8vx-p3cv', 'name': 'Catppuccin Mocha Blue', 'values': {'d_background': '#1e1e2e', 'd_surface': '#181825', 'd_sidebar': '#11111b', 'd_raised': '#313244', 'd_deep': '#11111b', 'd_border': '#313244', 'd_text': '#cdd6f4', 'd_muted_text': '#a6adc8', 'd_primary': '#cba6f7', 'd_on_primary': '#11111b', 'd_success': '#a6e3a1', 'd_warning': '#f9e2af', 'd_danger': '#f38ba8', 'd_red': '#f38ba8', 'd_green': '#a6e3a1', 'd_yellow': '#f9e2af', 'd_blue': '#89b4fa', 'd_magenta': '#f5c2e7', 'd_cyan': '#94e2d5', 'l_background': '#eff1f5', 'l_surface': '#e6e9ef', 'l_sidebar': '#dce0e8', 'l_raised': '#ccd0da', 'l_deep': '#dce0e8', 'l_border': '#ccd0da', 'l_text': '#4c4f69', 'l_muted_text': '#6c6f85', 'l_primary': '#8839ef', 'l_on_primary': '#dce0e8', 'l_success': '#40a02b', 'l_warning': '#df8e1d', 'l_danger': '#d20f39', 'l_red': '#d20f39', 'l_green': '#40a02b', 'l_yellow': '#df8e1d', 'l_blue': '#1e66f5', 'l_magenta': '#ea76cb', 'l_cyan': '#179299', 'radius': 12, 'font': 'plex', 'font_size': 16, 'switches': 'rounded', 'surface_style': 'flat', 'blur': 14, 'opacity': 70, 'background': 'plain', 'background_dim': 55, 'motion': 'full'}}]
S = {}


def add(key, **kw):
    if kw.get('help') is None:
        kw.pop('help', None)
    S[key] = kw


for mode, mode_label in MODES.items():
    for role, (label, help_text, group) in ROLES.items():
        add(f'{mode}_{role}', type='color', label=f'{label} ({mode_label.lower()})', help=help_text, tab=f'{mode_label} colors', default=DEFAULTS[f'{mode}_{role}'], token=f"--pt-{mode}-{role.replace('_', '-')}")

add('radius', type='number', label='Corner rounding', tab='Type and shape', default=DEFAULTS['radius'], min=0, max=24, step=1, unit='px', token='--pt-radius')
add('font', type='select', label='Font', tab='Type and shape', options={'plex': 'IBM Plex Sans', 'inter': 'Inter', 'system': 'System', 'rounded': 'Rounded', 'serif': 'Serif', 'mono': 'Monospace'}, default=DEFAULTS['font'], attribute='data-pt-font')
add('labels', type='select', label='Small labels', help='Headings in capitals, such as the groups of the Ctrl+K search and the badges: in the text font or in monospace.', tab='Type and shape', options={'sans': 'Like the text', 'mono': 'Monospace'}, default=DEFAULTS['labels'], attribute='data-pt-labels')
add('font_size', type='number', label='Text size', tab='Type and shape', default=DEFAULTS['font_size'], min=13, max=18, step=1, unit='px', token='--pt-font-size')
add('switches', type='select', label='Switches', help='The shape of every switch: on/off toggles and choices such as Files and Editor. Square follows the corner rounding.', tab='Type and shape', options={'rounded': 'Rounded', 'square': 'Square'}, default=DEFAULTS['switches'], attribute='data-pt-switches')

add('surface_style', type='select', label='Cards and bars', help='How cards, menus and bars stand out from the background.', tab='Surfaces', options={'flat': 'Flat', 'raised': 'Soft shadow', 'outlined': 'Outlined', 'glow': 'Glow', 'glass': 'Glass'}, default=DEFAULTS['surface_style'], attribute='data-pt-surface')
add('blur', type='number', label='Glass blur', help='For Glass.', tab='Surfaces', default=DEFAULTS['blur'], min=0, max=40, step=2, unit='px', token='--pt-blur')
add('opacity', type='number', label='Glass solidity', help='For Glass: how much of the card color covers what is behind.', tab='Surfaces', default=DEFAULTS['opacity'], min=30, max=100, step=5, unit='%', token='--pt-opacity')

add('background', type='select', label='Background', tab='Background', options={'plain': 'Plain', 'gradient': 'Gradient', 'grid': 'Grid', 'dots': 'Dots', 'aurora': 'Aurora (moving)', 'stars': 'Stars (moving)', 'image': 'Picture'}, default=DEFAULTS['background'], attribute='data-pt-bg')
add('background_image', type='image', label='Background picture', help='Used when the background is Picture.', tab='Background', token='--pt-bg-image')
add('background_dim', type='number', label='Darken the picture', tab='Background', default=DEFAULTS['background_dim'], min=0, max=95, step=5, unit='%', token='--pt-bg-dim')
BG_LABELS = {'gradient': 'Gradient', 'grid': 'Grid', 'dots': 'Dots', 'aurora': 'Aurora', 'stars': 'Stars', 'image': 'Picture'}
# Search finds each by its background's name too, such as "Stars: How many".
for kind, params in BACKGROUND.items():
    for name, spec in params.items():
        key = f'bg_{kind}_{name}'
        spec = {k: v for k, v in spec.items() if k != 'default'}
        spec['label'] = f"{BG_LABELS[kind]}: {spec['label']}"
        place = {'token': '--pt-' + key.replace('_', '-')} if spec['type'] == 'number' else {'attribute': 'data-pt-' + key.replace('_', '-')}
        add(key, **spec, tab='Background', default=DEFAULTS[key], **place)
MODE_KEYS = []  # each per-mode background token without its mode: backgrounds.css picks the mode's
for mode, mode_label in MODES.items():
    paren = f' ({mode_label.lower()})'
    add(f'bg_{mode}_gradient_stops', type='number', label=f'Gradient: Number of stops{paren}', tab='Background', default=DEFAULTS[f'bg_{mode}_gradient_stops'], min=2, max=STOPS, step=1)
    for index in range(1, STOPS + 1):
        add(f'bg_{mode}_gradient_{index}', type='color', label=f'Gradient: Stop {index} color{paren}', tab='Background', default=DEFAULTS[f'bg_{mode}_gradient_{index}'], token=f'--pt-bg-{mode}-gradient-{index}')
        add(f'bg_{mode}_gradient_{index}_at', type='number', label=f'Gradient: Stop {index} position{paren}', tab='Background', default=DEFAULTS[f'bg_{mode}_gradient_{index}_at'], min=0, max=100, step=1, unit='%', token=f'--pt-bg-{mode}-gradient-{index}-at')
        if mode == 'd':
            MODE_KEYS += [f'gradient-{index}', f'gradient-{index}-at']
    for kind, names in MODE_COLORS.items():
        for name, label in names.items():
            key = f'bg_{mode}_{kind}' + (f'_{name}' if name else '')
            add(key, type='color', label=f'{BG_LABELS[kind]}: {label}{paren}', tab='Background', default=DEFAULTS[key], token='--pt-' + key.replace('_', '-'))
            if mode == 'd':
                MODE_KEYS.append(kind + (f'-{name}' if name else ''))

add('motion', type='select', label='Motion', help='People who ask their system for less motion always get it.', tab='Motion', options={'full': 'Full', 'reduced': 'Reduced', 'none': 'None'}, default=DEFAULTS['motion'], attribute='data-pt-motion')

# Bookkeeping for Prism Properties: written to nothing on the page.
add('preset', type='text', label='Preset', help='The preset these values came from.', tab='Presets', default=DEFAULT['name'], maxLength=80)
add('presets', type='text', label='Your presets', help='Presets made in Prism Properties.', tab='Presets', default=json.dumps(OWN_PRESETS, separators=(',', ':')), maxLength=200000)

manifest = {
    '$schema': './node_modules/@pterodactyl/sdk/manifest.schema.json',
    'id': 'prism-themes', 'type': 'theme', 'name': 'Prism Themes', 'version': '0.4.0',
    'description': 'One theme tool: colors for dark and light, type and shape, surfaces, backgrounds and motion, with built-in presets such as Catppuccin and your own. The layout is Prism Layout.',
    'author': 'Donkare', 'icon': 'icon.png',
    'requires': {'panel': '^2.0.0-dev', 'sdk': '>=2.0.0-beta.6 <3.0', 'extensions': {'prism-core': '>=0.1.0'}},
    'ui': {'entry': 'dist/client.js'},
    'theme': {'extends': 'classic', 'stylesheet': 'dist/theme.css', 'schemes': ['dark', 'light'], 'settings': S},
}
open(os.path.join(root, 'extension.json'), 'w', encoding='utf8', newline='\n').write(json.dumps(manifest, indent=4, ensure_ascii=False) + '\n')

# The background colors of the mode showing (.dark and .light are on <html>), and the gradient's
# center as a position.
css = ['/* Written by scripts/generate.py: do not edit. The background colors of the mode showing, and the gradient center. */']
for mode, scheme in (('d', 'dark'), ('l', 'light')):
    css.append(f'.{scheme} {{')
    css += [f'    --pt-bg-{name}: var(--pt-bg-{mode}-{name});' for name in MODE_KEYS]
    css.append('}')
css += [f"[data-pt-bg-gradient-center='{key}'] {{ --pt-bg-gradient-at: {value}; }}" for key, value in POSITIONS.items()]
open(os.path.join(root, 'src', 'backgrounds.css'), 'w', encoding='utf8', newline='\n').write('\n'.join(css) + '\n')

roles = [{'key': role, 'label': label, 'help': help_text, 'group': group} for role, (label, help_text, group) in ROLES.items()]
open(os.path.join(extensions, 'builtins.json'), 'w', encoding='utf8', newline='\n').write(json.dumps({'roles': roles, 'presets': PRESETS}, indent=2, ensure_ascii=False) + '\n')

print(len(S), 'settings,', len(PRESETS), 'presets')
