import { useState, type MouseEvent, type ReactNode } from 'react';
import { Spinner, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../../icons';

/** Browse / Installed tabs above a content screen. */
export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
    return (
        <div className={'cks:flex cks:gap-1 cks:border-b cks:border-border'}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type={'button'}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        'cks:px-4 cks:py-2 cks:text-sm cks:-mb-px cks:border-b-2 cks:cursor-pointer',
                        value === option.value ? 'cks:border-primary cks:text-foreground' : 'cks:border-transparent cks:text-muted-foreground cks:hover:text-foreground'
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export function ItemIcon({ src, className }: { src: string | null | undefined; className?: string }) {
    const [broken, setBroken] = useState(false);

    return src && !broken ? (
        <img src={src} alt={''} loading={'lazy'} onError={() => setBroken(true)} className={cn('cks:rounded-lg cks:object-cover cks:bg-muted', className)} />
    ) : (
        <div className={cn('cks:rounded-lg cks:bg-muted cks:flex cks:items-center cks:justify-center cks:text-muted-foreground', className)}>
            <NamedIcon name={'package'} size={20} />
        </div>
    );
}

export function Chip({ children, title, tone }: { children: ReactNode; title?: string; tone?: 'warning' | 'success' }) {
    return (
        <span
            title={title}
            className={cn(
                'cks:inline-flex cks:items-center cks:gap-1 cks:rounded-full cks:border cks:px-2 cks:py-0.5 cks:text-xs',
                tone === 'warning' ? 'cks:border-warning/40 cks:bg-warning/10 cks:text-warning' : tone === 'success' ? 'cks:border-success/40 cks:text-success' : 'cks:border-border cks:bg-muted/40 cks:text-muted-foreground'
            )}
        >
            {children}
        </span>
    );
}

/** "+ Install" on solid green, or "✓ Installed" with a green border. */
export function InstallButton({ installed, busy = false, disabled = false, onClick }: { installed: boolean; busy?: boolean; disabled?: boolean; onClick: () => void }) {
    return (
        <button
            type={'button'}
            disabled={busy || disabled}
            onClick={(event: MouseEvent) => {
                event.stopPropagation();
                onClick();
            }}
            className={cn(
                'cks:inline-flex cks:items-center cks:gap-1.5 cks:rounded-lg cks:border-2 cks:px-3 cks:py-1.5 cks:text-sm cks:font-semibold cks:cursor-pointer cks:whitespace-nowrap cks:transition-colors cks:disabled:cursor-not-allowed cks:disabled:opacity-60',
                installed ? 'cks:border-success cks:bg-transparent cks:text-success cks:hover:bg-success/10' : 'cks:border-success cks:bg-success cks:text-success-foreground cks:hover:brightness-110'
            )}
        >
            {busy ? <Spinner size={'small'} /> : <NamedIcon name={installed ? 'check' : 'plus'} size={16} />}
            {busy ? 'Installing' : installed ? 'Installed' : 'Install'}
        </button>
    );
}

export function FilterSection({ title, children }: { title: string; children: ReactNode }) {
    const [open, setOpen] = useState(true);

    return (
        <section className={'pt-surface cks:rounded-lg cks:border cks:border-border cks:bg-card'}>
            <button
                type={'button'}
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                className={'cks:flex cks:w-full cks:items-center cks:justify-between cks:px-4 cks:py-3 cks:text-left cks:font-semibold cks:cursor-pointer'}
            >
                {title}
                <NamedIcon name={open ? 'chevron-up' : 'chevron-down'} size={18} className={'cks:text-muted-foreground'} />
            </button>
            {open && <div className={'cks:px-3 cks:pb-3'}>{children}</div>}
        </section>
    );
}

export function FilterRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
    return (
        <button
            type={'button'}
            onClick={onToggle}
            aria-pressed={on}
            className={cn(
                'cks:flex cks:w-full cks:items-center cks:gap-2 cks:rounded-md cks:px-2 cks:py-1 cks:text-sm cks:text-left cks:cursor-pointer',
                on ? 'cks:bg-primary/20 cks:font-semibold' : 'cks:hover:bg-muted'
            )}
        >
            <NamedIcon name={on ? 'square-check' : 'square'} size={14} className={on ? 'cks:text-primary' : 'cks:text-muted-foreground'} />
            {label}
        </button>
    );
}

/** Page numbers with gaps: 1 … 4 5 6 … 20 */
function pageItems(page: number, total: number): (number | 'gap')[] {
    const pages = [...new Set([1, total, page - 1, page, page + 1].filter((value) => value >= 1 && value <= total))].sort((a, b) => a - b);
    const items: (number | 'gap')[] = [];
    pages.forEach((value, index) => {
        if (index > 0 && value - pages[index - 1] > 1) items.push('gap');
        items.push(value);
    });

    return items;
}

export function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
    if (total <= 1) return null;

    const button = 'cks:flex cks:size-8 cks:items-center cks:justify-center cks:rounded-full cks:text-sm cks:cursor-pointer';

    return (
        <nav className={'cks:flex cks:items-center cks:gap-1'} aria-label={'Pages'}>
            <button type={'button'} className={cn(button, 'cks:hover:bg-muted cks:disabled:opacity-40')} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={'Previous page'}>
                <NamedIcon name={'chevron-left'} size={16} />
            </button>
            {pageItems(page, total).map((item, index) =>
                item === 'gap' ? (
                    <span key={`gap-${index}`} className={'cks:px-1 cks:text-muted-foreground'}>
                        …
                    </span>
                ) : (
                    <button
                        key={item}
                        type={'button'}
                        onClick={() => onPage(item)}
                        aria-current={item === page ? 'page' : undefined}
                        className={cn(button, 'cks:min-w-8 cks:px-2', item === page ? 'cks:bg-primary cks:text-primary-foreground cks:font-semibold' : 'cks:hover:bg-muted')}
                    >
                        {item}
                    </button>
                )
            )}
            <button type={'button'} className={cn(button, 'cks:hover:bg-muted cks:disabled:opacity-40')} disabled={page >= total} onClick={() => onPage(page + 1)} aria-label={'Next page'}>
                <NamedIcon name={'chevron-right'} size={16} />
            </button>
        </nav>
    );
}
