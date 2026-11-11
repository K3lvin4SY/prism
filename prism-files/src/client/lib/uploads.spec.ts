import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('@pterodactyl/sdk', () => ({ http: { get: (...args: unknown[]) => get(...args) } }));

const { REFRESH_DELAY, URL_LIFETIME, UploadQueue } = await import('./uploads');

/** A stand-in for XMLHttpRequest whose uploads finish when the test says so. */
class FakeRequest {
    static sent: FakeRequest[] = [];
    /** The status the next uploads answer with. */
    static answer = 200;
    status = 0;
    responseText = '';
    url = '';
    upload: { onprogress?: (event: { loaded: number }) => void } = {};
    onload?: () => void;
    onerror?: () => void;
    onabort?: () => void;

    open(_method: string, url: string) {
        this.url = url;
    }

    send() {
        FakeRequest.sent.push(this);
    }

    abort() {
        this.onabort?.();
    }

    finish(status = FakeRequest.answer) {
        this.status = status;
        this.onload?.();
    }
}

const files = (count: number) => Array.from({ length: count }, (_, i) => ({ file: new File(['x'], `f${i}.txt`) }));
const settle = () => vi.advanceTimersByTimeAsync(0);

async function finishAll(status?: number) {
    while (FakeRequest.sent.length) {
        FakeRequest.sent.splice(0).forEach((request) => request.finish(status));
        await settle();
    }
}

describe('UploadQueue', () => {
    let refreshed: string[];
    let token = 0;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('XMLHttpRequest', FakeRequest);
        FakeRequest.sent = [];
        refreshed = [];
        token = 0;
        get.mockReset();
        get.mockImplementation(async () => ({ data: { attributes: { url: `https://node.test/upload/file?token=${++token}` } } }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    const queue = (parallel = 3) => new UploadQueue('abc', () => parallel, (directory) => refreshed.push(directory));

    it('asks the Panel for one signed URL for many files', async () => {
        const uploads = queue();
        uploads.add(files(10), '/');
        await settle();
        await finishAll();

        expect(get).toHaveBeenCalledTimes(1);
        expect(uploads.uploads.every((upload) => upload.status === 'done')).toBe(true);
    });

    it('asks for a new URL once the old one is near its expiry', async () => {
        const uploads = queue();
        uploads.add(files(1), '/');
        await settle();
        await finishAll();

        vi.advanceTimersByTime(URL_LIFETIME + 1);
        uploads.add(files(1), '/');
        await settle();
        await finishAll();

        expect(get).toHaveBeenCalledTimes(2);
    });

    it('gets a new URL and tries again when the node refuses the old one', async () => {
        const uploads = queue(1);
        uploads.add(files(1), '/');
        await settle();
        FakeRequest.sent.shift()!.finish(401);
        await settle();

        expect(get).toHaveBeenCalledTimes(2);
        expect(FakeRequest.sent[0].url).toContain('token=2');
        await finishAll();
        expect(uploads.uploads[0].status).toBe('done');
    });

    it('refreshes each folder once when the uploads are done', async () => {
        const uploads = queue();
        uploads.add(files(4), '/a');
        uploads.add(files(2), '/b');
        await settle();
        await finishAll();

        expect(refreshed.sort()).toEqual(['/a', '/b']);
        vi.advanceTimersByTime(REFRESH_DELAY);
        expect(refreshed).toHaveLength(2);
    });

    it('retries every failed upload at once, still a few at a time', async () => {
        const uploads = queue(2);
        uploads.add(files(5), '/');
        await settle();
        await finishAll(500);
        expect(uploads.uploads.filter((upload) => upload.status === 'failed')).toHaveLength(5);

        uploads.uploads[0].status = 'cancelled';
        uploads.retryFailed();
        await settle();

        expect(FakeRequest.sent).toHaveLength(2);
        expect(uploads.uploads.filter((upload) => upload.status === 'queued' || upload.status === 'uploading')).toHaveLength(4);
        await finishAll();
        expect(uploads.uploads.map((upload) => upload.status)).toEqual(['cancelled', 'done', 'done', 'done', 'done']);
    });
});
