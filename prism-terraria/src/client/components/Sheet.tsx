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
            <div className={'trs:fixed trs:inset-0 trs:z-[55] trs:flex trs:items-end trs:sm:items-stretch trs:sm:justify-end'} role={'dialog'} aria-modal={'true'} aria-label={title}>
                <div className={'trs:absolute trs:inset-0 trs:bg-black/50'} onClick={onClose} />
                <div
                    className={cn(
                        'pt-surface trs:relative trs:flex trs:w-full trs:flex-col trs:border-border trs:bg-card trs:shadow-2xl',
                        'trs:max-h-[85dvh] trs:rounded-t-2xl trs:border-t',
                        'trs:sm:max-h-none trs:sm:h-full trs:sm:w-96 trs:sm:rounded-none trs:sm:border-t-0 trs:sm:border-l'
                    )}
                >
                    <div className={'trs:mx-auto trs:mt-2 trs:h-1 trs:w-10 trs:rounded-full trs:bg-muted-foreground/40 trs:sm:hidden'} />
                    <div className={'trs:flex trs:items-center trs:gap-2 trs:border-b trs:border-border trs:px-4 trs:py-3'}>
                        <h2 className={'trs:flex-1 trs:text-base trs:font-semibold'}>{title}</h2>
                        {action}
                        <button
                            type={'button'}
                            onClick={onClose}
                            aria-label={'Close'}
                            className={'trs:flex trs:size-8 trs:items-center trs:justify-center trs:rounded-full trs:cursor-pointer trs:text-muted-foreground trs:hover:bg-muted trs:hover:text-foreground'}
                        >
                            <NamedIcon name={'x'} size={18} />
                        </button>
                    </div>
                    <div className={'trs:min-h-0 trs:flex-1 trs:overflow-y-auto trs:overscroll-contain trs:p-3'}>{children}</div>
                    {footer && <div className={'trs:border-t trs:border-border trs:p-3 trs:pb-[max(0.75rem,env(safe-area-inset-bottom))]'}>{footer}</div>}
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
                'trs:inline-flex trs:h-9 trs:shrink-0 trs:items-center trs:gap-2 trs:rounded-md trs:border trs:px-3 trs:text-sm trs:font-medium trs:cursor-pointer trs:hover:bg-muted',
                count > 0 ? 'trs:border-primary trs:text-foreground' : 'trs:border-border trs:bg-card'
            )}
        >
            <NamedIcon name={'filter'} size={16} />
            Filters
            {count > 0 && <span className={'trs:rounded-full trs:bg-primary trs:px-1.5 trs:text-xs trs:font-semibold trs:text-primary-foreground'}>{count}</span>}
        </button>
    );
}
