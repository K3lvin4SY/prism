import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { serverLogsQueryOptions, useServerWebsocketEvent, type SdkServer } from '@pterodactyl/sdk';
import { getConfig } from './config';
import { storeFor, type ServerConsoleStore } from './store';

interface WingsStats {
    memory_bytes?: number;
    cpu_absolute?: number;
    disk_bytes?: number;
    network?: { rx_bytes?: number; tx_bytes?: number };
    state?: string;
    uptime?: number;
}

/**
 * Listens to the server's websocket and fills its console store. The panel's own socket is
 * shared; PrismConsole only listens, and sends commands and power signals over the API.
 */
export function useConsoleFeed(server: SdkServer): ServerConsoleStore {
    const store = storeFor(server.attributes.uuid, getConfig().maxLines);
    const queryClient = useQueryClient();

    useServerWebsocketEvent('console output', (data) => store.push(data));
    useServerWebsocketEvent('install output', (data) => store.push(data, true));
    useServerWebsocketEvent('daemon message', (data) => store.push(`[Pterodactyl Daemon]: ${data}`, true));
    useServerWebsocketEvent('daemon error', (data) => store.push(`[Pterodactyl Daemon]: ${data}`, true));
    useServerWebsocketEvent('status', (data) => {
        store.setState(data);
        store.push(`container@pterodactyl~ Server marked as ${data}...`, true);
    });
    useServerWebsocketEvent('stats', (data) => {
        try {
            const stats = JSON.parse(data) as WingsStats;
            store.sample(
                {
                    time: Date.now(),
                    cpu: stats.cpu_absolute ?? 0,
                    memory: stats.memory_bytes ?? 0,
                    disk: stats.disk_bytes ?? 0,
                    rx: stats.network?.rx_bytes ?? 0,
                    tx: stats.network?.tx_bytes ?? 0,
                },
                stats.state ?? store.state,
                stats.uptime ?? 0
            );
        } catch {
            // A malformed stats frame is skipped; the next one follows within seconds.
        }
    });

    // The last lines written before the page opened.
    useEffect(() => {
        if (store.backlogLoaded) return;
        store.backlogLoaded = true;
        queryClient
            .fetchQuery(serverLogsQueryOptions(server.attributes.identifier, 100))
            .then((logs) => store.prepend(logs.attributes.lines))
            .catch(() => undefined);
    }, [store, queryClient, server.attributes.identifier]);

    return store;
}
