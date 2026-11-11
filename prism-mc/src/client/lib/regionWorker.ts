/// <reference lib="webworker" />
import { readRegion } from './anvil';

/**
 * Reads region files off the page: the map sends a file's bytes and gets back its surface, with
 * progress along the way. See regionPool.ts.
 */

export interface RegionRequest {
    id: number;
    buffer: ArrayBuffer;
    dimension: string;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<RegionRequest>) => {
    const { id, buffer, dimension } = event.data;
    let reported = 0;

    try {
        const surface = await readRegion(
            buffer,
            dimension,
            (fraction) => {
                // A few progress messages are enough for the counter on the map.
                if (fraction - reported < 0.1) return;
                reported = fraction;
                scope.postMessage({ id, type: 'progress', fraction });
            },
            false
        );
        scope.postMessage({ id, type: 'done', surface }, [surface.blocks.buffer, surface.heights.buffer, surface.waterDepth.buffer]);
    } catch (error) {
        scope.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
};
