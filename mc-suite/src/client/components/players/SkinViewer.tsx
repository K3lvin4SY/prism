import { useEffect, useRef } from 'react';
import type { Skin } from '../../api/players';

/**
 * A 3D player model that turns slowly and can be dragged around. skinview3d and three.js
 * are loaded only when a player page opens.
 */
export default function SkinViewer({ skin, width = 260, height = 340 }: { skin: Skin; width?: number; height?: number }) {
    const canvas = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let disposed = false;
        let viewer: import('skinview3d').SkinViewer | null = null;

        import('skinview3d').then(({ SkinViewer: Viewer, WalkingAnimation }) => {
            if (disposed || !canvas.current) return;

            viewer = new Viewer({
                canvas: canvas.current,
                width,
                height,
                skin: skin.url,
                model: skin.slim ? 'slim' : 'default',
                zoom: 0.85,
            });
            if (skin.cape) viewer.loadCape(skin.cape);
            viewer.autoRotate = true;
            viewer.autoRotateSpeed = 0.6;
            viewer.animation = new WalkingAnimation();
            viewer.animation.speed = 0.5;
            viewer.controls.enableZoom = false;
        });

        return () => {
            disposed = true;
            viewer?.dispose();
        };
    }, [skin.url, skin.slim, skin.cape, width, height]);

    return <canvas ref={canvas} width={width} height={height} className={'mcs:cursor-grab mcs:active:cursor-grabbing mcs:max-w-full'} aria-label={'3D player model'} />;
}
