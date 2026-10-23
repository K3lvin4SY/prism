/**
 * Docker image pull output, as Wings forwards it while a server's image is pulled
 * ("Pulling from …", "abc123: Downloading [===>  ] 12.3MB/45.6MB"), folded into one progress
 * reading with a speed and time left.
 */
export interface PullProgress {
    image: string | null;
    layers: number;
    done: number;
    /** Bytes downloaded and expected over the layers that report a size. */
    current: number;
    total: number;
    /** Bytes per second, averaged over the last readings. */
    speed: number;
    finished: boolean;
}

const UNITS: Record<string, number> = { B: 1, kB: 1e3, KB: 1e3, MB: 1e6, GB: 1e9, KiB: 1024, MiB: 1048576, GiB: 1073741824 };

function bytes(value: string, unit: string): number {
    return Number(value) * (UNITS[unit] ?? 1);
}

export class PullTracker {
    private image: string | null = null;
    private layers = new Map<string, { current: number; total: number; done: boolean }>();
    private samples: { time: number; bytes: number }[] = [];
    private finished = false;
    active = false;

    /** Reads one line; returns true when it was pull output. */
    feed(line: string, now = Date.now()): boolean {
        // eslint-disable-next-line no-control-regex
        const text = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();

        const pulling = text.match(/Pulling (?:from|image) ([^\s]+)/i);
        if (pulling) {
            if (!this.active || this.finished) this.reset();
            this.image = pulling[1];
            this.active = true;

            return true;
        }

        const layer = text.match(/^([0-9a-f]{12}): (Pulling fs layer|Waiting|Downloading|Verifying Checksum|Download complete|Extracting|Pull complete|Already exists)(?:\s+\[[^\]]*\]\s+([\d.]+)\s*([kKMG]?i?B)\/([\d.]+)\s*([kKMG]?i?B))?/);
        if (layer) {
            this.active = true;
            const [, id, state, current, currentUnit, total, totalUnit] = layer;
            const entry = this.layers.get(id) ?? { current: 0, total: 0, done: false };
            if (state === 'Downloading' && current) {
                entry.current = bytes(current, currentUnit);
                entry.total = bytes(total, totalUnit);
            }
            if (state === 'Download complete' || state === 'Pull complete' || state === 'Already exists') {
                entry.done = true;
                if (entry.total > 0) entry.current = entry.total;
            }
            this.layers.set(id, entry);
            this.samples.push({ time: now, bytes: this.downloaded() });
            this.samples = this.samples.filter((sample) => now - sample.time < 5000);

            return true;
        }

        if (this.active && /^(Digest: sha256|Status: (Downloaded newer image|Image is up to date))/.test(text)) {
            this.finished = true;

            return true;
        }

        return false;
    }

    private downloaded(): number {
        let sum = 0;
        for (const layer of this.layers.values()) sum += layer.current;

        return sum;
    }

    private reset(): void {
        this.layers.clear();
        this.samples = [];
        this.finished = false;
        this.image = null;
    }

    snapshot(): PullProgress {
        let total = 0;
        let done = 0;
        for (const layer of this.layers.values()) {
            total += layer.total;
            if (layer.done) done++;
        }

        const first = this.samples[0];
        const last = this.samples[this.samples.length - 1];
        const seconds = first && last ? (last.time - first.time) / 1000 : 0;

        return {
            image: this.image,
            layers: this.layers.size,
            done,
            current: this.downloaded(),
            total,
            speed: seconds > 0 ? (last.bytes - first.bytes) / seconds : 0,
            finished: this.finished,
        };
    }
}
