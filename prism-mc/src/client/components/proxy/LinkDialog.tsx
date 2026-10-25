import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Dialog, Input, Spinner, Switch, cn, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { NamedIcon } from '../../icons';
import { entryName, getCandidates, link, proxyKeys, type Candidate, type LinkedServer } from '../../api/proxy';
import SoftwareIcon from './SoftwareIcon';

interface Props {
    server: string;
    /** Which side this server is: a proxy picks game servers, a game server picks proxies. */
    side: 'proxy' | 'backend';
    onClose: () => void;
    onLinked: (restart: LinkedServer[]) => void;
}

/** Picks the server to link with, from those the user can open and manage, then the link details. */
export default function LinkDialog({ server, side, onClose, onLinked }: Props) {
    const candidates = useQuery({ queryKey: proxyKeys.candidates(server), queryFn: () => getCandidates(server) });
    const [search, setSearch] = useState('');
    const [chosen, setChosen] = useState<Candidate | null>(null);
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [fallback, setFallback] = useState(true);
    const [forcedHost, setForcedHost] = useState('');
    const [busy, setBusy] = useState(false);

    const list = useMemo(() => {
        const term = search.trim().toLowerCase();

        return (candidates.data ?? []).filter((candidate) => term === '' || candidate.name.toLowerCase().includes(term) || (candidate.software ?? '').includes(term));
    }, [candidates.data, search]);

    const choose = (candidate: Candidate) => {
        setChosen(candidate);
        // The proxy entry is named after the game server.
        setName(entryName(side === 'proxy' ? candidate.name : ''));
        setAddress(side === 'proxy' ? (candidate.address ?? '') : '');
    };

    const submit = async () => {
        if (!chosen) return;
        setBusy(true);
        try {
            const result = await link(server, {
                server: chosen.identifier,
                name,
                address: address.trim() || undefined,
                fallback,
                forcedHost: forcedHost.trim() || undefined,
            });
            toast.success(`Linked as ${result.linked} with ${result.mode} forwarding.`);
            onLinked(result.restart);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    const noun = side === 'proxy' ? 'server' : 'proxy';

    return (
        <Dialog open onClose={onClose} title={chosen ? `Link ${chosen.name}` : `Pick a ${noun}`} description={chosen ? undefined : `Only ${noun === 'proxy' ? 'proxies' : 'servers'} you can manage are listed.`}>
            {!chosen ? (
                <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
                    <div className={'mcs:relative'}>
                        <NamedIcon name={'search'} size={16} className={'mcs:absolute mcs:left-3 mcs:top-1/2 mcs:-translate-y-1/2 mcs:text-muted-foreground mcs:pointer-events-none'} />
                        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Find a ${noun}…`} className={'mcs:w-full mcs:pl-9'} />
                    </div>
                    {candidates.isLoading ? (
                        <Spinner centered />
                    ) : candidates.isError ? (
                        <Alert type={'danger'}>{httpErrorToHuman(candidates.error)}</Alert>
                    ) : list.length === 0 ? (
                        <p className={'mcs:py-6 mcs:text-center mcs:text-sm mcs:text-muted-foreground'}>
                            {side === 'proxy'
                                ? 'None of your servers can sit behind a proxy. Paper, Purpur, Spigot, Folia, Fabric and Pumpkin can.'
                                : 'You have no Velocity, BungeeCord or Waterfall server. Create one, or switch a server to Velocity on its Versions tab.'}
                        </p>
                    ) : (
                        <div className={'mcs:flex mcs:max-h-80 mcs:flex-col mcs:gap-2 mcs:overflow-y-auto'}>
                            {list.map((candidate) => {
                                const elsewhere = side === 'proxy' && candidate.linkedTo !== null;

                                return (
                                    <button
                                        key={candidate.identifier}
                                        type={'button'}
                                        disabled={elsewhere}
                                        onClick={() => choose(candidate)}
                                        className={cn(
                                            'mcs:flex mcs:items-center mcs:gap-3 mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:p-3 mcs:text-left',
                                            elsewhere ? 'mcs:opacity-50 mcs:cursor-not-allowed' : 'mcs:cursor-pointer mcs:hover:border-primary'
                                        )}
                                    >
                                        <SoftwareIcon src={candidate.icon} className={'mcs:size-9 mcs:shrink-0'} />
                                        <div className={'mcs:min-w-0 mcs:flex-1'}>
                                            <p className={'mcs:font-medium mcs:truncate'}>{candidate.name}</p>
                                            <p className={'mcs:text-xs mcs:text-muted-foreground mcs:truncate'}>
                                                {candidate.software}
                                                {candidate.version ? ` ${candidate.version}` : ''} · <span className={'mcs:font-mono'}>{candidate.address}</span>
                                            </p>
                                        </div>
                                        {elsewhere ? (
                                            <Badge size={'sm'} tone={'neutral'}>
                                                Linked elsewhere
                                            </Badge>
                                        ) : (
                                            <NamedIcon name={'chevron-right'} size={16} className={'mcs:text-muted-foreground'} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (
                <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                    <div className={'mcs:flex mcs:items-center mcs:gap-3 mcs:rounded-lg mcs:bg-muted/50 mcs:p-3'}>
                        <SoftwareIcon src={chosen.icon} className={'mcs:size-9'} />
                        <div className={'mcs:min-w-0 mcs:flex-1 mcs:text-sm'}>
                            <p className={'mcs:font-medium'}>{chosen.name}</p>
                            <p className={'mcs:text-xs mcs:text-muted-foreground'}>
                                {chosen.software} {chosen.version ?? ''}
                            </p>
                        </div>
                        <Button.Text size={'small'} onClick={() => setChosen(null)}>
                            Change
                        </Button.Text>
                    </div>

                    <label className={'mcs:flex mcs:flex-col mcs:gap-1'}>
                        <span className={'mcs:text-xs mcs:uppercase mcs:tracking-wide mcs:text-muted-foreground'}>Name on the proxy</span>
                        <Input value={name} onChange={(event) => setName(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} placeholder={'survival'} className={'mcs:font-mono'} />
                        <span className={'mcs:text-xs mcs:text-muted-foreground'}>What players type after /server.</span>
                    </label>
                    {side === 'proxy' && (
                        <label className={'mcs:flex mcs:flex-col mcs:gap-1'}>
                            <span className={'mcs:text-xs mcs:uppercase mcs:tracking-wide mcs:text-muted-foreground'}>Address</span>
                            <Input value={address} onChange={(event) => setAddress(event.target.value)} className={'mcs:font-mono'} />
                            <span className={'mcs:text-xs mcs:text-muted-foreground'}>Where the proxy reaches the server. The allocation is filled in.</span>
                        </label>
                    )}
                    <label className={'mcs:flex mcs:flex-col mcs:gap-1'}>
                        <span className={'mcs:text-xs mcs:uppercase mcs:tracking-wide mcs:text-muted-foreground'}>Forced host (optional)</span>
                        <Input value={forcedHost} onChange={(event) => setForcedHost(event.target.value)} placeholder={'survival.example.com'} className={'mcs:font-mono'} />
                        <span className={'mcs:text-xs mcs:text-muted-foreground'}>Players connecting through this domain go straight here. Velocity only.</span>
                    </label>
                    <Switch checked={fallback} onChange={setFallback} label={'Send players here on join'} description={'Adds it to the join order, after any servers already there.'} />

                    <Alert type={'info'}>
                        The game server stops checking accounts itself (online-mode=false) and trusts the proxy&apos;s forwarded players. Keep its port closed to the internet so only
                        the proxy can reach it.
                    </Alert>
                </div>
            )}
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                {chosen && (
                    <Button isLoading={busy} disabled={!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name)} onClick={submit}>
                        <NamedIcon name={'link'} size={14} /> Link
                    </Button>
                )}
            </Dialog.Footer>
        </Dialog>
    );
}
