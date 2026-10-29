import { cn } from '@pterodactyl/sdk';

interface Preset {
    id: string;
    name: string;
    description: string;
    settings: Record<string, unknown>;
}

/** Every setting a preset decides, so picking one gives the same layout whatever was set before. */
const base = { enabled: true, bars: 'sidebar', cards: 'tile', card_banner: false, width: 'normal', density: 'cozy', group_nav: true, server_card: true, status_style: 'badge', usage_style: 'bars' };

/** Prism Layout's finished arrangements; picking one sets its settings, which can be changed after. */
export const PRESETS: Preset[] = [
    { id: 'studio', name: 'Studio', description: 'A sidebar with the server card, and tiles with a picture.', settings: { ...base, card_banner: true } },
    { id: 'top', name: 'Top bar', description: 'One bar across the top and tiles, the classic arrangement.', settings: { ...base, bars: 'top', cards: 'tile' } },
    { id: 'rail', name: 'Icon rail', description: 'A slim rail of icons and tiles with numbers.', settings: { ...base, bars: 'rail', usage_style: 'numbers' } },
    { id: 'wide', name: 'Wide and grouped', description: 'A grouped sidebar, a top bar and the whole width.', settings: { ...base, bars: 'sidebar_top', width: 'wide', cards: 'rows' } },
    { id: 'command', name: 'Command center', description: 'Dense: rail, top bar, rows, full width.', settings: { ...base, bars: 'rail_top', density: 'compact', cards: 'rows', width: 'full', usage_style: 'numbers', status_style: 'dot' } },
    { id: 'dock', name: 'Dock', description: 'Pages in a dock along the bottom, and tiles.', settings: { ...base, bars: 'dock', cards: 'tile', density: 'comfortable' } },
    { id: 'minimal', name: 'Minimal', description: 'A top bar and plain rows, nothing extra.', settings: { ...base, bars: 'top', cards: 'rows', group_nav: false, status_style: 'dot', usage_style: 'hidden' } },
    { id: 'classic', name: 'Classic', description: "The panel's own layout. Your logo, favicon and sign-in page stay.", settings: { enabled: false } },
];

/** Whether the values already are this preset. */
export const isPreset = (preset: Preset, values: Record<string, unknown>) => (preset.settings.enabled === false ? values.enabled === false : values.enabled !== false && Object.entries(preset.settings).every(([key, value]) => values[key] === value));

export default function LayoutPresets({ values, onPick }: { values: Record<string, unknown>; onPick: (settings: Record<string, unknown>) => void }) {
    return (
        <section className={'pt-surface ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card'}>
            <h3 className={'ppx:border-b ppx:border-border ppx:px-4 ppx:py-3 ppx:text-sm ppx:font-semibold'}>Presets</h3>
            <div className={'ppx:grid ppx:grid-cols-2 ppx:gap-3 ppx:p-4 ppx:md:grid-cols-3 ppx:2xl:grid-cols-4'}>
                {PRESETS.map((preset) => (
                    <button
                        key={preset.id}
                        type={'button'}
                        onClick={() => onPick(preset.settings)}
                        aria-pressed={isPreset(preset, values)}
                        className={cn('ppx:flex ppx:cursor-pointer ppx:flex-col ppx:overflow-hidden ppx:rounded-lg ppx:border ppx:text-left ppx:transition-colors', isPreset(preset, values) ? 'ppx:border-primary ppx:ring-1 ppx:ring-primary' : 'ppx:border-border ppx:hover:border-primary')}
                    >
                        <Wireframe settings={preset.settings} />
                        <span className={'ppx:px-2.5 ppx:pt-2 ppx:text-sm ppx:font-medium'}>{preset.name}</span>
                        <span className={'ppx:px-2.5 ppx:pb-2 ppx:text-xs ppx:text-muted-foreground'}>{preset.description}</span>
                    </button>
                ))}
            </div>
            <p className={'ppx:border-t ppx:border-border ppx:px-4 ppx:py-3 ppx:text-xs ppx:text-muted-foreground'}>A preset sets the navigation, page and card settings in the other sections. Nothing is saved until you save.</p>
        </section>
    );
}

/** A small drawing of a layout: its bars, page width and cards, in the theme's colors. */
function Wireframe({ settings }: { settings: Record<string, unknown> }) {
    const classic = settings.enabled === false;
    const bars = classic ? 'top' : String(settings.bars);
    const side = bars === 'sidebar' || bars === 'sidebar_top' ? 20 : bars === 'rail' || bars === 'rail_top' ? 7 : 0;
    const top = bars === 'top' || bars.endsWith('_top') || bars === 'top_dock';
    const dock = bars === 'dock' || bars === 'top_dock' || bars === 'dock_expand';
    const inset = settings.width === 'full' ? 2 : settings.width === 'wide' ? 4 : 8;
    const left = side + inset;
    const span = 100 - left - inset;
    const y = (top ? 10 : 0) + (classic ? 6 : 4);
    const rows = settings.cards === 'rows';
    const banner = settings.card_banner === true;
    const count = settings.density === 'compact' ? 4 : 3;
    const gap = 3;
    const width = (span - gap * (count - 1)) / count;

    return (
        <svg viewBox={'0 0 100 58'} className={'ppx:h-20 ppx:w-full ppx:bg-muted/40 ppx:text-foreground'} aria-hidden>
            {side > 0 && <rect x={0} y={0} width={side} height={58} className={'ppx:fill-current'} opacity={0.12} />}
            {side === 20 && [8, 13, 18, 23].map((at) => <rect key={at} x={3} y={at + (settings.server_card ? 6 : 0)} width={13} height={2.5} rx={1} className={'ppx:fill-current'} opacity={0.25} />)}
            {side === 20 && settings.server_card === true && <rect x={3} y={3} width={14} height={8} rx={1.5} fill={'var(--primary)'} opacity={0.35} />}
            {top && <rect x={side} y={0} width={100 - side} height={8} className={'ppx:fill-current'} opacity={0.12} />}
            {classic && <rect x={0} y={8} width={100} height={4} className={'ppx:fill-current'} opacity={0.07} />}
            {rows
                ? [0, 1, 2, 3].map((index) => <rect key={index} x={left} y={y + index * 9} width={span} height={7} rx={1.5} className={'ppx:fill-current'} opacity={0.14} />)
                : Array.from({ length: count }, (_, index) => (
                      <g key={index}>
                          <rect x={left + index * (width + gap)} y={y} width={width} height={22} rx={2} className={'ppx:fill-current'} opacity={0.14} />
                          {banner && <rect x={left + index * (width + gap)} y={y} width={width} height={7} rx={2} fill={'var(--primary)'} opacity={0.4} />}
                      </g>
                  ))}
            {!rows && <rect x={left} y={y + 26} width={width} height={12} rx={2} className={'ppx:fill-current'} opacity={0.1} />}
            {dock && <rect x={28} y={49} width={44} height={6} rx={3} className={'ppx:fill-current'} opacity={0.22} />}
        </svg>
    );
}
