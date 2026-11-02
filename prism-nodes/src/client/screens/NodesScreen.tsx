import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, PageContentBlock, Spinner, fromNow, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { cancelMove, clearMoves, getMoves, getNodes, movesKey, nodesKey, type Move, type NodeHealth } from '../api';
import MoveDialog from '../components/MoveDialog';
import NodeCard from '../components/NodeCard';

const MOVE_STATES: Record<Move['status'], { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' }> = {
    queued: { label: 'Waiting', tone: 'neutral' },
    moving: { label: 'Moving', tone: 'info' },
    done: { label: 'Moved', tone: 'success' },
    failed: { label: 'Failed', tone: 'danger' },
    cancelled: { label: 'Called off', tone: 'neutral' },
};

/** The admin area's "Node health": every node at a glance, maintenance mode and moving servers. */
export default function NodesScreen() {
    const client = useQueryClient();
    const nodes = useQuery({ queryKey: nodesKey, queryFn: getNodes, refetchInterval: 60_000 });
    const moves = useQuery({ queryKey: movesKey, queryFn: getMoves, refetchInterval: (query) => (query.state.data?.some((move) => move.status === 'queued' || move.status === 'moving') ? 15_000 : false) });
    const [moving, setMoving] = useState<NodeHealth | null>(null);
    const list = nodes.data?.data ?? [];
    const refresh = () => Promise.all([client.invalidateQueries({ queryKey: nodesKey }), client.invalidateQueries({ queryKey: movesKey })]);

    const act = async (action: () => Promise<unknown>) => {
        try {
            await action();
            await refresh();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        }
    };

    return (
        <PageContentBlock title={'Node health'}>
            <div className={'pnd:mx-auto pnd:flex pnd:w-full pnd:max-w-6xl pnd:flex-col pnd:gap-4'}>
                {nodes.isLoading && <Spinner centered />}
                {nodes.isError && <Alert type={'danger'}>{httpErrorToHuman(nodes.error)}</Alert>}
                {nodes.data && list.length === 0 && <Alert type={'info'}>No nodes yet. Add one under Nodes.</Alert>}
                <div className={'pnd:grid pnd:gap-4 ' + (list.length > 1 ? 'pnd:2xl:grid-cols-2' : '')}>
                    {list.map((node) => (
                        <NodeCard key={node.id} node={node} canMove={list.length > 1} onMove={() => setMoving(node)} onChanged={() => void refresh()} />
                    ))}
                </div>

                {moves.data && moves.data.length > 0 && (
                    <section className={'pt-surface pnd:overflow-hidden pnd:rounded-xl pnd:border pnd:border-border pnd:bg-card'}>
                        <header className={'pnd:flex pnd:items-center pnd:gap-3 pnd:border-b pnd:border-border pnd:px-5 pnd:py-3'}>
                            <h2 className={'pnd:flex-1 pnd:font-header pnd:text-lg pnd:font-semibold'}>Moves</h2>
                            {moves.data.some((move) => ['done', 'failed', 'cancelled'].includes(move.status)) && (
                                <Button.Text size={'small'} onClick={() => void act(clearMoves)}>
                                    Clear finished
                                </Button.Text>
                            )}
                        </header>
                        {moves.data.map((move) => (
                            <div key={move.id} className={'pnd:flex pnd:flex-wrap pnd:items-center pnd:gap-3 pnd:border-b pnd:border-border pnd:px-5 pnd:py-2.5 pnd:text-sm pnd:last:border-b-0'}>
                                <Badge size={'sm'} variant={'soft'} tone={MOVE_STATES[move.status].tone}>
                                    {MOVE_STATES[move.status].label}
                                </Badge>
                                <span className={'pnd:min-w-0 pnd:flex-1'}>
                                    <span className={'pnd:font-semibold'}>{move.server ?? 'A deleted server'}</span> from {move.from ?? '?'} to {move.to ?? '?'}
                                    {move.error && <span className={'pnd:block pnd:text-xs pnd:text-destructive'}>{move.error}</span>}
                                </span>
                                <span className={'pnd:text-xs pnd:text-muted-foreground'}>
                                    {move.by && `${move.by}, `}
                                    {fromNow(move.finished_at ?? move.started_at ?? move.created_at)}
                                </span>
                                {move.status === 'queued' && (
                                    <Button.Text size={'small'} onClick={() => void act(() => cancelMove(move.id))}>
                                        Call off
                                    </Button.Text>
                                )}
                            </div>
                        ))}
                    </section>
                )}
            </div>

            {moving && (
                <MoveDialog
                    node={moving}
                    nodes={list}
                    onClose={() => setMoving(null)}
                    onQueued={(queued) => {
                        setMoving(null);
                        toast.success(queued === 0 ? 'Those servers are already waiting to move.' : `${queued} ${queued === 1 ? 'server waits' : 'servers wait'} to move. The first starts within a minute.`);
                        void refresh();
                    }}
                />
            )}
        </PageContentBlock>
    );
}
