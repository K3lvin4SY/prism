import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Dialog, Input, PageContentBlock, ProgressBar, Select, Spinner, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { createServer, deleteServer, getMe, meKey, type Me, type MyServer } from '../api';
import { NamedIcon } from '../icons';
import { canCreate, mib, misfit, percentUsed, suggested, type Size } from '../lib/quota';

const eyebrow = 'pqt:font-mono pqt:text-xs pqt:font-medium pqt:uppercase pqt:tracking-[0.18em] pqt:text-muted-foreground';
const card = 'pt-surface pqt:overflow-hidden pqt:rounded-xl pqt:border pqt:border-border pqt:bg-card';

/** The account's "Create a server": the person's quota, a form to create a server in it, and the servers made here. */
export default function CreateServerScreen() {
    const query = useQuery({ queryKey: meKey, queryFn: getMe });
    const me = query.data;

    return (
        <PageContentBlock title={'Create a server'}>
            <div className={'pqt:mx-auto pqt:flex pqt:w-full pqt:max-w-4xl pqt:flex-col pqt:gap-4'}>
                {query.isLoading && <Spinner centered />}
                {query.isError && <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>}
                {me && !me.allowed && <Alert type={'info'}>{me.reason}</Alert>}
                {me?.allowed && me.limits && <QuotaCard me={me} />}
                {me?.allowed && <CreateForm key={me.usage.servers} me={me} />}
                {me && me.servers.length > 0 && <MyServers me={me} />}
            </div>
        </PageContentBlock>
    );
}

function QuotaCard({ me }: { me: Me }) {
    const limits = me.limits!;
    const rows: { label: string; used: number; limit: number; show: (value: number) => string }[] = [
        { label: 'Servers', used: me.usage.servers, limit: limits.servers, show: String },
        { label: 'Memory', used: me.usage.memory, limit: limits.memory, show: mib },
        { label: 'Disk', used: me.usage.disk, limit: limits.disk, show: mib },
        { label: 'CPU', used: me.usage.cpu, limit: limits.cpu, show: (value) => `${value}%` },
    ];

    return (
        <section className={card + ' pqt:p-5'}>
            <h2 className={'pqt:mb-1 pqt:font-header pqt:text-lg pqt:font-semibold'}>Your quota</h2>
            <p className={'pqt:mb-4 pqt:text-sm pqt:text-muted-foreground'}>
                Counted over every server you own. Each server also gets {limits.backups} {limits.backups === 1 ? 'backup' : 'backups'}, {limits.databases} {limits.databases === 1 ? 'database' : 'databases'} and {limits.allocations} {limits.allocations === 1 ? 'port' : 'ports'}.
            </p>
            <div className={'pqt:grid pqt:gap-4 pqt:sm:grid-cols-2'}>
                {rows.map((row) => {
                    const percent = percentUsed(row.used, row.limit);

                    return (
                        <div key={row.label} className={'pqt:flex pqt:flex-col pqt:gap-1.5'}>
                            <div className={'pqt:flex pqt:justify-between pqt:text-sm'}>
                                <span className={eyebrow}>{row.label}</span>
                                <span className={'pqt:text-muted-foreground'}>
                                    {row.show(row.used)} of {row.show(row.limit)}
                                </span>
                            </div>
                            <ProgressBar value={percent} tone={percent >= 100 ? 'danger' : percent >= 80 ? 'warning' : 'success'} label={row.label} />
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function CreateForm({ me }: { me: Me }) {
    const client = useQueryClient();
    const remaining = me.remaining!;
    const room = canCreate(remaining, me.minimum);
    const [name, setName] = useState('');
    const [offer, setOffer] = useState<number | null>(me.offers[0]?.id ?? null);
    const [location, setLocation] = useState<number | null>(null);
    const [size, setSize] = useState<Size>(() => (room ? suggested(remaining, me.minimum) : me.minimum));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const picked = me.offers.find((item) => item.id === offer);

    useEffect(() => {
        if (picked && !picked.locations.some((item) => item.id === location)) setLocation(picked.locations[0]?.id ?? null);
    }, [picked, location]);

    if (me.offers.length === 0) return <Alert type={'info'}>There is nothing to create yet: an administrator has not chosen which kinds of server are offered.</Alert>;
    if (!room) return <Alert type={'warning'}>{remaining.servers < 1 ? 'You have as many servers as your quota allows. Delete one to make room.' : 'What is left of your quota is less than the smallest server. Delete a server or make one smaller to make room.'}</Alert>;

    const problem = misfit(remaining, size);
    const field = (key: keyof Size, label: string, unit: string, step: number) => (
        <label className={'pqt:flex pqt:flex-col pqt:gap-1.5'}>
            <span className={eyebrow + ' pqt:flex pqt:justify-between'}>
                {label}
                <span className={'pqt:normal-case pqt:tracking-normal'}>
                    {me.minimum[key]}–{remaining[key]} {unit}
                </span>
            </span>
            <input type={'range'} min={me.minimum[key]} max={remaining[key]} step={step} value={size[key]} className={'pqt:w-full pqt:accent-primary'} onChange={(event) => setSize((all) => ({ ...all, [key]: Number(event.target.value) }))} />
            <Input type={'number'} min={me.minimum[key]} max={remaining[key]} step={step} value={size[key]} onChange={(event) => setSize((all) => ({ ...all, [key]: Number(event.target.value) || 0 }))} />
        </label>
    );

    const create = async () => {
        if (!offer || !location) return;
        setBusy(true);
        setError(null);
        try {
            const made = await createServer({ name: name.trim(), offer_id: offer, location_id: location, ...size });
            toast.success(`${made.name} is being installed. It starts by itself when it is ready.`);
            setName('');
            await client.invalidateQueries({ queryKey: meKey });
        } catch (caught) {
            setError(httpErrorToHuman(caught));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className={card}>
            <header className={'pqt:border-b pqt:border-border pqt:px-5 pqt:py-4'}>
                <h2 className={'pqt:font-header pqt:text-lg pqt:font-semibold'}>New server</h2>
                <p className={'pqt:text-sm pqt:text-muted-foreground'}>It is installed on a node with room and is yours like any other server.</p>
            </header>
            <div className={'pqt:grid pqt:gap-4 pqt:p-5 pqt:sm:grid-cols-2'}>
                {error && (
                    <div className={'pqt:sm:col-span-2'}>
                        <Alert type={'danger'}>{error}</Alert>
                    </div>
                )}
                <label className={'pqt:flex pqt:flex-col pqt:gap-1.5 pqt:sm:col-span-2'}>
                    <span className={eyebrow}>Name</span>
                    <Input value={name} maxLength={191} placeholder={'My survival world'} onChange={(event) => setName(event.target.value)} />
                </label>
                <div className={'pqt:flex pqt:flex-col pqt:gap-1.5'}>
                    <span className={eyebrow}>Kind</span>
                    <Select value={offer} options={me.offers.map((item) => ({ value: item.id, label: item.label }))} onChange={(value) => setOffer(Number(value))} />
                    {picked?.description && <span className={'pqt:text-xs pqt:text-muted-foreground'}>{picked.description}</span>}
                </div>
                <div className={'pqt:flex pqt:flex-col pqt:gap-1.5'}>
                    <span className={eyebrow}>Location</span>
                    <Select value={location} placeholder={'No location'} options={(picked?.locations ?? []).map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => setLocation(Number(value))} />
                </div>
                {field('memory', 'Memory', 'MiB', 256)}
                {field('disk', 'Disk', 'MiB', 1024)}
                {field('cpu', 'CPU', '%', 10)}
                <p className={'pqt:self-end pqt:text-xs pqt:text-muted-foreground'}>100% CPU is one full thread. Memory and disk can be changed later only by an administrator.</p>
                {problem && (
                    <div className={'pqt:sm:col-span-2'}>
                        <Alert type={'warning'}>{problem}</Alert>
                    </div>
                )}
            </div>
            <footer className={'pqt:flex pqt:justify-end pqt:border-t pqt:border-border pqt:px-5 pqt:py-3'}>
                <Button disabled={name.trim() === '' || !offer || !location || problem !== null} isLoading={busy} onClick={() => void create()}>
                    <NamedIcon name={'plus'} size={16} className={'pqt:mr-1'} /> Create server
                </Button>
            </footer>
        </section>
    );
}

function MyServers({ me }: { me: Me }) {
    const client = useQueryClient();
    const [removing, setRemoving] = useState<MyServer | null>(null);
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);

    return (
        <section className={card}>
            <header className={'pqt:border-b pqt:border-border pqt:px-5 pqt:py-4'}>
                <h2 className={'pqt:font-header pqt:text-lg pqt:font-semibold'}>Made here</h2>
                <p className={'pqt:text-sm pqt:text-muted-foreground'}>{me.can_delete ? 'Deleting one frees its share of your quota.' : 'Ask an administrator to delete one.'}</p>
            </header>
            {me.servers.map((server) => (
                <div key={server.id} className={'pqt:flex pqt:flex-wrap pqt:items-center pqt:gap-3 pqt:border-b pqt:border-border pqt:px-5 pqt:py-3 pqt:last:border-b-0'}>
                    <div className={'pqt:min-w-0 pqt:flex-1'}>
                        <a href={`/server/${server.short}`} className={'pqt:font-semibold pqt:hover:underline'}>
                            {server.name}
                        </a>
                        <p className={'pqt:text-xs pqt:text-muted-foreground'}>
                            {mib(server.memory)} memory · {mib(server.disk)} disk · {server.cpu}% CPU{server.status === 'installing' ? ' · installing' : ''}
                        </p>
                    </div>
                    {me.can_delete && (
                        <Button.Danger
                            size={'small'}
                            isSecondary
                            onClick={() => {
                                setTyped('');
                                setRemoving(server);
                            }}
                        >
                            Delete
                        </Button.Danger>
                    )}
                </div>
            ))}

            {removing && (
                <Dialog open onClose={() => setRemoving(null)} title={`Delete ${removing.name}?`}>
                    <div className={'pqt:flex pqt:flex-col pqt:gap-3'}>
                        <p className={'pqt:text-sm'}>The server and all its files and backups are deleted for good. Type its name to confirm.</p>
                        <Input value={typed} placeholder={removing.name} onChange={(event) => setTyped(event.target.value)} />
                    </div>
                    <Dialog.Footer>
                        <Button.Text onClick={() => setRemoving(null)}>Cancel</Button.Text>
                        <Button.Danger
                            disabled={typed !== removing.name}
                            isLoading={busy}
                            onClick={async () => {
                                setBusy(true);
                                try {
                                    await deleteServer(removing.id, typed);
                                    toast.success(`${removing.name} was deleted.`);
                                    setRemoving(null);
                                    await client.invalidateQueries({ queryKey: meKey });
                                } catch (error) {
                                    toast.error(httpErrorToHuman(error));
                                } finally {
                                    setBusy(false);
                                }
                            }}
                        >
                            Delete server
                        </Button.Danger>
                    </Dialog.Footer>
                </Dialog>
            )}
        </section>
    );
}
