import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Spinner, cn, http } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { base } from '../api/client';
import { readRegion } from '../lib/anvil';
import { blockColor, type Rgb } from '../lib/blockColors';
import PlayerHead from './players/PlayerHead';

export type Dimension = 'overworld' | 'the_nether' | 'the_end';

const DIMENSIONS: { value: Dimension; label: string }[] = [
    { value: 'overworld', label: 'Overworld' },
    { value: 'the_nether', label: 'Nether' },
    { value: 'the_end', label: 'End' },
];

const REGION = 512;
/**
 * Every region drawn this visit, by server, dimension, place and save time. A region that comes
 * back into view is painted from here, without downloading or reading its file again.
 */
const drawn = new Map<string, ImageData>();
const ZOOMS = [0.25, 0.5, 1, 2, 4];

interface RegionInfo {
    x: number;
    z: number;
    size: number;
    modified: string | null;
}

/** Draws one region file into a 512×512 canvas, shading by height like an in-game map. */
function RegionTile({ server, dimension, region }: { server: string; dimension: Dimension; region: RegionInfo }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const cacheKey = `${server}:${dimension}:${region.x}:${region.z}:${region.modified}`;
    const cached = drawn.get(cacheKey);
    const [progress, setProgress] = useState(cached ? 1 : 0);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (cached) canvas.current?.getContext('2d')?.putImageData(cached, 0, 0);
    }, [cached]);

    const file = useQuery({
        enabled: !cached,
        queryKey: ['prism-mc', server, 'map', dimension, region.x, region.z, region.modified],
        queryFn: async () => (await http.get<ArrayBuffer>(`${base(server)}/map/${dimension}/${region.x}/${region.z}`, { responseType: 'arraybuffer' })).data,
        staleTime: 300_000,
        gcTime: 600_000,
    });

    useEffect(() => {
        let cancelled = false;
        if (cached || !file.data || !canvas.current) return;

        (async () => {
            const surface = await readRegion(file.data, dimension, (fraction) => !cancelled && setProgress(fraction));
            if (cancelled || !canvas.current) return;

            const colors: Rgb[] = await Promise.all(surface.names.map((name) => blockColor(name)));
            if (cancelled || !canvas.current) return;

            const context = canvas.current.getContext('2d')!;
            const image = context.createImageData(REGION, REGION);
            for (let z = 0; z < REGION; z++) {
                for (let x = 0; x < REGION; x++) {
                    const pixel = z * REGION + x;
                    const index = surface.blocks[pixel];
                    if (index === 0) continue;

                    const color = colors[index];
                    let shade = 1;
                    const depth = surface.waterDepth[pixel];
                    if (depth > 0) {
                        shade = 1.05 - Math.min(depth, 12) * 0.035;
                    } else if (z > 0 && surface.blocks[pixel - REGION] !== 0) {
                        const difference = surface.heights[pixel] - surface.heights[pixel - REGION];
                        shade = difference > 0 ? 1.12 : difference < 0 ? 0.82 : 1;
                    }

                    const offset = pixel * 4;
                    image.data[offset] = Math.min(255, color[0] * shade);
                    image.data[offset + 1] = Math.min(255, color[1] * shade);
                    image.data[offset + 2] = Math.min(255, color[2] * shade);
                    image.data[offset + 3] = 255;
                }
            }

            context.putImageData(image, 0, 0);
            drawn.set(cacheKey, image);
        })().catch(() => !cancelled && setFailed(true));

        return () => {
            cancelled = true;
        };
    }, [file.data, dimension, cacheKey, cached]);

    return (
        <div className={'mcs:absolute'} style={{ left: region.x * REGION, top: region.z * REGION, width: REGION, height: REGION }}>
            <canvas ref={canvas} width={REGION} height={REGION} className={'mcs-pixelated mcs:size-full'} />
            {!cached && (file.isLoading || (progress < 1 && !failed && !file.isError)) && (
                <div className={'mcs:absolute mcs:inset-0 mcs:flex mcs:items-center mcs:justify-center mcs:bg-black/20 mcs:text-white mcs:text-xs'}>
                    {file.isLoading ? 'Downloading…' : `Drawing ${Math.round(progress * 100)}%`}
                </div>
            )}
        </div>
    );
}

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
 */
export default function WorldMap({ server, markers, focus, height = 560 }: { server: string; markers: Marker[]; focus: Focus | null; height?: number }) {
    const [dimension, setDimension] = useState<Dimension>(focus?.dimension ?? 'overworld');
    const [zoom, setZoom] = useState(1);
    const [center, setCenter] = useState<[number, number]>(() => (focus ? [focus.x, focus.z] : [0, 0]));
    const [size, setSize] = useState<[number, number]>([800, 420]);
    const box = useRef<HTMLDivElement>(null);
    const drag = useRef<{ x: number; z: number; pointerX: number; pointerY: number } | null>(null);

    // React's wheel listener is passive, so it cannot stop the page scrolling under the map.
    useEffect(() => {
        const element = box.current;
        if (!element) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            setZoom((current) => Math.max(0, Math.min(ZOOMS.length - 1, current + (event.deltaY < 0 ? 1 : -1))));
        };
        element.addEventListener('wheel', onWheel, { passive: false });

        return () => element.removeEventListener('wheel', onWheel);
    }, []);

    const regions = useQuery({
        queryKey: ['prism-mc', server, 'map', dimension],
        queryFn: async () => (await http.get<{ regions: RegionInfo[] }>(`${base(server)}/map/${dimension}`)).data.regions,
        staleTime: 120_000,
    });

    useEffect(() => {
        const element = box.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => setSize([entry.contentRect.width, entry.contentRect.height]));
        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    const here = markers.filter((marker) => marker.dimension === dimension);

    // Centre on the players in view, or on 0, 0 when there are none.
    const recenter = () => {
        if (here.length === 0) return setCenter([0, 0]);
        setCenter([here.reduce((sum, marker) => sum + marker.position[0], 0) / here.length, here.reduce((sum, marker) => sum + marker.position[2], 0) / here.length]);
    };

    useEffect(() => {
        if (!focus) return;
        setDimension(focus.dimension);
        setCenter([focus.x, focus.z]);
        setZoom((current) => Math.max(current, 2));
    }, [focus]);

    const scale = ZOOMS[zoom];
    const halfWidth = size[0] / 2 / scale;
    const halfHeight = size[1] / 2 / scale;

    // Only regions in view, plus a margin, are downloaded.
    const visible = useMemo(
        () =>
            (regions.data ?? []).filter(
                (region) =>
                    (region.x + 1) * REGION > center[0] - halfWidth - REGION / 2 &&
                    region.x * REGION < center[0] + halfWidth + REGION / 2 &&
                    (region.z + 1) * REGION > center[1] - halfHeight - REGION / 2 &&
                    region.z * REGION < center[1] + halfHeight + REGION / 2
            ),
        [regions.data, center, halfWidth, halfHeight]
    );

    const onPointerDown = (event: ReactPointerEvent) => {
        (event.target as Element).setPointerCapture?.(event.pointerId);
        drag.current = { x: center[0], z: center[1], pointerX: event.clientX, pointerY: event.clientY };
    };

    const onPointerMove = (event: ReactPointerEvent) => {
        if (!drag.current) return;
        setCenter([drag.current.x - (event.clientX - drag.current.pointerX) / scale, drag.current.z - (event.clientY - drag.current.pointerY) / scale]);
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
                    <Button.Text size={'small'} disabled={zoom === 0} onClick={() => setZoom(zoom - 1)} aria-label={'Zoom out'}>
                        <NamedIcon name={'minus'} size={16} />
                    </Button.Text>
                    <Button.Text size={'small'} disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom(zoom + 1)} aria-label={'Zoom in'}>
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
                <div
                    className={'mcs:absolute mcs:left-0 mcs:top-0 mcs:origin-top-left'}
                    style={{ transform: `translate(${size[0] / 2 - center[0] * scale}px, ${size[1] / 2 - center[1] * scale}px) scale(${scale})` }}
                >
                    {visible.map((region) => (
                        <RegionTile key={`${dimension}:${region.x}:${region.z}`} server={server} dimension={dimension} region={region} />
                    ))}
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
            </div>
        </div>
    );
}
