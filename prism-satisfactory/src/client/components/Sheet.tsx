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
            <div className={'sfy:fixed sfy:inset-0 sfy:z-[55] sfy:flex sfy:items-end sfy:sm:items-stretch sfy:sm:justify-end'} role={'dialog'} aria-modal={'true'} aria-label={title}>
                <div className={'sfy:absolute sfy:inset-0 sfy:bg-black/50'} onClick={onClose} />
                <div
                    className={cn(
                        'pt-surface sfy:relative sfy:flex sfy:w-full sfy:flex-col sfy:border-border sfy:bg-card sfy:shadow-2xl',
                        'sfy:max-h-[85dvh] sfy:rounded-t-2xl sfy:border-t',
                        'sfy:sm:max-h-none sfy:sm:h-full sfy:sm:w-96 sfy:sm:rounded-none sfy:sm:border-t-0 sfy:sm:border-l'
                    )}
                >
                    <div className={'sfy:mx-auto sfy:mt-2 sfy:h-1 sfy:w-10 sfy:rounded-full sfy:bg-muted-foreground/40 sfy:sm:hidden'} />
                    <div className={'sfy:flex sfy:items-center sfy:gap-2 sfy:border-b sfy:border-border sfy:px-4 sfy:py-3'}>
                        <h2 className={'sfy:flex-1 sfy:text-base sfy:font-semibold'}>{title}</h2>
                        {action}
                        <button
                            type={'button'}
                            onClick={onClose}
                            aria-label={'Close'}
                            className={'sfy:flex sfy:size-8 sfy:items-center sfy:justify-center sfy:rounded-full sfy:cursor-pointer sfy:text-muted-foreground sfy:hover:bg-muted sfy:hover:text-foreground'}
                        >
                            <NamedIcon name={'x'} size={18} />
                        </button>
                    </div>
                    <div className={'sfy:min-h-0 sfy:flex-1 sfy:overflow-y-auto sfy:overscroll-contain sfy:p-3'}>{children}</div>
                    {footer && <div className={'sfy:border-t sfy:border-border sfy:p-3 sfy:pb-[max(0.75rem,env(safe-area-inset-bottom))]'}>{footer}</div>}
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
                'sfy:inline-flex sfy:h-9 sfy:shrink-0 sfy:items-center sfy:gap-2 sfy:rounded-md sfy:border sfy:px-3 sfy:text-sm sfy:font-medium sfy:cursor-pointer sfy:hover:bg-muted',
                count > 0 ? 'sfy:border-primary sfy:text-foreground' : 'sfy:border-border sfy:bg-card'
            )}
        >
            <NamedIcon name={'filter'} size={16} />
            Filters
            {count > 0 && <span className={'sfy:rounded-full sfy:bg-primary sfy:px-1.5 sfy:text-xs sfy:font-semibold sfy:text-primary-foreground'}>{count}</span>}
        </button>
    );
}
