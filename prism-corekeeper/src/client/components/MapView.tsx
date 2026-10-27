import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { PART, boundsOf, partOrigin, pixelOf, tileAt, type MapBounds, type MapPart } from '../lib/mapparts';

interface Tile {
    left: number;
    top: number;
    image: ImageBitmap;
}

/**
 * The explored map: every part's picture placed by its coordinates, drawn into a canvas the size
 * of the view, so even a large world only draws what is on screen. Drag to move, wheel or the
 * buttons to zoom. Several maps (players') are laid over each other.
 */
export default function MapView({ maps }: { maps: MapPart[][] }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [tiles, setTiles] = useState<Tile[]>([]);
    const [bounds, setBounds] = useState<MapBounds | null>(null);
    const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
    const [grid, setGrid] = useState(false);
    const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
    const drag = useRef<{ x: number; y: number; viewX: number; viewY: number } | null>(null);

    // Decode the pictures once.
    useEffect(() => {
        let gone = false;
        const parts = maps.flat();
        if (parts.length === 0) {
            setTiles([]);
            setBounds(null);

            return;
        }
        const area = boundsOf(parts);
        void Promise.all(
            parts.map(async (part) => {
                try {
                    return { ...partOrigin(part, area), image: await createImageBitmap(new Blob([part.png as BlobPart], { type: 'image/png' })) };
                } catch {
                    return null;
                }
            })
        ).then((decoded) => {
            if (gone) return;
            setBounds(area);
            setTiles(decoded.filter((tile): tile is Tile => tile !== null));
        });

        return () => {
            gone = true;
        };
    }, [maps]);

    // Start with the Core in the middle.
    const center = useCallback(() => {
        const element = canvas.current;
        if (!element || !bounds) return;
        const core = pixelOf(0, 0, bounds);
        const scale = 2;
        setView({ scale, x: element.clientWidth / 2 - core.x * scale, y: element.clientHeight / 2 - core.y * scale });
    }, [bounds]);

    useEffect(() => center(), [center]);

    const draw = useCallback(() => {
        const element = canvas.current;
        if (!element || !bounds) return;
        const ratio = window.devicePixelRatio || 1;
        const width = element.clientWidth;
        const height = element.clientHeight;
        if (element.width !== width * ratio || element.height !== height * ratio) {
            element.width = width * ratio;
            element.height = height * ratio;
        }
        const context = element.getContext('2d');
        if (!context) return;

        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        context.imageSmoothingEnabled = false;
        const size = PART * view.scale;
        for (const tile of tiles) {
            const x = view.x + tile.left * view.scale;
            const y = view.y + tile.top * view.scale;
            if (x + size < 0 || y + size < 0 || x > width || y > height) continue;
            context.drawImage(tile.image, x, y, size, size);
        }

        if (grid) {
            context.strokeStyle = 'rgba(255,255,255,0.15)';
            context.lineWidth = 1;
            for (let px = bounds.minX; px <= bounds.maxX + 1; px++) {
                const x = view.x + (px - bounds.minX) * size;
                context.beginPath();
                context.moveTo(x, 0);
                context.lineTo(x, height);
                context.stroke();
            }
            for (let py = bounds.minY; py <= bounds.maxY + 1; py++) {
                const y = view.y + (bounds.maxY + 1 - py) * size;
                context.beginPath();
                context.moveTo(0, y);
                context.lineTo(width, y);
                context.stroke();
            }
        }

        // The Core.
        const core = pixelOf(0, 0, bounds);
        const cx = view.x + (core.x + 0.5) * view.scale;
        const cy = view.y + (core.y + 0.5) * view.scale;
        context.fillStyle = '#f5c542';
        context.strokeStyle = '#000';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(cx, cy, 6, 0, Math.PI * 2);
        context.fill();
        context.stroke();
    }, [tiles, bounds, view, grid]);

    useEffect(() => {
        draw();
        const element = canvas.current;
        if (!element) return;
        const observer = new ResizeObserver(() => draw());
        observer.observe(element);

        return () => observer.disconnect();
    }, [draw]);

    const zoom = (factor: number, atX?: number, atY?: number) => {
        const element = canvas.current;
        if (!element) return;
        const x = atX ?? element.clientWidth / 2;
        const y = atY ?? element.clientHeight / 2;
        setView((current) => {
            const scale = Math.min(32, Math.max(0.125, current.scale * factor));
            const applied = scale / current.scale;

            return { scale, x: x - (x - current.x) * applied, y: y - (y - current.y) * applied };
        });
    };

    // A wheel listener that may cancel scrolling the page.
    useEffect(() => {
        const element = canvas.current;
        if (!element) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const rect = element.getBoundingClientRect();
            zoom(event.deltaY < 0 ? 1.25 : 0.8, event.clientX - rect.left, event.clientY - rect.top);
        };
        element.addEventListener('wheel', onWheel, { passive: false });

        return () => element.removeEventListener('wheel', onWheel);
    });

    if (!bounds) {
        return <div className={'cks:flex cks:h-96 cks:items-center cks:justify-center cks:text-sm cks:text-muted-foreground'}>Drawing the map…</div>;
    }

    const explored = tiles.length;

    return (
        <div className={'cks:relative cks:overflow-hidden cks:rounded-lg cks:border cks:border-border cks:bg-black'}>
            <canvas
                ref={canvas}
                className={'cks-map cks-pixelated cks:block cks:h-[70vh] cks:min-h-96 cks:w-full'}
                onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
                }}
                onPointerMove={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setHover(tileAt((event.clientX - rect.left - view.x) / view.scale, (event.clientY - rect.top - view.y) / view.scale, bounds));
                    if (drag.current) {
                        const start = drag.current;
                        setView((current) => ({ ...current, x: start.viewX + event.clientX - start.x, y: start.viewY + event.clientY - start.y }));
                    }
                }}
                onPointerUp={() => (drag.current = null)}
                onPointerLeave={() => setHover(null)}
            />
            <div className={'pt-surface pt-overlay cks:absolute cks:right-3 cks:top-3 cks:flex cks:flex-col cks:gap-1 cks:rounded-lg cks:border cks:border-border cks:bg-card/90 cks:p-1'}>
                {(
                    [
                        ['zoom-in', 'Zoom in', () => zoom(1.5)],
                        ['zoom-out', 'Zoom out', () => zoom(1 / 1.5)],
                        ['focus-2', 'Back to the Core', center],
                    ] as const
                ).map(([icon, label, action]) => (
                    <button key={icon} type={'button'} onClick={action} aria-label={label} title={label} className={'cks:flex cks:size-8 cks:items-center cks:justify-center cks:rounded-md cks:cursor-pointer cks:hover:bg-muted'}>
                        <NamedIcon name={icon} size={16} />
                    </button>
                ))}
                <button
                    type={'button'}
                    onClick={() => setGrid(!grid)}
                    aria-pressed={grid}
                    title={'Show the 256-tile grid'}
                    className={cn('cks:flex cks:size-8 cks:items-center cks:justify-center cks:rounded-md cks:cursor-pointer', grid ? 'cks:bg-primary/20 cks:text-primary' : 'cks:hover:bg-muted')}
                >
                    <NamedIcon name={'grid-3x3'} size={16} />
                </button>
            </div>
            <div className={'pt-surface pt-overlay cks:absolute cks:bottom-3 cks:left-3 cks:rounded-md cks:border cks:border-border cks:bg-card/90 cks:px-3 cks:py-1.5 cks:font-mono cks:text-xs'}>
                {hover ? `x ${hover.x}, y ${hover.y}` : 'Core at 0, 0'} · {explored} {explored === 1 ? 'part' : 'parts'} explored · {Math.round(view.scale * 100)}%
            </div>
        </div>
    );
}
