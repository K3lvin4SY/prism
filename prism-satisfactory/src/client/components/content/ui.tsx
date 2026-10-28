import { useState, type MouseEvent, type ReactNode } from 'react';
import { Spinner, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../../icons';

/** Browse / Installed tabs above a content screen. */
export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
    return (
        <div className={'sfy:flex sfy:gap-1 sfy:border-b sfy:border-border'}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type={'button'}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        'sfy:px-4 sfy:py-2 sfy:text-sm sfy:-mb-px sfy:border-b-2 sfy:cursor-pointer',
                        value === option.value ? 'sfy:border-primary sfy:text-foreground' : 'sfy:border-transparent sfy:text-muted-foreground sfy:hover:text-foreground'
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
        <img src={src} alt={''} loading={'lazy'} onError={() => setBroken(true)} className={cn('sfy:rounded-lg sfy:object-cover sfy:bg-muted', className)} />
    ) : (
        <div className={cn('sfy:rounded-lg sfy:bg-muted sfy:flex sfy:items-center sfy:justify-center sfy:text-muted-foreground', className)}>
            <NamedIcon name={'package'} size={20} />
        </div>
    );
}

export function Chip({ children, title, tone }: { children: ReactNode; title?: string; tone?: 'warning' | 'success' }) {
    return (
        <span
            title={title}
            className={cn(
                'sfy:inline-flex sfy:items-center sfy:gap-1 sfy:rounded-full sfy:border sfy:px-2 sfy:py-0.5 sfy:text-xs',
                tone === 'warning' ? 'sfy:border-warning/40 sfy:bg-warning/10 sfy:text-warning' : tone === 'success' ? 'sfy:border-success/40 sfy:text-success' : 'sfy:border-border sfy:bg-muted/40 sfy:text-muted-foreground'
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
                'sfy:inline-flex sfy:items-center sfy:gap-1.5 sfy:rounded-lg sfy:border-2 sfy:px-3 sfy:py-1.5 sfy:text-sm sfy:font-semibold sfy:cursor-pointer sfy:whitespace-nowrap sfy:transition-colors sfy:disabled:cursor-not-allowed sfy:disabled:opacity-60',
                installed ? 'sfy:border-success sfy:bg-transparent sfy:text-success sfy:hover:bg-success/10' : 'sfy:border-success sfy:bg-success sfy:text-success-foreground sfy:hover:brightness-110'
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
        <section className={'pt-surface sfy:rounded-lg sfy:border sfy:border-border sfy:bg-card'}>
            <button
                type={'button'}
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                className={'sfy:flex sfy:w-full sfy:items-center sfy:justify-between sfy:px-4 sfy:py-3 sfy:text-left sfy:font-semibold sfy:cursor-pointer'}
            >
                {title}
                <NamedIcon name={open ? 'chevron-up' : 'chevron-down'} size={18} className={'sfy:text-muted-foreground'} />
            </button>
            {open && <div className={'sfy:px-3 sfy:pb-3'}>{children}</div>}
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
                'sfy:flex sfy:w-full sfy:items-center sfy:gap-2 sfy:rounded-md sfy:px-2 sfy:py-1 sfy:text-sm sfy:text-left sfy:cursor-pointer',
                on ? 'sfy:bg-primary/20 sfy:font-semibold' : 'sfy:hover:bg-muted'
            )}
        >
            <NamedIcon name={on ? 'square-check' : 'square'} size={14} className={on ? 'sfy:text-primary' : 'sfy:text-muted-foreground'} />
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

    const button = 'sfy:flex sfy:size-8 sfy:items-center sfy:justify-center sfy:rounded-full sfy:text-sm sfy:cursor-pointer';

    return (
        <nav className={'sfy:flex sfy:items-center sfy:gap-1'} aria-label={'Pages'}>
            <button type={'button'} className={cn(button, 'sfy:hover:bg-muted sfy:disabled:opacity-40')} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={'Previous page'}>
                <NamedIcon name={'chevron-left'} size={16} />
            </button>
            {pageItems(page, total).map((item, index) =>
                item === 'gap' ? (
                    <span key={`gap-${index}`} className={'sfy:px-1 sfy:text-muted-foreground'}>
                        …
                    </span>
                ) : (
                    <button
                        key={item}
                        type={'button'}
                        onClick={() => onPage(item)}
                        aria-current={item === page ? 'page' : undefined}
                        className={cn(button, 'sfy:min-w-8 sfy:px-2', item === page ? 'sfy:bg-primary sfy:text-primary-foreground sfy:font-semibold' : 'sfy:hover:bg-muted')}
                    >
                        {item}
                    </button>
                )
            )}
            <button type={'button'} className={cn(button, 'sfy:hover:bg-muted sfy:disabled:opacity-40')} disabled={page >= total} onClick={() => onPage(page + 1)} aria-label={'Next page'}>
                <NamedIcon name={'chevron-right'} size={16} />
            </button>
        </nav>
    );
}
