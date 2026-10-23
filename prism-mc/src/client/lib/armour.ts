import type { PlayerState } from './player';

/**
 * Paints worn armour onto a skin's outer layer, so the 3D model shows it. Armour textures use
 * the same layout as the classic skin, so each piece is copied onto the matching overlay.
 */

const TEXTURES = 'https://assets.mcasset.cloud/1.21.11/assets/minecraft/textures/entity/equipment';

const MATERIALS: Record<string, string> = {
    leather: 'leather',
    chainmail: 'chainmail',
    iron: 'iron',
    golden: 'gold',
    diamond: 'diamond',
    netherite: 'netherite',
    copper: 'copper',
};

function material(id: string | undefined): string | null {
    if (!id) return null;
    if (id === 'minecraft:turtle_helmet') return 'turtle_scute';
    const match = id.match(/^minecraft:([a-z]+)_(helmet|chestplate|leggings|boots)$/);

    return match ? (MATERIALS[match[1]] ?? null) : null;
}

function load(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Could not load ${src}`));
        image.src = src;
    });
}

type Rect = [number, number, number, number];

/** Copies a region of the armour texture onto one or more places of the skin. */
function paint(context: CanvasRenderingContext2D, texture: HTMLImageElement, from: Rect, to: [number, number][], clear = true) {
    for (const [x, y] of to) {
        if (clear) context.clearRect(x, y, from[2], from[3]);
        context.drawImage(texture, from[0], from[1], from[2], from[3], x, y, from[2], from[3]);
    }
}

const HEAD: Rect = [0, 0, 32, 16];
const BODY: Rect = [16, 16, 24, 16];
const ARM: Rect = [40, 16, 16, 16];
const LEG: Rect = [0, 16, 16, 16];

export async function armouredSkin(skinUrl: string, equipment: PlayerState['equipment']): Promise<string> {
    const pieces = {
        head: material(equipment.head?.id),
        chest: material(equipment.chest?.id),
        legs: material(equipment.legs?.id),
        feet: material(equipment.feet?.id),
    };
    if (!pieces.head && !pieces.chest && !pieces.legs && !pieces.feet) return skinUrl;

    const skin = await load(skinUrl);
    // Old 64×32 skins have no separate overlays for every limb; leave them as they are.
    if (skin.naturalHeight !== 64) return skinUrl;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.imageSmoothingEnabled = false;
    context.drawImage(skin, 0, 0);

    const texture = (kind: 'humanoid' | 'humanoid_leggings', name: string) => load(`${TEXTURES}/${kind}/${name}.png`).catch(() => null);

    if (pieces.legs) {
        const legs = await texture('humanoid_leggings', pieces.legs);
        if (legs) {
            paint(context, legs, BODY, [[16, 32]]);
            paint(context, legs, LEG, [[0, 32], [0, 48]]);
        }
    }

    if (pieces.feet) {
        const boots = await texture('humanoid', pieces.feet);
        // Boots only cover the lower legs, so they go over the leggings without clearing them.
        if (boots) paint(context, boots, LEG, [[0, 32], [0, 48]], !pieces.legs);
    }

    if (pieces.chest) {
        const chest = await texture('humanoid', pieces.chest);
        if (chest) {
            paint(context, chest, BODY, [[16, 32]]);
            paint(context, chest, ARM, [[40, 32], [48, 48]]);
        }
    }

    if (pieces.head) {
        const helmet = await texture('humanoid', pieces.head);
        if (helmet) paint(context, helmet, HEAD, [[32, 0]]);
    }

    return canvas.toDataURL('image/png');
}
