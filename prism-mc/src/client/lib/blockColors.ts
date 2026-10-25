/**
 * Map colors for blocks, worked out from the game's own textures: the average of each
 * block's top texture, loaded once per session from a public asset mirror. Blocks the game
 * tints by biome get the plains tint, and anything without a texture gets a color by name.
 */

export type Rgb = [number, number, number];

const TEXTURES = 'https://assets.mcasset.cloud/1.21.11/assets/minecraft/textures/block';

/** Plains biome tints for textures the game stores in grey. */
const TINTS: [RegExp, Rgb][] = [
    [/^(grass_block|short_grass|tall_grass|fern|large_fern|sugar_cane|grass)$/, [145, 189, 89]],
    [/(oak|jungle|acacia|dark_oak|mangrove)_leaves$|^vine$/, [119, 171, 47]],
    [/^birch_leaves$/, [128, 167, 85]],
    [/^spruce_leaves$/, [97, 153, 97]],
    [/^lily_pad$/, [32, 128, 48]],
    [/^(water|bubble_column)$/, [63, 118, 228]],
];

/** Colors by name for blocks whose textures do not say much from above. */
const FALLBACKS: [RegExp, Rgb][] = [
    [/water|bubble_column/, [63, 118, 228]],
    [/lava|magma/, [207, 92, 15]],
    [/snow|powder_snow/, [249, 254, 254]],
    [/ice/, [145, 183, 253]],
    [/leaves/, [72, 133, 39]],
    [/grass|fern|moss|azalea/, [110, 160, 60]],
    [/sand/, [219, 207, 163]],
    [/gravel|stone|cobble|andesite|tuff|deepslate|ore/, [125, 125, 125]],
    [/dirt|mud|podzol|farmland|path/, [134, 96, 67]],
    [/log|wood|plank|stem|hyphae/, [143, 119, 72]],
    [/netherrack|nylium|wart/, [112, 2, 0]],
    [/end_stone|purpur/, [219, 222, 158]],
    [/clay|terracotta/, [160, 110, 85]],
    [/flower|tulip|rose|poppy|dandelion|orchid|allium|bluet|daisy|cornflower|lilac|peony/, [180, 60, 60]],
];

const cache = new Map<string, Promise<Rgb>>();

/** Texture names to try for a block, most likely first. */
function candidates(id: string): string[] {
    const name = id.replace(/^minecraft:/, '');
    const base = name
        .replace(/_(stairs|slab|wall|fence_gate|fence|pressure_plate|button|carpet)$/, '')
        .replace(/^(waxed_)/, '');
    const list = [`${name}_top`, name, `${base}_top`, base, `${base}s`, `${base}_planks`, `${base}_block`];
    if (name === 'water' || name === 'bubble_column') list.unshift('water_still');
    if (name === 'lava') list.unshift('lava_still');

    return [...new Set(list)];
}

function load(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(src));
        image.src = src;
    });
}

function average(image: HTMLImageElement): Rgb | null {
    // Animated textures are tall strips of frames; the first frame is enough.
    const size = Math.min(image.naturalWidth, 16);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0, size, size, 0, 0, size, size);
    const { data } = context.getImageData(0, 0, size, size);

    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
    }

    return count === 0 ? null : [r / count, g / count, b / count];
}

function tint(id: string, color: Rgb): Rgb {
    const name = id.replace(/^minecraft:/, '');
    const match = TINTS.find(([pattern]) => pattern.test(name));
    if (!match) return color;
    const [tr, tg, tb] = match[1];

    // The grey texture carries the shading; the tint carries the color.
    return [(color[0] * tr) / 255, (color[1] * tg) / 255, (color[2] * tb) / 255];
}

function fallback(id: string): Rgb {
    return FALLBACKS.find(([pattern]) => pattern.test(id))?.[1] ?? [128, 128, 128];
}

export function blockColor(id: string): Promise<Rgb> {
    let color = cache.get(id);
    if (!color) {
        color = (async () => {
            if (!id.startsWith('minecraft:')) return fallback(id);
            for (const name of candidates(id)) {
                try {
                    const rgb = average(await load(`${TEXTURES}/${name}.png`));
                    if (rgb) return tint(id, rgb);
                } catch {
                    // Try the next name.
                }
            }

            return fallback(id);
        })();
        cache.set(id, color);
    }

    return color;
}
