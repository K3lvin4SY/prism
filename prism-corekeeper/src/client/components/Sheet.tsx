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
            <div className={'cks:fixed cks:inset-0 cks:z-[55] cks:flex cks:items-end cks:sm:items-stretch cks:sm:justify-end'} role={'dialog'} aria-modal={'true'} aria-label={title}>
                <div className={'cks:absolute cks:inset-0 cks:bg-black/50'} onClick={onClose} />
                <div
                    className={cn(
                        'pt-surface cks:relative cks:flex cks:w-full cks:flex-col cks:border-border cks:bg-card cks:shadow-2xl',
                        'cks:max-h-[85dvh] cks:rounded-t-2xl cks:border-t',
                        'cks:sm:max-h-none cks:sm:h-full cks:sm:w-96 cks:sm:rounded-none cks:sm:border-t-0 cks:sm:border-l'
                    )}
                >
                    <div className={'cks:mx-auto cks:mt-2 cks:h-1 cks:w-10 cks:rounded-full cks:bg-muted-foreground/40 cks:sm:hidden'} />
                    <div className={'cks:flex cks:items-center cks:gap-2 cks:border-b cks:border-border cks:px-4 cks:py-3'}>
                        <h2 className={'cks:flex-1 cks:text-base cks:font-semibold'}>{title}</h2>
                        {action}
                        <button
                            type={'button'}
                            onClick={onClose}
                            aria-label={'Close'}
                            className={'cks:flex cks:size-8 cks:items-center cks:justify-center cks:rounded-full cks:cursor-pointer cks:text-muted-foreground cks:hover:bg-muted cks:hover:text-foreground'}
                        >
                            <NamedIcon name={'x'} size={18} />
                        </button>
                    </div>
                    <div className={'cks:min-h-0 cks:flex-1 cks:overflow-y-auto cks:overscroll-contain cks:p-3'}>{children}</div>
                    {footer && <div className={'cks:border-t cks:border-border cks:p-3 cks:pb-[max(0.75rem,env(safe-area-inset-bottom))]'}>{footer}</div>}
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
                'cks:inline-flex cks:h-9 cks:shrink-0 cks:items-center cks:gap-2 cks:rounded-md cks:border cks:px-3 cks:text-sm cks:font-medium cks:cursor-pointer cks:hover:bg-muted',
                count > 0 ? 'cks:border-primary cks:text-foreground' : 'cks:border-border cks:bg-card'
            )}
        >
            <NamedIcon name={'filter'} size={16} />
            Filters
            {count > 0 && <span className={'cks:rounded-full cks:bg-primary cks:px-1.5 cks:text-xs cks:font-semibold cks:text-primary-foreground'}>{count}</span>}
        </button>
    );
}
