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
            <div className={'fct:fixed fct:inset-0 fct:z-[55] fct:flex fct:items-end fct:sm:items-stretch fct:sm:justify-end'} role={'dialog'} aria-modal={'true'} aria-label={title}>
                <div className={'fct:absolute fct:inset-0 fct:bg-black/50'} onClick={onClose} />
                <div
                    className={cn(
                        'pt-surface fct:relative fct:flex fct:w-full fct:flex-col fct:border-border fct:bg-card fct:shadow-2xl',
                        'fct:max-h-[85dvh] fct:rounded-t-2xl fct:border-t',
                        'fct:sm:max-h-none fct:sm:h-full fct:sm:w-96 fct:sm:rounded-none fct:sm:border-t-0 fct:sm:border-l'
                    )}
                >
                    <div className={'fct:mx-auto fct:mt-2 fct:h-1 fct:w-10 fct:rounded-full fct:bg-muted-foreground/40 fct:sm:hidden'} />
                    <div className={'fct:flex fct:items-center fct:gap-2 fct:border-b fct:border-border fct:px-4 fct:py-3'}>
                        <h2 className={'fct:flex-1 fct:text-base fct:font-semibold'}>{title}</h2>
                        {action}
                        <button
                            type={'button'}
                            onClick={onClose}
                            aria-label={'Close'}
                            className={'fct:flex fct:size-8 fct:items-center fct:justify-center fct:rounded-full fct:cursor-pointer fct:text-muted-foreground fct:hover:bg-muted fct:hover:text-foreground'}
                        >
                            <NamedIcon name={'x'} size={18} />
                        </button>
                    </div>
                    <div className={'fct:min-h-0 fct:flex-1 fct:overflow-y-auto fct:overscroll-contain fct:p-3'}>{children}</div>
                    {footer && <div className={'fct:border-t fct:border-border fct:p-3 fct:pb-[max(0.75rem,env(safe-area-inset-bottom))]'}>{footer}</div>}
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
                'fct:inline-flex fct:h-9 fct:shrink-0 fct:items-center fct:gap-2 fct:rounded-md fct:border fct:px-3 fct:text-sm fct:font-medium fct:cursor-pointer fct:hover:bg-muted',
                count > 0 ? 'fct:border-primary fct:text-foreground' : 'fct:border-border fct:bg-card'
            )}
        >
            <NamedIcon name={'filter'} size={16} />
            Filters
            {count > 0 && <span className={'fct:rounded-full fct:bg-primary fct:px-1.5 fct:text-xs fct:font-semibold fct:text-primary-foreground'}>{count}</span>}
        </button>
    );
}
