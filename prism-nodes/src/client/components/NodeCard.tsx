import { useState } from 'react';
import { Badge, Button, ProgressBar, Switch, fromNow, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { setMaintenance, type NodeHealth } from '../api';
import { NamedIcon } from '../icons';
import { allocatedPercent, bytes, fullness, megabytes, sparkline } from '../lib/format';

const eyebrow = 'pnd:font-mono pnd:text-xs pnd:font-medium pnd:uppercase pnd:tracking-[0.18em] pnd:text-muted-foreground';

/** One node: Wings and the host, what it gave its servers, what they use now and over the last day. */
export default function NodeCard({ node, canMove, onMove, onChanged }: { node: NodeHealth; canMove: boolean; onMove: () => void; onChanged: () => void }) {
    const [busy, setBusy] = useState(false);
    const system = node.system;
    const memory = allocatedPercent(node.allocated.memory);
    const disk = allocatedPercent(node.allocated.disk);
    const threads = system.cpu_threads ?? 0;
    const cpuCeiling = threads > 0 ? threads * 100 : undefined;

    const toggle = async (on: boolean) => {
        setBusy(true);
        try {
            await setMaintenance(node.id, on);
            toast.success(on ? `${node.name} is in maintenance mode: people cannot use its servers until you turn it off.` : `${node.name} is out of maintenance mode.`);
            onChanged();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className={'pt-surface pnd:flex pnd:flex-col pnd:overflow-hidden pnd:rounded-xl pnd:border pnd:border-border pnd:bg-card'}>
            <header className={'pnd:flex pnd:flex-wrap pnd:items-center pnd:gap-3 pnd:border-b pnd:border-border pnd:px-5 pnd:py-4'}>
                <span className={'pnd:size-2.5 pnd:shrink-0 pnd:rounded-full ' + (system.online ? 'pnd:bg-success' : 'pnd:bg-destructive')} title={system.online ? 'Wings answers' : 'Wings does not answer'} />
                <div className={'pnd:min-w-0 pnd:flex-1'}>
                    <h2 className={'pnd:truncate pnd:font-header pnd:text-lg pnd:font-semibold'}>
                        <a href={`/panel/nodes/${node.id}`} className={'pnd:hover:underline'}>
                            {node.name}
                        </a>
                    </h2>
                    <p className={'pnd:truncate pnd:font-mono pnd:text-xs pnd:text-muted-foreground'}>
                        {node.fqdn}
                        {node.location && ` · ${node.location}`}
                    </p>
                </div>
                {system.version && (
                    <Badge size={'sm'} variant={'soft'} tone={node.update ? 'warning' : 'neutral'} title={node.update ? `Wings ${node.update} is out.` : 'The newest Wings.'}>
                        Wings {system.version}
                        {node.update && ` → ${node.update}`}
                    </Badge>
                )}
                <label className={'pnd:flex pnd:items-center pnd:gap-2 pnd:text-sm'}>
                    <Switch checked={node.maintenance} disabled={busy} onChange={(on: boolean) => void toggle(on)} aria-label={'Maintenance mode'} />
                    Maintenance
                </label>
            </header>

            {!system.online && (
                <p className={'pnd:border-b pnd:border-border pnd:bg-destructive/10 pnd:px-5 pnd:py-2.5 pnd:text-sm pnd:text-destructive'}>
                    Wings does not answer{system.error ? `: ${system.error}` : '.'}
                </p>
            )}

            <div className={'pnd:grid pnd:gap-5 pnd:p-5 pnd:md:grid-cols-2'}>
                <dl className={'pnd:grid pnd:grid-cols-[auto_1fr] pnd:gap-x-4 pnd:gap-y-1 pnd:self-start pnd:text-sm'}>
                    <Fact label={'System'} value={[system.os, system.architecture].filter(Boolean).join(', ')} />
                    <Fact label={'Kernel'} value={system.kernel} />
                    <Fact label={'CPU threads'} value={system.cpu_threads?.toString()} />
                    <Fact label={'Memory'} value={system.memory_bytes ? bytes(system.memory_bytes) : null} />
                    <Fact label={'Docker'} value={system.docker} />
                    <Fact label={'Containers'} value={system.containers ? `${system.containers.running} running of ${system.containers.total}` : null} />
                    <Fact label={'Servers'} value={`${node.servers}${node.usage ? `, ${node.usage.running} running` : ''}`} />
                    <Fact label={'Free ports'} value={node.free_allocations.toString()} />
                </dl>

                <div className={'pnd:flex pnd:flex-col pnd:gap-4'}>
                    <Meter label={'Memory given to servers'} percent={memory} text={`${megabytes(node.allocated.memory.used)} of ${node.allocated.memory.overallocate < 0 ? 'unlimited' : megabytes(node.allocated.memory.limit)}`} />
                    <Meter label={'Disk given to servers'} percent={disk} text={`${megabytes(node.allocated.disk.used)} of ${node.allocated.disk.overallocate < 0 ? 'unlimited' : megabytes(node.allocated.disk.limit)}`} />
                    {node.usage ? (
                        <div className={'pnd:grid pnd:grid-cols-2 pnd:gap-3'}>
                            <Graph label={'CPU used by servers'} now={`${Math.round(node.usage.cpu)}%${threads ? ` of ${threads * 100}%` : ''}`} values={node.history.map((point) => point.cpu)} ceiling={cpuCeiling} />
                            <Graph label={'Memory used by servers'} now={bytes(node.usage.memory_bytes)} values={node.history.map((point) => point.memory)} ceiling={system.memory_bytes ?? undefined} />
                            <p className={'pnd:col-span-2 pnd:text-xs pnd:text-muted-foreground'}>
                                Disk used by servers: {bytes(node.usage.disk_bytes)}. Added up {fromNow(node.usage.taken_at)}; graphs show the last 24 hours. Wings reports what servers use, not the whole host.
                            </p>
                        </div>
                    ) : (
                        <p className={'pnd:text-xs pnd:text-muted-foreground'}>What the servers use is added up every five minutes; the first numbers show soon.</p>
                    )}
                </div>
            </div>

            <footer className={'pnd:mt-auto pnd:flex pnd:flex-wrap pnd:items-center pnd:justify-end pnd:gap-2 pnd:border-t pnd:border-border pnd:px-5 pnd:py-3'}>
                <Button.Text size={'small'} disabled={!canMove || node.servers === 0} title={canMove ? undefined : 'Add a second node to move servers to.'} onClick={onMove}>
                    <NamedIcon name={'arrow-right'} size={14} className={'pnd:mr-1'} /> Move servers…
                </Button.Text>
            </footer>
        </section>
    );
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
    return (
        <>
            <dt className={'pnd:text-muted-foreground'}>{label}</dt>
            <dd className={'pnd:min-w-0 pnd:truncate'} title={value ?? undefined}>
                {value || '–'}
            </dd>
        </>
    );
}

function Meter({ label, percent, text }: { label: string; percent: number | null; text: string }) {
    return (
        <div className={'pnd:flex pnd:flex-col pnd:gap-1.5'}>
            <div className={'pnd:flex pnd:justify-between pnd:gap-2'}>
                <span className={eyebrow}>{label}</span>
                <span className={'pnd:text-xs pnd:text-muted-foreground'}>
                    {text}
                    {percent !== null && ` · ${Math.round(percent)}%`}
                </span>
            </div>
            <ProgressBar value={percent === null ? null : Math.min(100, percent)} tone={fullness(percent)} label={label} />
        </div>
    );
}

function Graph({ label, now, values, ceiling }: { label: string; now: string; values: number[]; ceiling?: number }) {
    return (
        <div className={'pt-solid pnd:flex pnd:flex-col pnd:gap-1 pnd:rounded-lg pnd:border pnd:border-border pnd:p-2.5'}>
            <span className={'pnd:text-xs pnd:text-muted-foreground'}>{label}</span>
            <span className={'pnd:text-sm pnd:font-semibold'}>{now}</span>
            <svg viewBox={'0 0 100 24'} preserveAspectRatio={'none'} className={'pnd:h-8 pnd:w-full pnd:text-primary'} aria-hidden>
                <polyline points={sparkline(values, 100, 24, ceiling)} fill={'none'} stroke={'currentColor'} strokeWidth={1.5} vectorEffect={'non-scaling-stroke'} />
            </svg>
        </div>
    );
}
