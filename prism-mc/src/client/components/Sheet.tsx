import { useEffect, useState, type ReactNode } from 'react';
import { Portal, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';

const WIDE = '(min-width: 64rem)';

/** True from Tailwind's lg breakpoint up, where filters and pickers have room beside the content. */
export function useWide(): boolean {
    const [wide, setWide] = useState(() => typeof window === 'undefined' || window.matchMedia(WIDE).matches);

    useEffect(() => {
        const query = window.matchMedia(WIDE);
        const update = () => setWide(query.matches);
        update();
        query.addEventListener('change', update);

        return () => query.removeEventListener('change', update);
    }, []);

    return wide;
}

interface SheetProps {
    open: boolean;
    title: string;
    onClose: () => void;
    children: ReactNode;
    /** Beside the close button, such as "Reset". */
    action?: ReactNode;
    /** Pinned under the content, such as "Show results". */
    footer?: ReactNode;
}

/**
 * A panel that slides up from the bottom on phones and in from the right on tablets, for filters and
 * pickers that would otherwise push the content down. Escape or the backdrop closes it.
 */
export function Sheet({ open, title, onClose, children, action, footer }: SheetProps) {
    useEffect(() => {
        if (!open) return;

        const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', key);

        return () => {
            document.body.style.overflow = overflow;
            window.removeEventListener('keydown', key);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <Portal>
            <div className={'mcs:fixed mcs:inset-0 mcs:z-[55] mcs:flex mcs:items-end mcs:sm:items-stretch mcs:sm:justify-end'} role={'dialog'} aria-modal={'true'} aria-label={title}>
                <div className={'mcs:absolute mcs:inset-0 mcs:bg-black/50'} onClick={onClose} />
                <div
                    className={cn(
                        'pt-surface mcs:relative mcs:flex mcs:w-full mcs:flex-col mcs:border-border mcs:bg-card mcs:shadow-2xl',
                        'mcs:max-h-[85dvh] mcs:rounded-t-2xl mcs:border-t',
                        'mcs:sm:max-h-none mcs:sm:h-full mcs:sm:w-96 mcs:sm:rounded-none mcs:sm:border-t-0 mcs:sm:border-l'
                    )}
                >
                    <div className={'mcs:mx-auto mcs:mt-2 mcs:h-1 mcs:w-10 mcs:rounded-full mcs:bg-muted-foreground/40 mcs:sm:hidden'} />
                    <div className={'mcs:flex mcs:items-center mcs:gap-2 mcs:border-b mcs:border-border mcs:px-4 mcs:py-3'}>
                        <h2 className={'mcs:flex-1 mcs:text-base mcs:font-semibold'}>{title}</h2>
                        {action}
                        <button
                            type={'button'}
                            onClick={onClose}
                            aria-label={'Close'}
                            className={'mcs:flex mcs:size-8 mcs:items-center mcs:justify-center mcs:rounded-full mcs:cursor-pointer mcs:text-muted-foreground mcs:hover:bg-muted mcs:hover:text-foreground'}
                        >
                            <NamedIcon name={'x'} size={18} />
                        </button>
                    </div>
                    <div className={'mcs:min-h-0 mcs:flex-1 mcs:overflow-y-auto mcs:overscroll-contain mcs:p-3'}>{children}</div>
                    {footer && <div className={'mcs:border-t mcs:border-border mcs:p-3 mcs:pb-[max(0.75rem,env(safe-area-inset-bottom))]'}>{footer}</div>}
                </div>
            </div>
        </Portal>
    );
}

/** "Filters" with the number chosen, which opens the filter sheet on narrow screens. */
export function FiltersButton({ count, onClick }: { count: number; onClick: () => void }) {
    return (
        <button
            type={'button'}
            onClick={onClick}
            className={cn(
                'mcs:inline-flex mcs:h-9 mcs:shrink-0 mcs:items-center mcs:gap-2 mcs:rounded-md mcs:border mcs:px-3 mcs:text-sm mcs:font-medium mcs:cursor-pointer mcs:hover:bg-muted',
                count > 0 ? 'mcs:border-primary mcs:text-foreground' : 'mcs:border-border mcs:bg-card'
            )}
        >
            <NamedIcon name={'filter'} size={16} />
            Filters
            {count > 0 && <span className={'mcs:rounded-full mcs:bg-primary mcs:px-1.5 mcs:text-xs mcs:font-semibold mcs:text-primary-foreground'}>{count}</span>}
        </button>
    );
}
