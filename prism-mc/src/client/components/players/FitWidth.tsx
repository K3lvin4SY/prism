import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@pterodactyl/sdk';

/**
 * Shows its child at its natural size, or smaller when the space is narrower, so the
 * inventory and HUD keep their in-game look on a phone instead of scrolling sideways.
 */
export default function FitWidth({ children, className }: { children: ReactNode; className?: string }) {
    const outer = useRef<HTMLDivElement>(null);
    const inner = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    useLayoutEffect(() => {
        const box = outer.current;
        const content = inner.current;
        if (!box || !content) return;

        const measure = () => {
            // The drawn width includes the zoom the element has right now, so that is divided out.
            const applied = Number.parseFloat(getComputedStyle(content).zoom) || 1;
            const natural = content.getBoundingClientRect().width / applied;
            const available = box.clientWidth;
            if (!natural || !available) return;
            const next = Math.min(1, Math.floor((available / natural) * 100) / 100);
            setScale(next);
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(box);
        observer.observe(content);

        return () => observer.disconnect();
    }, []);

    return (
        <div ref={outer} className={cn('mcs:flex mcs:w-full mcs:min-w-0 mcs:justify-center', className)}>
            <div ref={inner} style={{ zoom: scale }} className={'mcs:inline-flex mcs:shrink-0'}>
                {children}
            </div>
        </div>
    );
}
