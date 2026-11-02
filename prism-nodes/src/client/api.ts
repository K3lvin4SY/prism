import { http } from '@pterodactyl/sdk';

export interface System {
    online: boolean;
    error: string | null;
    version: string | null;
    os: string | null;
    kernel: string | null;
    architecture: string | null;
    cpu_threads: number | null;
    memory_bytes: number | null;
    docker: string | null;
    containers: { running: number; total: number } | null;
}

export interface Allocated {
    /** Megabytes given to the node's servers. */
    used: number;
    /** The node's limit in megabytes, before overallocation. */
    limit: number;
    /** Percent over the limit allowed; -1 turns the check off. */
    overallocate: number;
}

export interface NodeHealth {
    id: number;
    name: string;
    fqdn: string;
    location: string | null;
    maintenance: boolean;
    servers: number;
    free_allocations: number;
    system: System;
    /** The newer Wings version, when this node runs an older one. */
    update: string | null;
    allocated: { memory: Allocated; disk: Allocated };
    usage: { taken_at: string; cpu: number; memory_bytes: number; disk_bytes: number; running: number } | null;
    /** Oldest first: seconds since 1970, CPU percent of one thread, memory bytes. */
    history: { t: number; cpu: number; memory: number }[];
}

export interface NodeServer {
    id: number;
    name: string;
    short: string;
    owner: string | null;
    memory: number;
    disk: number;
    ports: number;
    status: string | null;
}

export interface Move {
    id: number;
    server: string | null;
    from: string | null;
    to: string | null;
    by: string | null;
    status: 'queued' | 'moving' | 'done' | 'failed' | 'cancelled';
    error: string | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
}

const base = '/api/admin/extensions/prism-nodes';

export const nodesKey = ['prism-nodes', 'nodes'] as const;
export const movesKey = ['prism-nodes', 'moves'] as const;

export const getNodes = async () => (await http.get<{ data: NodeHealth[]; meta: { latest_wings: string | null } }>(`${base}/nodes`)).data;
export const setMaintenance = (id: number, on: boolean) => http.put(`${base}/nodes/${id}/maintenance`, { on });
export const getNodeServers = async (id: number) => (await http.get<{ data: NodeServer[] }>(`${base}/nodes/${id}/servers`)).data.data;
export const getMoves = async () => (await http.get<{ data: Move[] }>(`${base}/moves`)).data.data;
export const queueMoves = async (node: number, servers: number[]) => (await http.post<{ data: { queued: number; skipped: number } }>(`${base}/moves`, { node_id: node, servers })).data.data;
export const cancelMove = (id: number) => http.delete(`${base}/moves/${id}`);
export const clearMoves = () => http.delete(`${base}/moves/finished`);
