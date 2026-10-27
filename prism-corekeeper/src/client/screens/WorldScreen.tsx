import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, ServerContentBlock, Spinner, fromNow, httpErrorToHuman } from '@pterodactyl/sdk';
import { bytes, keys } from '../api/client';
import { MODES, getFile, getWorld } from '../api/world';
import MapView from '../components/MapView';
import { useCoreKeeperInfo } from '../hooks/useCoreKeeperInfo';
import { NamedIcon } from '../icons';
import { parseMapParts, readMapFile, type MapPart } from '../lib/mapparts';

export default function WorldScreen() {
    const { identifier } = useCoreKeeperInfo();
    const world = useQuery({ queryKey: keys.world(identifier), queryFn: () => getWorld(identifier) });
    const [maps, setMaps] = useState<MapPart[][] | null>(null);
    const [source, setSource] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const picker = useRef<HTMLInputElement>(null);

    const open = async (label: string, load: () => Promise<ArrayBuffer[]>) => {
        setLoading(true);
        setProblem(null);
        try {
            const files = await load();
            const parsed = await Promise.all(files.map(async (file) => parseMapParts(await readMapFile(file))));
            if (parsed.every((parts) => parts.length === 0)) throw new Error('This map has nothing explored yet.');
            setMaps(parsed);
            setSource(label);
        } catch (error) {
            setProblem(error instanceof Error && !('response' in error) ? error.message : httpErrorToHuman(error));
        } finally {
            setLoading(false);
        }
    };

    // The server's own maps, drawn together, once they are known.
    const serverMaps = world.data?.maps ?? [];
    const opened = useRef(false);
    useEffect(() => {
        if (opened.current || serverMaps.length === 0) return;
        opened.current = true;
        void open('the server', () => Promise.all(serverMaps.slice(0, 8).map((map) => getFile(identifier, map.path))));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverMaps.length]);

    if (world.isLoading) {
        return (
            <ServerContentBlock title={'World'}>
                <Spinner centered />
            </ServerContentBlock>
        );
    }

    if (world.isError || !world.data) {
        return (
            <ServerContentBlock title={'World'}>
                <Alert type={'danger'}>{httpErrorToHuman(world.error)}</Alert>
            </ServerContentBlock>
        );
    }

    const data = world.data;
    const current = data.worlds.find((saved) => saved.slot === data.slot);

    return (
        <ServerContentBlock title={'World'}>
            <div className={'cks:flex cks:flex-col cks:gap-4'}>
                <div className={'pt-surface cks:flex cks:flex-wrap cks:items-center cks:gap-4 cks:rounded-md cks:border cks:border-border cks:bg-card cks:p-4'}>
                    <span className={'cks:flex cks:size-12 cks:items-center cks:justify-center cks:rounded-lg cks:bg-primary/15 cks:text-primary'}>
                        <NamedIcon name={'map'} size={22} />
                    </span>
                    <div className={'cks:min-w-0 cks:flex-1'}>
                        <p className={'cks:text-lg cks:font-semibold'}>{data.name ?? 'Core Keeper world'}</p>
                        <p className={'cks:text-xs cks:text-muted-foreground'}>
                            Slot {data.slot} · {MODES[data.mode] ?? `mode ${data.mode}`}
                            {data.seed && data.seed !== '0' ? ` · seed ${data.seed}` : ''}
                            {current ? ` · ${bytes(current.size)}, saved ${current.modified ? fromNow(current.modified) : ''}` : ' · not saved yet'}
                        </p>
                    </div>
                    <input
                        ref={picker}
                        type={'file'}
                        accept={'.gzip,.gz,.json'}
                        className={'cks:hidden'}
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file) void open(file.name, async () => [await file.arrayBuffer()]);
                        }}
                    />
                    <Button isSecondary onClick={() => picker.current?.click()}>
                        <NamedIcon name={'folder-open'} size={16} className={'cks:mr-1'} /> Open my map
                    </Button>
                </div>

                {problem && <Alert type={'warning'}>{problem}</Alert>}

                {loading ? (
                    <div className={'cks:flex cks:h-96 cks:items-center cks:justify-center'}>
                        <Spinner />
                    </div>
                ) : maps ? (
                    <div className={'cks:flex cks:flex-col cks:gap-2'}>
                        <MapView maps={maps} />
                        <p className={'cks:text-xs cks:text-muted-foreground'}>
                            Showing the explored map from {source}. Map files are read in your browser; a file you open from your computer is not uploaded.
                        </p>
                    </div>
                ) : (
                    <div className={'pt-surface cks:flex cks:flex-col cks:items-center cks:gap-3 cks:rounded-lg cks:border cks:border-dashed cks:border-border cks:bg-card cks:p-10 cks:text-center'}>
                        <NamedIcon name={'map'} size={36} className={'cks:text-muted-foreground'} />
                        <p className={'cks:max-w-lg cks:text-sm cks:text-muted-foreground'}>
                            {data.maps.length === 0
                                ? "The server keeps no map file yet: in Core Keeper the explored map is saved for each player. Open your own map to see it here. On Windows it is in %USERPROFILE%\\AppData\\LocalLow\\Pugstorm\\Core Keeper\\Steam\\<your id>\\maps\\<character>\\<n>.mapparts.gzip."
                                : 'Choose a map to draw.'}
                        </p>
                        <Button onClick={() => picker.current?.click()}>Open my map</Button>
                    </div>
                )}

                {data.worlds.length > 0 && (
                    <section className={'pt-surface cks:flex cks:flex-col cks:gap-2 cks:rounded-lg cks:border cks:border-border cks:bg-card cks:p-4'}>
                        <h2 className={'cks:font-semibold'}>Saved worlds</h2>
                        {data.worlds.map((saved) => (
                            <div key={saved.slot} className={'cks:flex cks:flex-wrap cks:items-center cks:gap-3 cks:text-sm'}>
                                <span className={'cks:font-medium'}>Slot {saved.slot}</span>
                                {saved.slot === data.slot && <span className={'cks:text-xs cks:text-primary'}>in use</span>}
                                <span className={'cks:flex-1 cks:text-muted-foreground'}>
                                    {bytes(saved.size)}
                                    {saved.modified ? ` · saved ${fromNow(saved.modified)}` : ''}
                                </span>
                                <Button.Text
                                    size={'small'}
                                    onClick={() =>
                                        void getFile(identifier, saved.path)
                                            .then((buffer) => {
                                                const link = document.createElement('a');
                                                link.href = URL.createObjectURL(new Blob([buffer], { type: 'application/gzip' }));
                                                link.download = `${saved.slot}.world.gzip`;
                                                link.click();
                                                window.setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
                                            })
                                            .catch((error) => setProblem(httpErrorToHuman(error)))
                                    }
                                >
                                    <NamedIcon name={'download'} size={14} className={'cks:mr-1'} /> Download
                                </Button.Text>
                            </div>
                        ))}
                        <p className={'cks:text-xs cks:text-muted-foreground'}>Change the slot the server opens under Properties.</p>
                    </section>
                )}
            </div>
        </ServerContentBlock>
    );
}
