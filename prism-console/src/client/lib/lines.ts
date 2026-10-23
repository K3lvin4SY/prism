import { parseAnsi, plainText, type Segment } from './ansi';

export type Level = 'error' | 'warning' | 'info' | 'player' | 'debug' | 'system';

export const LEVELS: { level: Level; label: string }[] = [
    { level: 'error', label: 'Errors' },
    { level: 'warning', label: 'Warnings' },
    { level: 'info', label: 'Info' },
    { level: 'player', label: 'Players' },
    { level: 'debug', label: 'Debug' },
    { level: 'system', label: 'System' },
];

export interface ConsoleLine {
    id: number;
    /** When the panel received it, in milliseconds. */
    time: number;
    segments: Segment[];
    text: string;
    level: Level;
}

const ERROR = /\b(ERROR|SEVERE|FATAL|CRITICAL)\b|\bException\b|^\s+at [\w$.<>]+\(|Caused by:|\bError:/;
const WARNING = /\bWARN(ING)?\b/;
const DEBUG = /\b(DEBUG|TRACE)\b/;
const PLAYER = /(joined the game|left the game|has joined|has left|logged in with entity id|lost connection:|\]: <[^>]+> |\bjoined\b.*\bserver\b|disconnected)/i;
const SYSTEM = /^(container@pterodactyl~|\[Pterodactyl Daemon\]|\[Prism\])/;

export function classify(text: string, system = false): Level {
    if (system || SYSTEM.test(text)) return 'system';
    if (ERROR.test(text)) return 'error';
    if (WARNING.test(text)) return 'warning';
    if (PLAYER.test(text)) return 'player';
    if (DEBUG.test(text)) return 'debug';

    return 'info';
}

let nextId = 1;

export function makeLine(raw: string, system = false, time = Date.now()): ConsoleLine {
    const segments = parseAnsi(raw);
    const text = plainText(segments);

    return { id: nextId++, time, segments, text, level: classify(text, system) };
}

export interface CustomRule {
    pattern: string;
    regex: boolean;
    caseSensitive: boolean;
    colour: string;
}

export interface HighlightSettings {
    builtin: Record<string, boolean>;
    custom: CustomRule[];
}

/** A coloured stretch of a line's text. */
export interface Range {
    start: number;
    end: number;
    colour?: string;
    /** A search match, drawn as a mark. */
    match?: 'match' | 'current';
}

interface Rule {
    regex: RegExp;
    colour: string;
    /** Colours the whole line rather than the matched text. */
    line?: boolean;
    levels?: Level[];
}

const BUILTIN: Record<string, Omit<Rule, 'regex'> & { regex?: RegExp }> = {
    errors: { colour: '#f87171', line: true, levels: ['error'] },
    warnings: { colour: '#fbbf24', line: true, levels: ['warning'] },
    joins: { regex: /\b\S+ (joined the game|left the game|has joined|has left)|\blost connection:.*$|\blogged in with entity id\b/gi, colour: '#4ade80' },
    chat: { regex: /<[^<>\s]{1,32}>/g, colour: '#93c5fd' },
    ready: { regex: /\b(Done \([\d.,]+s\)!?.*|Server started.*|Listening on port \d+|Server marked as running.*)/g, colour: '#34d399' },
    info: { regex: /\bINFO\b/g, colour: '#7dd3fc' },
    debug: { colour: '#94a3b8', line: true, levels: ['debug'] },
    ips: { regex: /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g, colour: '#c084fc' },
};

function escape(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Turns highlight settings into rules, skipping custom patterns that are not valid. */
export function compileRules(settings: HighlightSettings[]): Rule[] {
    const rules: Rule[] = [];
    const builtin: Record<string, boolean> = {};
    for (const set of settings) Object.assign(builtin, set.builtin ?? {});

    for (const [key, rule] of Object.entries(BUILTIN)) {
        if (builtin[key] === false) continue;
        rules.push({ regex: rule.regex ?? /^.*$/g, colour: rule.colour, line: rule.line, levels: rule.levels });
    }

    for (const set of settings) {
        for (const rule of set.custom ?? []) {
            if (!rule.pattern) continue;
            try {
                rules.push({ regex: new RegExp(rule.regex ? rule.pattern : escape(rule.pattern), rule.caseSensitive ? 'g' : 'gi'), colour: rule.colour });
            } catch {
                // An invalid custom pattern is skipped; Prism Properties shows the rule as entered.
            }
        }
    }

    return rules;
}

export function highlightRanges(line: ConsoleLine, rules: Rule[]): Range[] {
    const ranges: Range[] = [];
    for (const rule of rules) {
        if (rule.levels && !rule.levels.includes(line.level)) continue;
        if (rule.line) {
            ranges.push({ start: 0, end: line.text.length, colour: rule.colour });
            continue;
        }

        rule.regex.lastIndex = 0;
        for (const match of line.text.matchAll(rule.regex)) {
            if (match[0] === '') continue;
            ranges.push({ start: match.index!, end: match.index! + match[0].length, colour: rule.colour });
        }
    }

    return ranges;
}

export interface SearchOptions {
    query: string;
    regex: boolean;
    caseSensitive: boolean;
    wholeWord: boolean;
}

/** The search as a regular expression, or null when it is empty or not valid. */
export function searchRegex(options: SearchOptions): RegExp | null {
    if (options.query === '') return null;
    let source = options.regex ? options.query : escape(options.query);
    if (options.wholeWord) source = `\\b(?:${source})\\b`;
    try {
        return new RegExp(source, options.caseSensitive ? 'g' : 'gi');
    } catch {
        return null;
    }
}

export function searchRanges(text: string, regex: RegExp | null): Range[] {
    if (!regex) return [];
    regex.lastIndex = 0;
    const ranges: Range[] = [];
    for (const match of text.matchAll(regex)) {
        if (match[0] === '') break;
        ranges.push({ start: match.index!, end: match.index! + match[0].length, match: 'match' });
    }

    return ranges;
}

export interface Piece extends Segment {
    match?: 'match' | 'current';
}

/**
 * Applies highlight colours and search marks to a line's segments. Later rules win where
 * they overlap, and search marks sit on top.
 */
export function paint(segments: Segment[], ranges: Range[]): Piece[] {
    if (ranges.length === 0) return segments;

    const cuts = new Set<number>();
    for (const range of ranges) {
        cuts.add(range.start);
        cuts.add(range.end);
    }

    const pieces: Piece[] = [];
    let offset = 0;
    for (const segment of segments) {
        const end = offset + segment.text.length;
        const points = [offset, ...[...cuts].filter((cut) => cut > offset && cut < end).sort((a, b) => a - b), end];
        for (let i = 0; i < points.length - 1; i++) {
            const from = points[i];
            const to = points[i + 1];
            const piece: Piece = { ...segment, text: segment.text.slice(from - offset, to - offset) };
            for (const range of ranges) {
                if (range.start <= from && range.end >= to) {
                    if (range.colour) piece.fg = range.colour;
                    if (range.match) piece.match = range.match;
                }
            }
            pieces.push(piece);
        }
        offset = end;
    }

    return pieces;
}
