import { describe, expect, it } from 'vitest';
import { parseAnsi, plainText } from './ansi';
import { exportLines } from './export';
import { classify, compileRules, highlightRanges, makeLine, paint, searchRanges, searchRegex } from './lines';
import { PullTracker } from './pull';

describe('parseAnsi', () => {
    it('splits colours and resets', () => {
        const segments = parseAnsi('\x1b[31mred\x1b[0m plain \x1b[1;92mbold green');
        expect(segments).toEqual([
            { text: 'red', fg: 'var(--terminal-ansi-red)' },
            { text: ' plain ' },
            { text: 'bold green', bold: true, fg: 'var(--terminal-ansi-bright-green)' },
        ]);
    });

    it('reads 256 and true colours', () => {
        expect(parseAnsi('\x1b[38;5;196mx')[0].fg).toBe('rgb(255, 0, 0)');
        expect(parseAnsi('\x1b[38;2;1;2;3mx')[0].fg).toBe('rgb(1, 2, 3)');
    });

    it('drops window titles, cursor moves and overwritten text', () => {
        expect(plainText(parseAnsi('\x1b]0;Terraria Server: world\x07Server started\x1b[K'))).toBe('Server started');
        expect(plainText(parseAnsi('loading 10%\rloading 100%'))).toBe('loading 100%');
    });
});

describe('classify', () => {
    it('sorts lines into levels', () => {
        expect(classify('[12:00:00 ERROR]: Could not load plugin')).toBe('error');
        expect(classify('\tat net.minecraft.server.Main.main(Main.java:10)')).toBe('error');
        expect(classify('[12:00:00 WARN]: Can\'t keep up!')).toBe('warning');
        expect(classify('[12:00:00 INFO]: Steve joined the game')).toBe('player');
        expect(classify('[12:00:00 INFO]: <Steve> hello')).toBe('player');
        expect(classify('[12:00:00 INFO]: Done (3.2s)! For help, type "help"')).toBe('info');
        expect(classify('container@pterodactyl~ Server marked as running...')).toBe('system');
        expect(classify('anything', true)).toBe('system');
    });
});

describe('highlights and search', () => {
    it('colours matches and keeps the rest', () => {
        const line = makeLine('[INFO]: Steve joined the game from 10.0.0.5:51234');
        const rules = compileRules([{ builtin: { info: false }, custom: [{ pattern: 'game', regex: false, caseSensitive: true, colour: '#ff00ff' }] }]);
        const pieces = paint(line.segments, highlightRanges(line, rules));
        expect(pieces.map((piece) => piece.text).join('')).toBe(line.text);
        expect(pieces.find((piece) => piece.text === '10.0.0.5:51234')?.fg).toBe('#c084fc');
        expect(pieces.find((piece) => piece.text === 'game')?.fg).toBe('#ff00ff');
    });

    it('skips invalid custom patterns', () => {
        expect(() => compileRules([{ builtin: {}, custom: [{ pattern: '(', regex: true, caseSensitive: false, colour: '#fff' }] }])).not.toThrow();
    });

    it('searches with regex, case and whole word', () => {
        expect(searchRanges('chunks chunk Chunk', searchRegex({ query: 'chunk', regex: false, caseSensitive: false, wholeWord: true }))).toHaveLength(2);
        expect(searchRanges('chunks chunk Chunk', searchRegex({ query: 'chunk', regex: false, caseSensitive: true, wholeWord: false }))).toHaveLength(2);
        expect(searchRanges('a1 b22', searchRegex({ query: '\\d+', regex: true, caseSensitive: false, wholeWord: false }))).toHaveLength(2);
        expect(searchRegex({ query: '(', regex: true, caseSensitive: false, wholeWord: false })).toBeNull();
    });
});

describe('export', () => {
    it('writes text with timestamps and escaped html', () => {
        const line = makeLine('\x1b[31m<b>oops</b>', false, Date.UTC(2026, 0, 1, 12, 0, 0));
        expect(exportLines([line], 'log', true, 'x')).toBe('[2026-01-01T12:00:00.000Z] <b>oops</b>\n');
        expect(exportLines([line], 'html', false, 'x')).toContain('&lt;b&gt;oops&lt;/b&gt;');
    });
});

describe('PullTracker', () => {
    it('adds up layers and finishes', () => {
        const tracker = new PullTracker();
        expect(tracker.feed('Pulling from ghcr.io/pterodactyl/yolks', 0)).toBe(true);
        tracker.feed('0123456789ab: Downloading [==>    ] 5MB/10MB', 0);
        tracker.feed('ba9876543210: Downloading [=>     ] 1MB/20MB', 1000);
        tracker.feed('0123456789ab: Download complete', 2000);
        let snapshot = tracker.snapshot();
        expect(snapshot.layers).toBe(2);
        expect(snapshot.done).toBe(1);
        expect(snapshot.current).toBe(11e6);
        expect(snapshot.total).toBe(30e6);
        expect(snapshot.speed).toBeGreaterThan(0);
        tracker.feed('Status: Downloaded newer image for ghcr.io/pterodactyl/yolks:java_21', 3000);
        snapshot = tracker.snapshot();
        expect(snapshot.finished).toBe(true);
        expect(tracker.feed('[12:00:00 INFO]: hello', 4000)).toBe(false);
    });
});
