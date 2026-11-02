import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Dialog, Select, Spinner, httpErrorToHuman } from '@pterodactyl/sdk';
import { getNodeServers, queueMoves, type NodeHealth } from '../api';
import { megabytes } from '../lib/format';

const eyebrow = 'pnd:font-mono pnd:text-xs pnd:font-medium pnd:uppercase pnd:tracking-[0.18em] pnd:text-muted-foreground';

/** Picking servers on a node and where they go. They move one at a time, starting within a minute. */
export default function MoveDialog({ node, nodes, onClose, onQueued }: { node: NodeHealth; nodes: NodeHealth[]; onClose: () => void; onQueued: (queued: number) => void }) {
    const servers = useQuery({ queryKey: ['prism-nodes', 'servers', node.id], queryFn: () => getNodeServers(node.id) });
    const targets = nodes.filter((item) => item.id !== node.id);
    const [target, setTarget] = useState<number | null>(targets.find((item) => !item.maintenance)?.id ?? null);
    const [picked, setPicked] = useState<number[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const all = servers.data ?? [];
    const chosen = all.filter((server) => picked.includes(server.id));
    const ports = chosen.reduce((sum, server) => sum + Math.max(1, server.ports), 0);
    const targetNode = targets.find((item) => item.id === target);

    const queue = async () => {
        if (!target) return;
        setBusy(true);
        setError(null);
        try {
            const result = await queueMoves(target, picked);
            onQueued(result.queued);
        } catch (caught) {
            setError(httpErrorToHuman(caught));
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} preventExternalClose title={`Move servers from ${node.name}`}>
            <div className={'pnd:flex pnd:flex-col pnd:gap-4'}>
                {error && <Alert type={'danger'}>{error}</Alert>}
                <p className={'pnd:text-sm pnd:text-muted-foreground'}>
                    Each server is stopped, archived and copied to the new node by the panel's own transfer, one server at a time. It keeps its ports where they are free on the new node and gets free ones where not. People cannot use a server while it moves.
                </p>
                <div className={'pnd:flex pnd:flex-col pnd:gap-1.5'}>
                    <span className={eyebrow}>To</span>
                    <Select
                        value={target}
                        placeholder={'Pick a node'}
                        options={targets.map((item) => ({ value: item.id, label: `${item.name}${item.maintenance ? ' (maintenance)' : ''} · ${item.free_allocations} free ports`, textLabel: item.name }))}
                        onChange={(value) => setTarget(Number(value))}
                    />
                </div>
                <fieldset className={'pnd:flex pnd:flex-col pnd:gap-1.5'}>
                    <legend className={eyebrow + ' pnd:mb-1.5 pnd:flex pnd:w-full pnd:justify-between'}>
                        Servers
                        {all.length > 0 && (
                            <button type={'button'} className={'pnd:normal-case pnd:tracking-normal pnd:text-primary pnd:hover:underline'} onClick={() => setPicked(picked.length === all.length ? [] : all.map((server) => server.id))}>
                                {picked.length === all.length ? 'none' : 'all'}
                            </button>
                        )}
                    </legend>
                    {servers.isLoading && <Spinner centered />}
                    {servers.isError && <Alert type={'danger'}>{httpErrorToHuman(servers.error)}</Alert>}
                    <div className={'pnd:flex pnd:max-h-72 pnd:flex-col pnd:gap-1 pnd:overflow-y-auto'}>
                        {all.map((server) => (
                            <label key={server.id} className={'pnd:flex pnd:items-center pnd:gap-2 pnd:text-sm'}>
                                <Checkbox checked={picked.includes(server.id)} disabled={server.status === 'transferring'} onChange={(on: boolean) => setPicked((list) => (on ? [...list, server.id] : list.filter((id) => id !== server.id)))} />
                                <span className={'pnd:min-w-0 pnd:flex-1 pnd:truncate'}>
                                    {server.name} <span className={'pnd:text-xs pnd:text-muted-foreground'}>{server.owner}</span>
                                </span>
                                <span className={'pnd:shrink-0 pnd:text-xs pnd:text-muted-foreground'}>
                                    {megabytes(server.memory)} · {megabytes(server.disk)}
                                </span>
                            </label>
                        ))}
                    </div>
                </fieldset>
                {targetNode && ports > targetNode.free_allocations && <Alert type={'warning'}>These servers need {ports} ports and {targetNode.name} has {targetNode.free_allocations} free. Servers that do not fit will fail to move; add ports to the node first.</Alert>}
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button disabled={!target || picked.length === 0} isLoading={busy} onClick={() => void queue()}>
                    Move {picked.length || ''} {picked.length === 1 ? 'server' : 'servers'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
