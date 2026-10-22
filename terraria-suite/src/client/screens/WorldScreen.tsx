import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, NamedIcon, ProgressBar, ServerContentBlock, Spinner, TitledGreyBox, bytesToString, cn, formatDate, fromNow, httpErrorToHuman } from '@pterodactyl/sdk';
import { getWorld, getWorldFile, worldKeys } from '../api/world';
import { useTerrariaInfo } from '../hooks/useTerrariaInfo';
import { parseWorld, renderTiles, type WorldHeader } from '../lib/wld';

const MODES = ['Classic', 'Expert', 'Master', 'Journey'];

function sizeName(width: number): string {
    if (width <= 4200) return 'Small';
    if (width <= 6400) return 'Medium';
    if (width <= 8400) return 'Large';

    return 'Custom';
}

interface Loaded {
    header: WorldHeader;
    image: ImageData | null;
    error: string | null;
}

export default function WorldScreen() {
    const { identifier, info } = useTerrariaInfo();
    const overview = useQuery({ queryKey: worldKeys.overview(identifier), queryFn: () => getWorld(identifier) });
    const [stage, setStage] = useState<{ label: string; fraction: number } | null>(null);
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setError(null);
        setLoaded(null);
        try {
            setStage({ label: 'Downloading the world', fraction: 0 });
            const buffer = await getWorldFile(identifier, (fraction) => setStage({ label: 'Downloading the world', fraction }));
            const world = parseWorld(buffer);
            setStage({ label: 'Drawing the map', fraction: 0 });
            let image: ImageData | null = null;
            let mapError: string | null = null;
            try {
                image = await renderTiles(buffer, world, (fraction) => setStage({ label: 'Drawing the map', fraction }));
            } catch (exception) {
                mapError = exception instanceof Error ? exception.message : String(exception);
            }
            setLoaded({ header: world.header, image, error: mapError });
        } catch (exception) {
            setError(exception instanceof Error && !('response' in exception) ? exception.message : httpErrorToHuman(exception));
        } finally {
            setStage(null);
        }
    };

    const tooBig = overview.data?.size != null && overview.data.size > overview.data.maxBytes;

    useEffect(() => {
        if (overview.data?.exists && !tooBig && !loaded && !stage && !error) load();
        // Loads once when the page opens; the reload button loads again.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [overview.data]);

    if (overview.isLoading) {
        return (
            <ServerContentBlock title={'World'}>
                <Spinner centered />
            </ServerContentBlock>
        );
    }

    if (overview.isError || !overview.data) {
        return (
            <ServerContentBlock title={'World'}>
                <Alert type={'danger'}>{httpErrorToHuman(overview.error)}</Alert>
            </ServerContentBlock>
        );
    }

    const world = overview.data;
    const header = loaded?.header;

    return (
        <ServerContentBlock title={'World'}>
            <div className={'trs:flex trs:flex-col trs:gap-4'}>
                {!world.exists ? (
                    <Alert type={'info'}>There is no world at {world.path} yet. The server creates it the first time it starts.</Alert>
                ) : tooBig ? (
                    <Alert type={'warning'}>
                        The world file is {bytesToString(world.size ?? 0)}, more than the {bytesToString(world.maxBytes)} an administrator allowed for the map. It can be raised in
                        the Terraria Suite settings.
                    </Alert>
                ) : null}
                {error && <Alert type={'danger'}>{error}</Alert>}

                <div className={'trs:grid trs:gap-4 trs:lg:grid-cols-[1fr_320px]'}>
                    <TitledGreyBox title={header?.name ?? world.name}>
                        <div className={'trs:flex trs:flex-col trs:gap-3'}>
                            <div className={'trs:flex trs:flex-wrap trs:gap-2'}>
                                {header && (
                                    <>
                                        <Badge tone={'neutral'}>
                                            {sizeName(header.width)} · {header.width} × {header.height}
                                        </Badge>
                                        <Badge tone={header.gameMode === 2 ? 'danger' : header.gameMode === 1 ? 'warning' : header.gameMode === 3 ? 'info' : 'neutral'}>{MODES[header.gameMode] ?? 'Unknown mode'}</Badge>
                                        <Badge tone={header.crimson ? 'danger' : 'info'}>{header.crimson ? 'Crimson' : 'Corruption'}</Badge>
                                        {!header.partial && <Badge tone={header.hardMode ? 'warning' : 'neutral'}>{header.hardMode ? 'Hardmode' : 'Pre-hardmode'}</Badge>}
                                        {header.secretSeeds.map((seed) => (
                                            <Badge key={seed} tone={'info'}>
                                                {seed}
                                            </Badge>
                                        ))}
                                        {header.bloodMoon && <Badge tone={'danger'}>Blood Moon</Badge>}
                                        {header.eclipse && <Badge tone={'warning'}>Solar eclipse</Badge>}
                                        {header.raining && <Badge tone={'info'}>Raining</Badge>}
                                    </>
                                )}
                            </div>
                            <dl className={'trs:grid trs:grid-cols-[auto_1fr] trs:gap-x-4 trs:gap-y-1 trs:text-sm'}>
                                {header?.seed && (
                                    <>
                                        <dt className={'trs:text-muted-foreground'}>Seed</dt>
                                        <dd className={'trs:font-mono'}>{header.seed}</dd>
                                    </>
                                )}
                                <dt className={'trs:text-muted-foreground'}>File</dt>
                                <dd className={'trs:font-mono trs:truncate'}>
                                    {world.path}
                                    {world.size !== null && ` · ${bytesToString(world.size)}`}
                                </dd>
                                {world.modified && (
                                    <>
                                        <dt className={'trs:text-muted-foreground'}>Last saved</dt>
                                        <dd>{fromNow(world.modified)}</dd>
                                    </>
                                )}
                                {header?.created && (
                                    <>
                                        <dt className={'trs:text-muted-foreground'}>Created</dt>
                                        <dd>{formatDate(header.created.toISOString(), 'MMM D, YYYY')}</dd>
                                    </>
                                )}
                                {world.version !== null && (
                                    <>
                                        <dt className={'trs:text-muted-foreground'}>Saved by</dt>
                                        <dd>{world.terraria ? `Terraria ${world.terraria}` : `world version ${world.version}`}</dd>
                                    </>
                                )}
                            </dl>
                            {info?.kind === 'tmodloader' && world.modData && (
                                <p className={'trs:text-xs trs:text-muted-foreground'}>Modded blocks are kept in {world.name}.twld and are not drawn on the map.</p>
                            )}
                        </div>
                    </TitledGreyBox>

                    <TitledGreyBox title={'Bosses'}>
                        {header && header.bosses.length > 0 ? (
                            <div className={'trs:flex trs:flex-col trs:gap-1'}>
                                {header.bosses.map(([name, done]) => (
                                    <div key={name} className={'trs:flex trs:items-center trs:gap-2 trs:text-sm'}>
                                        <NamedIcon name={done ? 'circle-check' : 'circle'} size={14} className={done ? 'trs:text-success' : 'trs:text-muted-foreground'} />
                                        <span className={cn(!done && 'trs:text-muted-foreground')}>{name}</span>
                                    </div>
                                ))}
                                <div className={'trs:mt-2 trs:flex trs:flex-wrap trs:gap-1'}>
                                    {header.events.filter(([, done]) => done).map(([name]) => (
                                        <Badge key={name} size={'sm'} tone={'success'}>
                                            {name}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <p className={'trs:text-sm trs:text-muted-foreground'}>{header?.partial ? 'This world version stores its progress in a way the page cannot read yet.' : 'Shown once the world is loaded.'}</p>
                        )}
                    </TitledGreyBox>
                </div>

                <TitledGreyBox title={'Map'}>
                    {stage ? (
                        <div className={'trs:flex trs:flex-col trs:gap-2 trs:py-6'}>
                            <span className={'trs:text-sm trs:text-muted-foreground'}>{stage.label}…</span>
                            <ProgressBar value={Math.round(stage.fraction * 100)} />
                        </div>
                    ) : loaded?.image && header ? (
                        <WorldMap image={loaded.image} header={header} onReload={load} />
                    ) : loaded?.error ? (
                        <Alert type={'warning'}>The world details were read, but the map could not be drawn: {loaded.error}</Alert>
                    ) : world.exists && !tooBig ? (
                        <Button onClick={load}>Load the map</Button>
                    ) : (
                        <p className={'trs:text-sm trs:text-muted-foreground'}>No map to show.</p>
                    )}
                </TitledGreyBox>
            </div>
        </ServerContentBlock>
    );
}

interface View {
    scale: number;
    x: number;
    y: number;
}

function WorldMap({ image, header, onReload }: { image: ImageData; header: WorldHeader; onReload: () => void }) {
    const wrapper = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const source = useRef<HTMLCanvasElement | null>(null);
    const view = useRef<View>({ scale: 1, x: 0, y: 0 });
    const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
    const [, redraw] = useState(0);

    const draw = () => {
        const target = canvas.current;
        const full = source.current;
        if (!target || !full) return;

        const context = target.getContext('2d')!;
        const { scale, x, y } = view.current;
        context.imageSmoothingEnabled = scale < 1;
        context.fillStyle = '#0b0f19';
        context.fillRect(0, 0, target.width, target.height);
        context.drawImage(full, x, y, image.width * scale, image.height * scale);

        const marker = (tileX: number, tileY: number, colour: string, label: string) => {
            const px = x + (tileX + 0.5) * scale;
            const py = y + (tileY + 0.5) * scale;
            context.beginPath();
            context.arc(px, py, 6, 0, Math.PI * 2);
            context.fillStyle = colour;
            context.fill();
            context.lineWidth = 2;
            context.strokeStyle = '#000';
            context.stroke();
            context.font = '600 12px sans-serif';
            context.fillStyle = '#fff';
            context.strokeStyle = '#000';
            context.lineWidth = 3;
            context.strokeText(label, px + 9, py + 4);
            context.fillText(label, px + 9, py + 4);
        };
        marker(header.spawn.x, header.spawn.y, '#22c55e', 'Spawn');
        marker(header.dungeon.x, header.dungeon.y, '#3b82f6', 'Dungeon');
    };

    const fit = () => {
        const target = canvas.current;
        if (!target) return;

        const scale = Math.min(target.width / image.width, target.height / image.height);
        view.current = { scale, x: (target.width - image.width * scale) / 2, y: (target.height - image.height * scale) / 2 };
        draw();
        redraw((value) => value + 1);
    };

    const zoomAt = (factor: number, cx: number, cy: number) => {
        const current = view.current;
        const target = canvas.current!;
        const minimum = Math.min(target.width / image.width, target.height / image.height) * 0.5;
        const scale = Math.min(16, Math.max(minimum, current.scale * factor));
        view.current = { scale, x: cx - ((cx - current.x) * scale) / current.scale, y: cy - ((cy - current.y) * scale) / current.scale };
        draw();
        redraw((value) => value + 1);
    };

    useEffect(() => {
        const full = document.createElement('canvas');
        full.width = image.width;
        full.height = image.height;
        full.getContext('2d')!.putImageData(image, 0, 0);
        source.current = full;

        const target = canvas.current!;
        const resize = () => {
            const box = wrapper.current!.getBoundingClientRect();
            target.width = Math.max(200, Math.floor(box.width));
            // As tall as the world's shape needs at full width, up to most of the window.
            target.height = Math.max(200, Math.min(Math.ceil((box.width * image.height) / image.width), Math.floor(window.innerHeight * 0.7)));
            fit();
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(wrapper.current!);

        // React's wheel listener is passive, so the page would scroll while zooming.
        const wheel = (event: WheelEvent) => {
            event.preventDefault();
            const box = target.getBoundingClientRect();
            zoomAt(event.deltaY < 0 ? 1.25 : 0.8, event.clientX - box.left, event.clientY - box.top);
        };
        target.addEventListener('wheel', wheel, { passive: false });

        return () => {
            observer.disconnect();
            target.removeEventListener('wheel', wheel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [image]);

    const drag = useRef<{ x: number; y: number } | null>(null);

    const download = () => {
        source.current?.toBlob((blob) => {
            if (!blob) return;
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${header.name || 'world'}.png`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        });
    };

    const depth = (tileY: number) => {
        // Terraria's depth meter counts feet (half a tile each) from the surface.
        const feet = Math.round((tileY - header.surface) * 2);
        if (tileY > header.height - 200) return 'Underworld';

        return feet <= 0 ? `${-feet} ft above surface` : `${feet} ft below surface`;
    };

    const position = (tileX: number) => {
        const feet = Math.round((tileX - header.width / 2) * 2);

        return feet === 0 ? 'Center' : `${Math.abs(feet)} ft ${feet > 0 ? 'east' : 'west'}`;
    };

    return (
        <div className={'trs:flex trs:flex-col trs:gap-2'}>
            <div className={'trs:flex trs:flex-wrap trs:items-center trs:gap-2'}>
                <Button size={'small'} isSecondary onClick={() => zoomAt(1.5, canvas.current!.width / 2, canvas.current!.height / 2)} aria-label={'Zoom in'}>
                    <NamedIcon name={'zoom-in'} size={14} />
                </Button>
                <Button size={'small'} isSecondary onClick={() => zoomAt(1 / 1.5, canvas.current!.width / 2, canvas.current!.height / 2)} aria-label={'Zoom out'}>
                    <NamedIcon name={'zoom-out'} size={14} />
                </Button>
                <Button size={'small'} isSecondary onClick={fit}>
                    Fit
                </Button>
                <Button size={'small'} isSecondary onClick={download}>
                    <NamedIcon name={'download'} size={14} /> PNG
                </Button>
                <Button size={'small'} isSecondary onClick={onReload}>
                    <NamedIcon name={'refresh-cw'} size={14} /> Reload
                </Button>
                <span className={'trs:ml-auto trs:text-xs trs:text-muted-foreground'}>
                    {hover ? `${position(hover.x)} · ${depth(hover.y)} (tile ${hover.x}, ${hover.y})` : 'Scroll to zoom, drag to move.'}
                </span>
            </div>
            <div ref={wrapper} className={'trs:w-full trs:overflow-hidden trs:rounded-md trs:border trs:border-border'}>
                <canvas
                    ref={canvas}
                    className={'trs:block trs:cursor-grab trs:touch-none trs:active:cursor-grabbing'}
                    style={{ imageRendering: 'pixelated' }}
                    onPointerDown={(event) => {
                        drag.current = { x: event.clientX, y: event.clientY };
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                        const box = event.currentTarget.getBoundingClientRect();
                        const { scale, x, y } = view.current;
                        const tileX = Math.floor((event.clientX - box.left - x) / scale);
                        const tileY = Math.floor((event.clientY - box.top - y) / scale);
                        setHover(tileX >= 0 && tileY >= 0 && tileX < image.width && tileY < image.height ? { x: tileX, y: tileY } : null);

                        if (drag.current) {
                            view.current = { ...view.current, x: x + event.clientX - drag.current.x, y: y + event.clientY - drag.current.y };
                            drag.current = { x: event.clientX, y: event.clientY };
                            draw();
                        }
                    }}
                    onPointerUp={() => (drag.current = null)}
                    onPointerLeave={() => setHover(null)}
                />
            </div>
            <p className={'trs:text-xs trs:text-muted-foreground'}>The map shows the world as it was last saved. Terraria saves when the world is saved or the server stops.</p>
        </div>
    );
}
