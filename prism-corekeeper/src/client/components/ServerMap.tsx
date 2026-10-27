import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { PART, boundsOf, partOrigin, pixelOf, tileAt, type MapBounds, type MapPart } from '../lib/mapparts';

interface Picture {
    left: number;
    top: number;
    bitmap: ImageBitmap;
}

interface Camera {
    /** screen pixels of the map's top-left corner */
    x: number;
    y: number;
    /** screen pixels per tile */
    zoom: number;
}

const MIN_ZOOM = 0.125;
const MAX_ZOOM = 32;

/**
 * The shared Cartography Table map. Each part's picture is decoded once; every frame draws only
 * the parts on screen into a canvas the size of the view, so a large map stays quick. Drag to
 * move, wheel or the buttons to zoom.
 */
export default function ServerMap({ parts }: { parts: MapPart[] }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [pictures, setPictures] = useState<Picture[] | null>(null);
    const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 2 });
    const [grid, setGrid] = useState(false);
    const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
    const dragging = useRef<{ startX: number; startY: number; camera: Camera } | null>(null);

    const bounds: MapBounds | null = parts.length > 0 ? boundsOf(parts) : null;
    const boundsKey = bounds ? `${bounds.minX},${bounds.maxX},${bounds.minY},${bounds.maxY}` : '';

    useEffect(() => {
        if (!bounds) return;
        let stale = false;
        void Promise.all(
            parts.map((part) =>
                createImageBitmap(new Blob([part.png as BlobPart], { type: 'image/png' })).then(
                    (bitmap) => ({ ...partOrigin(part, bounds), bitmap }),
                    () => null
                )
            )
        ).then((decoded) => {
            if (!stale) setPictures(decoded.filter((picture): picture is Picture => picture !== null));
        });

        return () => {
            stale = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parts]);

    const centerOnCore = useCallback(() => {
        const element = canvas.current;
        if (!element || !bounds) return;
        const core = pixelOf(0, 0, bounds);
        setCamera({ zoom: 2, x: element.clientWidth / 2 - core.x * 2, y: element.clientHeight / 2 - core.y * 2 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [boundsKey]);

    useEffect(() => centerOnCore(), [centerOnCore, pictures !== null]);

    const paint = useCallback(() => {
        const element = canvas.current;
        const context = element?.getContext('2d');
        if (!element || !context || !bounds || !pictures) return;

        const ratio = window.devicePixelRatio || 1;
        const width = element.clientWidth;
        const height = element.clientHeight;
        if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
            element.width = Math.round(width * ratio);
            element.height = Math.round(height * ratio);
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        context.imageSmoothingEnabled = false;

        const size = PART * camera.zoom;
        for (const picture of pictures) {
            const x = camera.x + picture.left * camera.zoom;
            const y = camera.y + picture.top * camera.zoom;
            if (x > width || y > height || x + size < 0 || y + size < 0) continue;
            context.drawImage(picture.bitmap, x, y, size, size);
        }

        if (grid) {
            context.strokeStyle = 'rgba(255, 255, 255, 0.18)';
            context.lineWidth = 1;
            context.beginPath();
            for (let column = 0; column <= bounds.maxX - bounds.minX + 1; column++) {
                const x = Math.round(camera.x + column * size) + 0.5;
                context.moveTo(x, 0);
                context.lineTo(x, height);
            }
            for (let row = 0; row <= bounds.maxY - bounds.minY + 1; row++) {
                const y = Math.round(camera.y + row * size) + 0.5;
                context.moveTo(0, y);
                context.lineTo(width, y);
            }
            context.stroke();
        }

        const core = pixelOf(0, 0, bounds);
        context.fillStyle = '#f5c542';
        context.strokeStyle = '#000';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(camera.x + (core.x + 0.5) * camera.zoom, camera.y + (core.y + 0.5) * camera.zoom, 6, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pictures, boundsKey, camera, grid]);

    useEffect(() => {
        paint();
        const element = canvas.current;
        if (!element) return;
        const observer = new ResizeObserver(paint);
        observer.observe(element);

        return () => observer.disconnect();
    }, [paint]);

    const zoomBy = (factor: number, aroundX?: number, aroundY?: number) => {
        const element = canvas.current;
        if (!element) return;
        const px = aroundX ?? element.clientWidth / 2;
        const py = aroundY ?? element.clientHeight / 2;
        setCamera((current) => {
            const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor));
            const applied = zoom / current.zoom;

            return { zoom, x: px - (px - current.x) * applied, y: py - (py - current.y) * applied };
        });
    };

    // React's onWheel is passive, so it cannot keep the page from scrolling.
    useEffect(() => {
        const element = canvas.current;
        if (!element) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const rect = element.getBoundingClientRect();
            zoomBy(event.deltaY < 0 ? 1.25 : 0.8, event.clientX - rect.left, event.clientY - rect.top);
        };
        element.addEventListener('wheel', onWheel, { passive: false });

        return () => element.removeEventListener('wheel', onWheel);
    });

    const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
        if (!bounds) return;
        const rect = event.currentTarget.getBoundingClientRect();
        setPointer(tileAt((event.clientX - rect.left - camera.x) / camera.zoom, (event.clientY - rect.top - camera.y) / camera.zoom, bounds));
        const drag = dragging.current;
        if (drag) setCamera({ ...drag.camera, x: drag.camera.x + event.clientX - drag.startX, y: drag.camera.y + event.clientY - drag.startY });
    };

    if (!pictures) {
        return <div className={'cks:flex cks:h-96 cks:items-center cks:justify-center cks:text-sm cks:text-muted-foreground'}>Drawing the map…</div>;
    }

    const controls: [string, string, () => void][] = [
        ['zoom-in', 'Zoom in', () => zoomBy(1.5)],
        ['zoom-out', 'Zoom out', () => zoomBy(1 / 1.5)],
        ['focus-2', 'Back to the Core', centerOnCore],
    ];

    return (
        <div className={'cks:relative cks:overflow-hidden cks:rounded-lg cks:border cks:border-border cks:bg-black'}>
            <canvas
                ref={canvas}
                className={'cks-map cks-pixelated cks:block cks:h-[70vh] cks:min-h-96 cks:w-full'}
                onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    dragging.current = { startX: event.clientX, startY: event.clientY, camera };
                }}
                onPointerMove={onPointerMove}
                onPointerUp={() => (dragging.current = null)}
                onPointerLeave={() => setPointer(null)}
            />
            <div className={'pt-surface pt-overlay cks:absolute cks:right-3 cks:top-3 cks:flex cks:flex-col cks:gap-1 cks:rounded-lg cks:border cks:border-border cks:bg-card/90 cks:p-1'}>
                {controls.map(([icon, label, action]) => (
                    <button key={icon} type={'button'} onClick={action} aria-label={label} title={label} className={'cks:flex cks:size-8 cks:items-center cks:justify-center cks:rounded-md cks:cursor-pointer cks:hover:bg-muted'}>
                        <NamedIcon name={icon} size={16} />
                    </button>
                ))}
                <button
                    type={'button'}
                    onClick={() => setGrid(!grid)}
                    aria-pressed={grid}
                    aria-label={'Show the 256-tile grid'}
                    title={'Show the 256-tile grid'}
                    className={cn('cks:flex cks:size-8 cks:items-center cks:justify-center cks:rounded-md cks:cursor-pointer', grid ? 'cks:bg-primary/20 cks:text-primary' : 'cks:hover:bg-muted')}
                >
                    <NamedIcon name={'grid-3x3'} size={16} />
                </button>
            </div>
            <div className={'pt-surface pt-overlay cks:absolute cks:bottom-3 cks:left-3 cks:rounded-md cks:border cks:border-border cks:bg-card/90 cks:px-3 cks:py-1.5 cks:font-mono cks:text-xs'}>
                {pointer ? `x ${pointer.x}, y ${pointer.y}` : 'Core at 0, 0'} · {Math.round(camera.zoom * 100)}%
            </div>
        </div>
    );
}
