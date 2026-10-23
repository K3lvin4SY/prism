import { useEffect, useState, type CSSProperties } from 'react';
import { parseLine, type Segment } from '../lib/motd';

const OBFUSCATION_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#$%&@';

function scramble(text: string): string {
    return [...text].map((char) => (char === ' ' ? char : OBFUSCATION_CHARS[Math.floor(Math.random() * OBFUSCATION_CHARS.length)])).join('');
}

function useTick(active: boolean): number {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!active) return;
        const timer = window.setInterval(() => setTick((value) => value + 1), 80);

        return () => window.clearInterval(timer);
    }, [active]);

    return tick;
}

function segmentStyle(segment: Segment, fallback: string): CSSProperties {
    const decorations = [segment.underline && 'underline', segment.strike && 'line-through'].filter(Boolean).join(' ');

    return {
        color: segment.color ?? fallback,
        fontWeight: segment.bold ? 700 : 400,
        fontStyle: segment.italic ? 'italic' : 'normal',
        textDecoration: decorations || undefined,
        whiteSpace: 'pre',
    };
}

/** One line of § formatted text, drawn the way the client draws it. */
export default function McText({ text, fallback = '#AAAAAA', className }: { text: string; fallback?: string; className?: string }) {
    const segments = parseLine(text);
    const obfuscated = segments.some((segment) => segment.obfuscated);
    useTick(obfuscated);

    return (
        <span className={className}>
            {segments.map((segment, index) => (
                <span key={index} style={segmentStyle(segment, fallback)}>
                    {segment.obfuscated ? scramble(segment.text) : segment.text}
                </span>
            ))}
        </span>
    );
}
