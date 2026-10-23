import type { ReactNode } from 'react';
import { cn, toast } from '@pterodactyl/sdk';

export function Pills<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (value: T) => void; size?: 'sm' | 'md' }) {
    return (
        <div className={'pbk:flex pbk:flex-wrap pbk:gap-1 pbk:rounded-lg pbk:border pbk:border-border pbk:bg-card pbk:p-1'}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type={'button'}
                    disabled={option.disabled}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        'pbk:rounded-md pbk:cursor-pointer pbk:disabled:cursor-not-allowed pbk:disabled:opacity-40',
                        size === 'sm' ? 'pbk:px-2.5 pbk:py-1 pbk:text-xs' : 'pbk:px-3 pbk:py-1.5 pbk:text-sm',
                        value === option.value ? 'pbk:bg-muted pbk:font-semibold pbk:text-foreground' : 'pbk:text-muted-foreground pbk:hover:text-foreground'
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
        <section className={cn('pbk:flex pbk:flex-col pbk:overflow-hidden pbk:rounded-lg pbk:border pbk:border-border pbk:bg-card', className)}>
            <div className={'pbk:flex pbk:min-h-12 pbk:items-center pbk:gap-2 pbk:border-b pbk:border-border pbk:px-4 pbk:py-2'}>
                <h3 className={'pbk:flex-1 pbk:text-xs pbk:font-semibold pbk:uppercase pbk:tracking-wide'}>{title}</h3>
                {actions}
            </div>
            <div className={'pbk:flex-1 pbk:p-4'}>{children}</div>
        </section>
    );
}

export function Progress({ value, label }: { value: number; label?: string | null }) {
    return (
        <div className={'pbk:flex pbk:flex-col pbk:gap-1.5'}>
            <div className={'pbk:h-2 pbk:overflow-hidden pbk:rounded-full pbk:bg-muted'}>
                <div className={'pbk:h-full pbk:rounded-full pbk:bg-primary pbk:transition-all'} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
            </div>
            {label && <p className={'pbk:text-xs pbk:text-muted-foreground'}>{label}</p>}
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
            className={'pbk:size-4 pbk:shrink-0 pbk:cursor-pointer pbk:disabled:cursor-not-allowed'}
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
