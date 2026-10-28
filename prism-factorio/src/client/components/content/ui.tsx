import { useState, type MouseEvent, type ReactNode } from 'react';
import { Spinner, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../../icons';

/** Browse / Installed tabs above a content screen. */
export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
    return (
        <div className={'fct:flex fct:gap-1 fct:border-b fct:border-border'}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type={'button'}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        'fct:px-4 fct:py-2 fct:text-sm fct:-mb-px fct:border-b-2 fct:cursor-pointer',
                        value === option.value ? 'fct:border-primary fct:text-foreground' : 'fct:border-transparent fct:text-muted-foreground fct:hover:text-foreground'
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
        <img src={src} alt={''} loading={'lazy'} onError={() => setBroken(true)} className={cn('fct:rounded-lg fct:object-cover fct:bg-muted', className)} />
    ) : (
        <div className={cn('fct:rounded-lg fct:bg-muted fct:flex fct:items-center fct:justify-center fct:text-muted-foreground', className)}>
            <NamedIcon name={'package'} size={20} />
        </div>
    );
}

export function Chip({ children, title, tone }: { children: ReactNode; title?: string; tone?: 'warning' | 'success' }) {
    return (
        <span
            title={title}
            className={cn(
                'fct:inline-flex fct:items-center fct:gap-1 fct:rounded-full fct:border fct:px-2 fct:py-0.5 fct:text-xs',
                tone === 'warning' ? 'fct:border-warning/40 fct:bg-warning/10 fct:text-warning' : tone === 'success' ? 'fct:border-success/40 fct:text-success' : 'fct:border-border fct:bg-muted/40 fct:text-muted-foreground'
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
                'fct:inline-flex fct:items-center fct:gap-1.5 fct:rounded-lg fct:border-2 fct:px-3 fct:py-1.5 fct:text-sm fct:font-semibold fct:cursor-pointer fct:whitespace-nowrap fct:transition-colors fct:disabled:cursor-not-allowed fct:disabled:opacity-60',
                installed ? 'fct:border-success fct:bg-transparent fct:text-success fct:hover:bg-success/10' : 'fct:border-success fct:bg-success fct:text-success-foreground fct:hover:brightness-110'
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
        <section className={'pt-surface fct:rounded-lg fct:border fct:border-border fct:bg-card'}>
            <button
                type={'button'}
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                className={'fct:flex fct:w-full fct:items-center fct:justify-between fct:px-4 fct:py-3 fct:text-left fct:font-semibold fct:cursor-pointer'}
            >
                {title}
                <NamedIcon name={open ? 'chevron-up' : 'chevron-down'} size={18} className={'fct:text-muted-foreground'} />
            </button>
            {open && <div className={'fct:px-3 fct:pb-3'}>{children}</div>}
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
                'fct:flex fct:w-full fct:items-center fct:gap-2 fct:rounded-md fct:px-2 fct:py-1 fct:text-sm fct:text-left fct:cursor-pointer',
                on ? 'fct:bg-primary/20 fct:font-semibold' : 'fct:hover:bg-muted'
            )}
        >
            <NamedIcon name={on ? 'square-check' : 'square'} size={14} className={on ? 'fct:text-primary' : 'fct:text-muted-foreground'} />
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

    const button = 'fct:flex fct:size-8 fct:items-center fct:justify-center fct:rounded-full fct:text-sm fct:cursor-pointer';

    return (
        <nav className={'fct:flex fct:items-center fct:gap-1'} aria-label={'Pages'}>
            <button type={'button'} className={cn(button, 'fct:hover:bg-muted fct:disabled:opacity-40')} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={'Previous page'}>
                <NamedIcon name={'chevron-left'} size={16} />
            </button>
            {pageItems(page, total).map((item, index) =>
                item === 'gap' ? (
                    <span key={`gap-${index}`} className={'fct:px-1 fct:text-muted-foreground'}>
                        …
                    </span>
                ) : (
                    <button
                        key={item}
                        type={'button'}
                        onClick={() => onPage(item)}
                        aria-current={item === page ? 'page' : undefined}
                        className={cn(button, 'fct:min-w-8 fct:px-2', item === page ? 'fct:bg-primary fct:text-primary-foreground fct:font-semibold' : 'fct:hover:bg-muted')}
                    >
                        {item}
                    </button>
                )
            )}
            <button type={'button'} className={cn(button, 'fct:hover:bg-muted fct:disabled:opacity-40')} disabled={page >= total} onClick={() => onPage(page + 1)} aria-label={'Next page'}>
                <NamedIcon name={'chevron-right'} size={16} />
            </button>
        </nav>
    );
}
