import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@pterodactyl/sdk';

/** The most the child is enlarged, so the pixel art does not get blown up past a sensible size. */
const MAX_SCALE = 2;
/** Enlarging goes in steps this size, so small layout shifts do not make it twitch. */
const STEP = 0.05;

/**
 * How much of the page has to stay under an element: what follows it in each of its ancestors
 * (the elements below it, not beside it) and their bottom padding, up to the page itself. Space an
 * ancestor only has because it is stretched (to fill the window, or to match a taller neighbour)
 * is not counted, so it is the room the page needs, not the room it takes.
 */
function spaceBelow(element: HTMLElement): number {
    let below = 0;
    let node: HTMLElement = element;
    while (node.parentElement && node.parentElement !== document.documentElement) {
        const parent = node.parentElement;
        const bottom = node.getBoundingClientRect().bottom;
        let last = bottom + (Number.parseFloat(getComputedStyle(node).marginBottom) || 0);
        for (const sibling of Array.from(parent.children)) {
            if (sibling === node || !(sibling instanceof HTMLElement)) continue;
            const style = getComputedStyle(sibling);
            if (style.display === 'none' || style.position === 'absolute' || style.position === 'fixed') continue;
            const rect = sibling.getBoundingClientRect();
            if (rect.height === 0 || rect.top < bottom - 1) continue;
            last = Math.max(last, rect.bottom + (Number.parseFloat(style.marginBottom) || 0));
        }
        const style = getComputedStyle(parent);
        below += last - bottom + (Number.parseFloat(style.paddingBottom) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0);
        node = parent;
    }

    return below;
}

/**
 * Shows its child at its natural size, smaller when the space is narrower, so the inventory and
 * HUD keep their in-game look on a phone instead of scrolling sideways, and larger when there is
 * room both to the sides and below it, so it fills a big screen without making the page scroll.
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
            // The drawn size includes the zoom the element has right now, so that is divided out.
            const applied = Number.parseFloat(getComputedStyle(content).zoom) || 1;
            const rect = content.getBoundingClientRect();
            const naturalWidth = rect.width / applied;
            const naturalHeight = rect.height / applied;
            const available = box.clientWidth;
            if (!naturalWidth || !naturalHeight || !available) return;

            const fitsWidth = available / naturalWidth;
            if (fitsWidth < 1) return setScale(Math.floor(fitsWidth * 100) / 100);

            // Below the window's bottom edge there has to be room for what follows on the page.
            const top = box.getBoundingClientRect().top + window.scrollY;
            const fitsHeight = (window.innerHeight - top - spaceBelow(box)) / naturalHeight;
            const next = Math.max(1, Math.min(MAX_SCALE, fitsWidth, fitsHeight));
            setScale(Math.floor(next / STEP) * STEP);
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(box);
        observer.observe(content);
        // What is above or below can change size too (cards loading, the list opening).
        observer.observe(document.body);
        window.addEventListener('resize', measure);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, []);

    return (
        <div ref={outer} className={cn('mcs:flex mcs:w-full mcs:min-w-0 mcs:justify-center', className)}>
            <div ref={inner} style={{ zoom: scale }} className={'mcs:inline-flex mcs:shrink-0'}>
                {children}
            </div>
        </div>
    );
}
