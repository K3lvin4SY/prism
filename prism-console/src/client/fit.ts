import { useEffect, useState, type RefObject } from 'react';

/** Screens this wide and more fit the console to the window. */
const LARGE = '(min-width: 1024px)';

/** Below this the console keeps its own heights and the page scrolls. */
const MIN_FIT = 480;

function scrollParent(element: HTMLElement): HTMLElement | null {
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const overflow = getComputedStyle(parent).overflowY;
        if (overflow === 'auto' || overflow === 'scroll') return parent;
    }

    return null;
}

/** Whether a container stacks its children one under another. */
function stacks(style: CSSStyleDeclaration): boolean {
    return style.display === 'block' || style.display === 'flow-root' || (style.display.endsWith('flex') && style.flexDirection.startsWith('column'));
}

/** The room taken below the element up to the scroll container: siblings stacked under it, bottom margins and padding. */
function spaceBelow(node: HTMLElement, stop: HTMLElement | null): number {
    let below = 0;
    for (let element: HTMLElement | null = node; element && element !== stop && element !== document.body; element = element.parentElement) {
        below += parseFloat(getComputedStyle(element).marginBottom) || 0;
        const parent = element.parentElement;
        if (!parent) break;
        const style = getComputedStyle(parent);
        if (stacks(style)) {
            for (let sibling = element.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
                const own = getComputedStyle(sibling);
                if (own.position !== 'absolute' && own.position !== 'fixed') below += sibling.getBoundingClientRect().height + (parseFloat(own.marginTop) || 0) + (parseFloat(own.marginBottom) || 0);
            }
            if (style.display.endsWith('flex')) below += (parseFloat(style.rowGap) || 0) * countFollowing(element);
        }
        below += (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    }

    return below;
}

function countFollowing(element: Element): number {
    let count = 0;
    for (let sibling = element.nextElementSibling; sibling; sibling = sibling.nextElementSibling) count++;

    return count;
}

/**
 * The height that makes the element end at the bottom of the window, leaving room for whatever
 * the page puts below it (its padding, a footer). Null on small screens, or when that would be
 * too short to be of use.
 */
export function useFitHeight(element: RefObject<HTMLElement | null>): number | null {
    const [height, setHeight] = useState<number | null>(null);

    useEffect(() => {
        const node = element.current;
        if (!node) return;
        const large = window.matchMedia(LARGE);
        let frame = 0;

        const measure = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                if (!large.matches) return setHeight(null);
                const parent = scrollParent(node);
                const view = parent ? parent.clientHeight : window.innerHeight;
                const top = node.getBoundingClientRect().top - (parent ? parent.getBoundingClientRect().top - parent.scrollTop : -window.scrollY);
                // What sits below the element does not change with its height, so this settles at once.
                const fit = Math.floor(view - top - spaceBelow(node, parent));
                setHeight(fit >= MIN_FIT ? fit : null);
            });
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(document.body);
        observer.observe(node);
        window.addEventListener('resize', measure);
        large.addEventListener('change', measure);

        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener('resize', measure);
            large.removeEventListener('change', measure);
        };
    }, [element]);

    return height;
}
