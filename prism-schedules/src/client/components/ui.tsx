import type { ReactNode } from 'react';
import { cn, toast } from '@pterodactyl/sdk';

export function Pills<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (value: T) => void; size?: 'sm' | 'md' }) {
    return (
        <div className={'prism-switch psc:flex psc:flex-wrap psc:gap-1 psc:rounded-lg psc:border psc:border-border psc:bg-card psc:p-1'}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type={'button'}
                    disabled={option.disabled}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        'prism-switch-item psc:rounded-md psc:cursor-pointer psc:disabled:cursor-not-allowed psc:disabled:opacity-40',
                        size === 'sm' ? 'psc:px-2.5 psc:py-1 psc:text-xs' : 'psc:px-3 psc:py-1.5 psc:text-sm',
                        value === option.value ? 'psc:bg-muted psc:font-semibold psc:text-foreground' : 'psc:text-muted-foreground psc:hover:text-foreground'
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export function Section({ title, actions, children, className }: { title: string; actions?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={cn('psc:flex psc:flex-col psc:overflow-hidden psc:rounded-lg psc:border psc:border-border psc:bg-card', className)}>
            <div className={'psc:flex psc:min-h-12 psc:items-center psc:gap-2 psc:border-b psc:border-border psc:px-4 psc:py-2'}>
                <h3 className={'psc:flex-1 psc:text-xs psc:font-semibold psc:uppercase psc:tracking-wide'}>{title}</h3>
                {actions}
            </div>
            <div className={'psc:flex-1 psc:p-4'}>{children}</div>
        </section>
    );
}

export function Progress({ value, label }: { value: number; label?: string | null }) {
    return (
        <div className={'psc:flex psc:flex-col psc:gap-1.5'}>
            <div className={'psc:h-2 psc:overflow-hidden psc:rounded-full psc:bg-muted'}>
                <div className={'psc:h-full psc:rounded-full psc:bg-primary psc:transition-all'} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
            </div>
            {label && <p className={'psc:text-xs psc:text-muted-foreground'}>{label}</p>}
        </div>
    );
}

export function Check({ checked, partial, disabled, onChange, label }: { checked: boolean; partial?: boolean; disabled?: boolean; onChange: (checked: boolean) => void; label: string }) {
    return (
        <input
            type={'checkbox'}
            aria-label={label}
            checked={checked}
            disabled={disabled}
            ref={(element) => {
                if (element) element.indeterminate = !checked && !!partial;
            }}
            onChange={(event) => onChange(event.target.checked)}
            onClick={(event) => event.stopPropagation()}
            className={'psc:size-4 psc:shrink-0 psc:cursor-pointer psc:disabled:cursor-not-allowed'}
            style={{ accentColor: 'var(--primary)' }}
        />
    );
}

export async function copy(text: string, what = 'Copied') {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(`${what}.`);
    } catch {
        toast.error('Your browser did not allow copying.');
    }
}

export function bytes(value: number): string {
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = value / 1024;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit++;
    }

    return `${size >= 100 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

export function duration(from: string, to: string | null): string | null {
    if (!to) return null;
    const seconds = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;

    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** "Today", "Yesterday" or the date, for grouping backups. */
export function day(iso: string): string {
    const date = new Date(iso);
    const today = new Date();
    const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
    const difference = Math.round((start(today) - start(date)) / 86400000);
    if (difference === 0) return 'Today';
    if (difference === 1) return 'Yesterday';

    return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
