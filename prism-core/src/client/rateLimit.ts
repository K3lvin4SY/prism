import type { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

/**
 * The Panel allows each user a set number of API requests a minute (256 by default), extension
 * routes included, and answers the rest with 429 Too Many Requests. Screens that load a lot at
 * once (the world map, big uploads) reach that easily.
 *
 * This makes the Panel's shared HTTP client wait instead of failing: a 429 pauses every request
 * for as long as the Panel says (Retry-After) and then sends the refused one again. A 429 comes
 * from the throttle before anything ran, so sending it again is safe for any method. When the
 * Panel says only a few requests are left, requests are spaced out so the limit is mostly not
 * reached at all.
 */

/** How often one request is sent again before its 429 is passed on. */
export const MAX_RETRIES = 5;
/** Below this many requests left in the minute, requests are spaced out. */
const LOW = 5;
/** The longest a single wait may be. */
const LONGEST = 65_000;
const INSTALLED = Symbol.for('prism-core.rate-limit');

type Config = InternalAxiosRequestConfig & { prismRetries?: number };

interface State {
    /** No request starts before this time. */
    pausedUntil: number;
    /** Time between request starts while few are left, 0 otherwise. */
    spacing: number;
    nextStart: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function header(response: AxiosResponse | undefined, name: string): number | null {
    const value = response?.headers?.[name] as unknown;
    const number = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;

    return Number.isFinite(number) ? number : null;
}

/** How long to wait after a 429, in milliseconds. */
export function retryDelay(response: AxiosResponse | undefined, attempt: number, now = Date.now()): number {
    const after = header(response, 'retry-after');
    if (after !== null) return Math.min(LONGEST, Math.max(500, after * 1000));

    const reset = header(response, 'x-ratelimit-reset');
    if (reset !== null) return Math.min(LONGEST, Math.max(500, reset * 1000 - now));

    return Math.min(LONGEST, 2000 * 2 ** attempt);
}

/** Adds the waiting to an axios instance; the Panel's `http` from Prism Core's setup. */
export function installRateLimit(instance: AxiosInstance): void {
    const marked = instance as AxiosInstance & { [INSTALLED]?: boolean };
    if (marked[INSTALLED]) return;
    marked[INSTALLED] = true;

    const state: State = { pausedUntil: 0, spacing: 0, nextStart: 0 };

    instance.interceptors.request.use(async (config) => {
        // Each request takes its start time before waiting, so spaced requests go one by one.
        const now = Date.now();
        const start = Math.max(now, state.pausedUntil, state.spacing ? state.nextStart : 0);
        state.nextStart = start + state.spacing;
        if (start > now) await sleep(start - now);

        return config;
    });

    instance.interceptors.response.use(
        (response) => {
            const remaining = header(response, 'x-ratelimit-remaining');
            const limit = header(response, 'x-ratelimit-limit');
            if (remaining !== null) state.spacing = remaining <= LOW && limit ? Math.ceil(60_000 / limit) : 0;

            return response;
        },
        async (error: unknown) => {
            // Only types come from axios: the Panel's own copy does the work.
            const refused = error as Partial<AxiosError> | null;
            if (!refused?.isAxiosError || refused.response?.status !== 429 || !refused.config) throw error;

            const config = refused.config as Config;
            const attempt = config.prismRetries ?? 0;
            if (attempt >= MAX_RETRIES || config.signal?.aborted) throw error;

            const wait = retryDelay(refused.response, attempt);
            state.pausedUntil = Math.max(state.pausedUntil, Date.now() + wait);
            await sleep(wait);
            if (config.signal?.aborted) throw error;

            config.prismRetries = attempt + 1;

            return instance.request(config);
        }
    );
}
