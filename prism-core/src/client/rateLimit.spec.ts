import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_RETRIES, installRateLimit, retryDelay } from './rateLimit';

type Answer = { status: number; headers?: Record<string, string> };

/** An axios instance whose requests get the given answers in order, the last one repeating. */
function client(answers: Answer[]) {
    const calls: { url?: string; at: number }[] = [];
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        calls.push({ url: config.url, at: Date.now() });
        const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
        const response = { data: {}, status: answer.status, statusText: '', headers: answer.headers ?? {}, config };
        if (answer.status >= 400) throw new AxiosError('failed', String(answer.status), config, null, response);

        return response;
    };
    const instance = axios.create({ adapter });
    installRateLimit(instance);

    return { instance, calls };
}

describe('installRateLimit', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('waits as long as Retry-After says, then sends the request again', async () => {
        const { instance, calls } = client([{ status: 429, headers: { 'retry-after': '3' } }, { status: 200 }]);
        const request = instance.post('/files');

        await vi.advanceTimersByTimeAsync(2900);
        expect(calls).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(200);

        await expect(request).resolves.toMatchObject({ status: 200 });
        expect(calls).toHaveLength(2);
    });

    it('holds requests sent during the pause until it ends', async () => {
        const { instance, calls } = client([{ status: 429, headers: { 'retry-after': '2' } }, { status: 200 }]);
        const first = instance.get('/a');
        await vi.advanceTimersByTimeAsync(10);
        const second = instance.get('/b');

        await vi.advanceTimersByTimeAsync(1500);
        expect(calls.map((call) => call.url)).toEqual(['/a']);

        await vi.advanceTimersByTimeAsync(600);
        await Promise.all([first, second]);
        expect(calls.map((call) => call.url).sort()).toEqual(['/a', '/a', '/b']);
    });

    it('passes the 429 on after the last retry', async () => {
        const { instance, calls } = client([{ status: 429, headers: { 'retry-after': '1' } }]);
        const request = instance.get('/map').catch((error: AxiosError) => error.response?.status);

        await vi.advanceTimersByTimeAsync(10_000);

        await expect(request).resolves.toBe(429);
        expect(calls).toHaveLength(MAX_RETRIES + 1);
    });

    it('leaves other errors alone', async () => {
        const { instance, calls } = client([{ status: 500 }]);

        await expect(instance.get('/x')).rejects.toMatchObject({ response: { status: 500 } });
        expect(calls).toHaveLength(1);
    });

    it('spaces requests out when few are left', async () => {
        const { instance, calls } = client([{ status: 200, headers: { 'x-ratelimit-limit': '60', 'x-ratelimit-remaining': '2' } }]);
        await instance.get('/1');
        const rest = Promise.all([instance.get('/2'), instance.get('/3')]);

        await vi.advanceTimersByTimeAsync(3000);
        await rest;
        expect(calls[2].at - calls[1].at).toBeGreaterThanOrEqual(1000);
    });
});

describe('retryDelay', () => {
    const response = (headers: Record<string, string>) => ({ headers }) as never;

    it('uses Retry-After, then the reset time, then backs off', () => {
        expect(retryDelay(response({ 'retry-after': '4' }), 0)).toBe(4000);
        expect(retryDelay(response({ 'x-ratelimit-reset': '110' }), 0, 100_000)).toBe(10_000);
        expect(retryDelay(response({}), 0)).toBe(2000);
        expect(retryDelay(response({}), 2)).toBe(8000);
        expect(retryDelay(response({ 'retry-after': '600' }), 0)).toBe(65_000);
    });
});
