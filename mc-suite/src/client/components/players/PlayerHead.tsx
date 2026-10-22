import { useEffect, useState } from 'react';
import { cn } from '@pterodactyl/sdk';
import { useSkin } from '../../api/players';

const heads = new Map<string, string>();

/** Cuts the face and its hat layer out of a skin texture. */
async function faceFrom(skinUrl: string): Promise<string> {
    const cached = heads.get(skinUrl);
    if (cached) return cached;

    const image = new Image();
    image.src = skinUrl;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext('2d')!;
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 8, 8, 8, 8, 0, 0, 8, 8);
    context.drawImage(image, 40, 8, 8, 8, 0, 0, 8, 8);

    const url = canvas.toDataURL('image/png');
    heads.set(skinUrl, url);

    return url;
}

/** The player's face, the way the tab list draws it. Steve stands in until the skin loads. */
export default function PlayerHead({ server, skinKey, className }: { server: string; skinKey: string | null | undefined; className?: string }) {
    const skin = useSkin(server, skinKey);
    const [face, setFace] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        if (skin.data) {
            faceFrom(skin.data.url)
                .then((url) => !cancelled && setFace(url))
                .catch(() => undefined);
        }

        return () => {
            cancelled = true;
        };
    }, [skin.data]);

    return face ? (
        <img src={face} alt={''} className={cn('mcs-pixelated mcs:rounded-sm', className)} />
    ) : (
        <div className={cn('mcs:rounded-sm mcs:bg-muted', className)} />
    );
}
