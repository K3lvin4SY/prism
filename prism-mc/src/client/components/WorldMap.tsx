import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Spinner, cn, http } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { base } from '../api/client';
import { REGION, THUMB, mapArea, type RegionInfo } from '../lib/mapTiles';
import { ZOOMS, zoomAt, type View } from '../lib/mapView';
import PlayerHead from './players/PlayerHead';

export type Dimension = 'overworld' | 'the_nether' | 'the_end';

const DIMENSIONS: { value: Dimension; label: string }[] = [
    { value: 'overworld', label: 'Overworld' },
    { value: 'the_nether', label: 'Nether' },
    { value: 'the_end', label: 'End' },
];

const START_ZOOM = ZOOMS.indexOf(1);
const FOCUS_ZOOM = ZOOMS.indexOf(2);
/** Scroll distance for one zoom step, so a touchpad does not race through every level. */
const WHEEL_STEP = 60;

/** A player on the map, where they were at their last save. */
export interface Marker {
    key: string;
    name: string;
    online: boolean;
    position: [number, number, number];
    dimension: Dimension;
}

/** Ask the map to show a spot; `at` changes each time so the same spot can be asked for again. */
export interface Focus {
    dimension: Dimension;
    x: number;
    z: number;
    at: number;
}

export const toDimension = (value: string): Dimension => {
    const name = value.replace(/^minecraft:/, '');

    return DIMENSIONS.some((entry) => entry.value === name) ? (name as Dimension) : 'overworld';
};

/**
 * A top-down map drawn from the world's region files, with each player's head where they were
 * at their last save. Drag to move around, scroll or use the buttons to zoom.
 *
 * The regions are painted onto one canvas, so even a whole world zoomed out is quick to move
 * around. Their pictures come from mapTiles.ts, which keeps every one for the whole visit.
 */
export default function WorldMap({ server, markers, focus, height = 560 }: { server: string; markers: Marker[]; focus: Focus | null; height?: number }) {
    const [dimension, setDimension] = useState<Dimension>(focus?.dimension ?? 'overworld');
    const [view, setView] = useState<View>(() => ({ zoom: START_ZOOM, center: focus ? [focus.x, focus.z] : [0, 0] }));
    const [size, setSize] = useState<[number, number]>([800, 420]);
    const [remaining, setRemaining] = useState(0);
    const box = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const drag = useRef<{ x: number; z: number; pointerX: number; pointerY: number } | null>(null);
    const wheel = useRef(0);

    const area = useMemo(() => mapArea(server, dimension), [server, dimension]);
    const { zoom, center } = view;
    const scale = ZOOMS[zoom];

    const regions = useQuery({
        queryKey: ['prism-mc', server, 'map', dimension],
        queryFn: async () => (await http.get<{ regions: RegionInfo[] }>(`${base(server)}/map/${dimension}`)).data.regions,
        staleTime: 120_000,
    });

    useEffect(() => {
        if (regions.data) area.setRegions(regions.data);
    }, [area, regions.data]);

    useEffect(() => {
        const element = box.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => setSize([entry.contentRect.width, entry.contentRect.height]));
        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    // React's wheel listener is passive, so it cannot stop the page scrolling under the map.
    // Zooming keeps the spot under the pointer where it is.
    useEffect(() => {
        const element = box.current;
        if (!element) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            wheel.current += event.deltaMode === 1 ? event.deltaY * 40 : event.deltaY;
            if (Math.abs(wheel.current) < WHEEL_STEP && Math.abs(event.deltaY) < WHEEL_STEP) return;
            const direction = wheel.current < 0 ? 1 : -1;
            wheel.current = 0;

            const rect = element.getBoundingClientRect();
            const offset: [number, number] = [event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2];
            setView((current) => zoomAt(current, direction, offset));
        };
        element.addEventListener('wheel', onWheel, { passive: false });

        return () => element.removeEventListener('wheel', onWheel);
    }, []);

    useEffect(() => {
        if (!focus) return;
        setDimension(focus.dimension);
        setView((current) => ({ zoom: Math.max(current.zoom, FOCUS_ZOOM), center: [focus.x, focus.z] }));
    }, [focus]);

    const halfWidth = size[0] / 2 / scale;
    const halfHeight = size[1] / 2 / scale;

    // Regions in view, plus half a region around it, nearest the middle first.
    const visible = useMemo(() => {
        const margin = REGION / 2;
        const middle = (region: RegionInfo) => [(region.x + 0.5) * REGION - center[0], (region.z + 0.5) * REGION - center[1]];

        return (regions.data ?? [])
            .filter(
                (region) =>
                    (region.x + 1) * REGION > center[0] - halfWidth - margin &&
                    region.x * REGION < center[0] + halfWidth + margin &&
                    (region.z + 1) * REGION > center[1] - halfHeight - margin &&
                    region.z * REGION < center[1] + halfHeight + margin
            )
            .map((region) => {
                const [dx, dz] = middle(region);

                return { region, key: area.key(region.x, region.z), distance: dx * dx + dz * dz };
            })
            .sort((a, b) => a.distance - b.distance);
    }, [regions.data, center, halfWidth, halfHeight, area]);

    const pixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    // Full pictures once a region is shown larger than its small picture.
    const needFull = scale * pixelRatio * REGION > THUMB * 1.25;

    useEffect(() => {
        area.want(
            visible.map((entry) => entry.key),
            needFull
        );
    }, [area, visible, needFull]);

    useEffect(() => () => area.want([], false), [area]);

    // The latest view for painting outside React's renders.
    const latest = useRef({ visible, scale, center, size });
    latest.current = { visible, scale, center, size };

    const paint = useCallback(() => {
        const element = canvas.current;
        if (!element) return;
        const { visible, scale, center, size } = latest.current;
        const ratio = window.devicePixelRatio || 1;
        const width = Math.round(size[0] * ratio);
        const height = Math.round(size[1] * ratio);
        if (element.width !== width) element.width = width;
        if (element.height !== height) element.height = height;

        const context = element.getContext('2d');
        if (!context) return;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, width, height);

        const pixels = scale * ratio;
        const left = width / 2 - center[0] * pixels;
        const top = height / 2 - center[1] * pixels;
        const useFull = pixels * REGION > THUMB * 1.25;
        context.imageSmoothingEnabled = pixels < 1;
        context.imageSmoothingQuality = 'medium';

        for (const { region, key } of visible) {
            // Edges on whole pixels, so neighbouring regions meet without seams.
            const x0 = Math.round(left + region.x * REGION * pixels);
            const x1 = Math.round(left + (region.x + 1) * REGION * pixels);
            const y0 = Math.round(top + region.z * REGION * pixels);
            const y1 = Math.round(top + (region.z + 1) * REGION * pixels);
            if (x1 <= 0 || y1 <= 0 || x0 >= width || y0 >= height) continue;

            const tile = area.tiles.get(key);
            const picture = tile ? (useFull && tile.full) || tile.thumb : null;
            if (picture) {
                context.drawImage(picture, x0, y0, x1 - x0, y1 - y0);
            } else {
                context.fillStyle = '#1b1b1b';
                context.fillRect(x0, y0, x1 - x0, y1 - y0);
            }

            const progress = area.progress.get(key);
            if (progress !== undefined && x1 - x0 >= 48) {
                const barHeight = Math.max(3, Math.round(3 * ratio));
                context.fillStyle = 'rgba(0, 0, 0, 0.55)';
                context.fillRect(x0, y1 - barHeight, x1 - x0, barHeight);
                context.fillStyle = 'rgba(255, 255, 255, 0.85)';
                context.fillRect(x0, y1 - barHeight, Math.max(2, (x1 - x0) * progress), barHeight);
            }
        }
    }, [area]);

    useLayoutEffect(paint, [paint, visible, scale, center, size]);

    // Pictures arrive between renders; they are painted on the next frame.
    useEffect(() => {
        let frame = 0;
        const update = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                paint();
                setRemaining(area.remaining());
            });
        };
        const unsubscribe = area.subscribe(update);
        update();

        return () => {
            unsubscribe();
            if (frame) cancelAnimationFrame(frame);
        };
    }, [area, paint]);

    const here = markers.filter((marker) => marker.dimension === dimension);

    // Centre on the players in view, or on 0, 0 when there are none.
    const recenter = () => {
        const middle: [number, number] =
            here.length === 0 ? [0, 0] : [here.reduce((sum, marker) => sum + marker.position[0], 0) / here.length, here.reduce((sum, marker) => sum + marker.position[2], 0) / here.length];
        setView((current) => ({ ...current, center: middle }));
    };

    // The buttons have no pointer on the map, so they zoom around the middle.
    const zoomBy = (step: number) => setView((current) => zoomAt(current, step));

    const onPointerDown = (event: ReactPointerEvent) => {
        (event.target as Element).setPointerCapture?.(event.pointerId);
        drag.current = { x: center[0], z: center[1], pointerX: event.clientX, pointerY: event.clientY };
    };

    const onPointerMove = (event: ReactPointerEvent) => {
        const start = drag.current;
        if (!start) return;
        setView((current) => ({
            ...current,
            center: [start.x - (event.clientX - start.pointerX) / ZOOMS[current.zoom], start.z - (event.clientY - start.pointerY) / ZOOMS[current.zoom]],
        }));
    };

    return (
        <div className={'mcs:flex mcs:flex-col mcs:gap-2'}>
            <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-2'}>
                <div className={'prism-switch mcs:flex mcs:rounded-md mcs:bg-muted mcs:p-0.5'}>
                    {DIMENSIONS.map((entry) => (
                        <button
                            key={entry.value}
                            type={'button'}
                            onClick={() => setDimension(entry.value)}
                            className={cn(
                                'prism-switch-item mcs:rounded mcs:px-3 mcs:py-1 mcs:text-sm mcs:cursor-pointer',
                                dimension === entry.value ? 'mcs:bg-primary mcs:text-primary-foreground' : 'mcs:text-muted-foreground mcs:hover:text-foreground'
                            )}
                        >
                            {entry.label}
                        </button>
                    ))}
                </div>
                <div className={'mcs:ml-auto mcs:flex mcs:items-center mcs:gap-1'}>
                    <Button.Text size={'small'} onClick={recenter} title={'Centre on the players'}>
                        <NamedIcon name={'locate-fixed'} size={16} />
                    </Button.Text>
                    <Button.Text size={'small'} disabled={zoom === 0} onClick={() => zoomBy(-1)} aria-label={'Zoom out'}>
                        <NamedIcon name={'minus'} size={16} />
                    </Button.Text>
                    <Button.Text size={'small'} disabled={zoom === ZOOMS.length - 1} onClick={() => zoomBy(1)} aria-label={'Zoom in'}>
                        <NamedIcon name={'plus'} size={16} />
                    </Button.Text>
                </div>
            </div>

            <div
                ref={box}
                style={{ height }}
                className={'mcs:relative mcs:overflow-hidden mcs:rounded-md mcs:bg-[#111] mcs:cursor-grab mcs:active:cursor-grabbing mcs:touch-none mcs:select-none'}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
            >
                <canvas ref={canvas} className={'mcs:absolute mcs:inset-0 mcs:size-full'} />

                <div
                    className={'mcs:absolute mcs:left-0 mcs:top-0 mcs:origin-top-left'}
                    style={{ transform: `translate(${size[0] / 2 - center[0] * scale}px, ${size[1] / 2 - center[1] * scale}px) scale(${scale})` }}
                >
                    {here.map((marker) => (
                        <div key={marker.key} className={'mcs:absolute mcs:flex mcs:flex-col mcs:items-center'} title={`${marker.name}: ${Math.round(marker.position[0])}, ${Math.round(marker.position[1])}, ${Math.round(marker.position[2])}`} style={{ left: marker.position[0], top: marker.position[2], transform: `translate(-50%, -12px) scale(${1 / scale})`, transformOrigin: 'center 12px' }}>
                            <PlayerHead server={server} skinKey={marker.key} className={cn('mcs:size-6 mcs:max-w-none mcs:shadow-lg', marker.online ? 'mcs:outline-2 mcs:outline-[#55ff55]' : 'mcs:outline-2 mcs:outline-white')} />
                            <span className={'mcs-font mcs:mt-1 mcs:whitespace-nowrap mcs:rounded mcs:bg-black/60 mcs:px-1 mcs:text-[10px] mcs:leading-tight mcs:text-white'}>{marker.name}</span>
                        </div>
                    ))}
                </div>

                {regions.isLoading && (
                    <div className={'mcs:absolute mcs:inset-0 mcs:flex mcs:items-center mcs:justify-center'}>
                        <Spinner />
                    </div>
                )}
                {regions.data && regions.data.length === 0 && (
                    <div className={'mcs:absolute mcs:inset-0 mcs:flex mcs:items-center mcs:justify-center mcs:text-sm mcs:text-white/70'}>Nobody has explored this dimension yet.</div>
                )}
                <div className={'mcs:absolute mcs:bottom-2 mcs:left-2 mcs:rounded mcs:bg-black/60 mcs:px-2 mcs:py-0.5 mcs:font-mono mcs:text-xs mcs:text-white'}>
                    {Math.round(center[0])}, {Math.round(center[1])}
                </div>
                {remaining > 0 && (
                    <div className={'mcs:absolute mcs:bottom-2 mcs:right-2 mcs:flex mcs:items-center mcs:gap-1.5 mcs:rounded mcs:bg-black/60 mcs:px-2 mcs:py-0.5 mcs:text-xs mcs:text-white'}>
                        <Spinner size={'small'} />
                        Drawing {remaining} {remaining === 1 ? 'region' : 'regions'}…
                    </div>
                )}
            </div>
        </div>
    );
}
