import { useState, type MouseEvent, type ReactNode } from 'react';
import { NamedIcon, Spinner, cn } from '@pterodactyl/sdk';

/** Browse / Installed tabs above a content screen. */
export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
    return (
        <div className={'trs:flex trs:gap-1 trs:border-b trs:border-border'}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type={'button'}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        'trs:px-4 trs:py-2 trs:text-sm trs:-mb-px trs:border-b-2 trs:cursor-pointer',
                        value === option.value ? 'trs:border-primary trs:text-foreground' : 'trs:border-transparent trs:text-muted-foreground trs:hover:text-foreground'
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
        <img src={src} alt={''} loading={'lazy'} onError={() => setBroken(true)} className={cn('trs:rounded-lg trs:object-cover trs:bg-muted', className)} />
    ) : (
        <div className={cn('trs:rounded-lg trs:bg-muted trs:flex trs:items-center trs:justify-center trs:text-muted-foreground', className)}>
            <NamedIcon name={'package'} size={20} />
        </div>
    );
}

export function Chip({ children, title, tone }: { children: ReactNode; title?: string; tone?: 'warning' | 'success' }) {
    return (
        <span
            title={title}
            className={cn(
                'trs:inline-flex trs:items-center trs:gap-1 trs:rounded-full trs:border trs:px-2 trs:py-0.5 trs:text-xs',
                tone === 'warning' ? 'trs:border-warning/40 trs:bg-warning/10 trs:text-warning' : tone === 'success' ? 'trs:border-success/40 trs:text-success' : 'trs:border-border trs:bg-muted/40 trs:text-muted-foreground'
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
                'trs:inline-flex trs:items-center trs:gap-1.5 trs:rounded-lg trs:border-2 trs:px-3 trs:py-1.5 trs:text-sm trs:font-semibold trs:cursor-pointer trs:whitespace-nowrap trs:transition-colors trs:disabled:cursor-not-allowed trs:disabled:opacity-60',
                installed ? 'trs:border-success trs:bg-transparent trs:text-success trs:hover:bg-success/10' : 'trs:border-success trs:bg-success trs:text-success-foreground trs:hover:brightness-110'
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
        <section className={'trs:rounded-lg trs:border trs:border-border trs:bg-card'}>
            <button
                type={'button'}
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                className={'trs:flex trs:w-full trs:items-center trs:justify-between trs:px-4 trs:py-3 trs:text-left trs:font-semibold trs:cursor-pointer'}
            >
                {title}
                <NamedIcon name={open ? 'chevron-up' : 'chevron-down'} size={18} className={'trs:text-muted-foreground'} />
            </button>
            {open && <div className={'trs:px-3 trs:pb-3'}>{children}</div>}
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
                'trs:flex trs:w-full trs:items-center trs:gap-2 trs:rounded-md trs:px-2 trs:py-1 trs:text-sm trs:text-left trs:cursor-pointer',
                on ? 'trs:bg-primary/20 trs:font-semibold' : 'trs:hover:bg-muted'
            )}
        >
            <NamedIcon name={on ? 'square-check' : 'square'} size={14} className={on ? 'trs:text-primary' : 'trs:text-muted-foreground'} />
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

    const button = 'trs:flex trs:size-8 trs:items-center trs:justify-center trs:rounded-full trs:text-sm trs:cursor-pointer';

    return (
        <nav className={'trs:flex trs:items-center trs:gap-1'} aria-label={'Pages'}>
            <button type={'button'} className={cn(button, 'trs:hover:bg-muted trs:disabled:opacity-40')} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={'Previous page'}>
                <NamedIcon name={'chevron-left'} size={16} />
            </button>
            {pageItems(page, total).map((item, index) =>
                item === 'gap' ? (
                    <span key={`gap-${index}`} className={'trs:px-1 trs:text-muted-foreground'}>
                        …
                    </span>
                ) : (
                    <button
                        key={item}
                        type={'button'}
                        onClick={() => onPage(item)}
                        aria-current={item === page ? 'page' : undefined}
                        className={cn(button, 'trs:min-w-8 trs:px-2', item === page ? 'trs:bg-primary trs:text-primary-foreground trs:font-semibold' : 'trs:hover:bg-muted')}
                    >
                        {item}
                    </button>
                )
            )}
            <button type={'button'} className={cn(button, 'trs:hover:bg-muted trs:disabled:opacity-40')} disabled={page >= total} onClick={() => onPage(page + 1)} aria-label={'Next page'}>
                <NamedIcon name={'chevron-right'} size={16} />
            </button>
        </nav>
    );
}
