import { useState, type ReactNode } from 'react';
import { cn, toast } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';

export function Pills<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (value: T) => void; size?: 'sm' | 'md' }) {
    return (
        <div className={'prism-switch pdb:flex pdb:flex-wrap pdb:gap-1 pdb:rounded-lg pdb:border pdb:border-border pdb:bg-card pdb:p-1'}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type={'button'}
                    disabled={option.disabled}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        'prism-switch-item pdb:rounded-md pdb:cursor-pointer pdb:disabled:cursor-not-allowed pdb:disabled:opacity-40',
                        size === 'sm' ? 'pdb:px-2.5 pdb:py-1 pdb:text-xs' : 'pdb:px-3 pdb:py-1.5 pdb:text-sm',
                        value === option.value ? 'pdb:bg-muted pdb:font-semibold pdb:text-foreground' : 'pdb:text-muted-foreground pdb:hover:text-foreground'
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
        <section className={cn('pt-surface pdb:flex pdb:flex-col pdb:overflow-hidden pdb:rounded-lg pdb:border pdb:border-border pdb:bg-card', className)}>
            <div className={'pdb:flex pdb:min-h-12 pdb:items-center pdb:gap-2 pdb:border-b pdb:border-border pdb:px-4 pdb:py-2'}>
                <h3 className={'pdb:flex-1 pdb:text-xs pdb:font-semibold pdb:uppercase pdb:tracking-wide'}>{title}</h3>
                {actions}
            </div>
            <div className={'pdb:flex-1 pdb:p-4'}>{children}</div>
        </section>
    );
}

export function Tile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
    return (
        <div className={'pt-surface pdb:min-w-0 pdb:rounded-lg pdb:border pdb:border-border pdb:bg-card pdb:p-4'}>
            <p className={'pdb:text-xs pdb:uppercase pdb:tracking-wide pdb:text-muted-foreground'}>{label}</p>
            <p className={'pdb:mt-1 pdb:truncate pdb:text-2xl pdb:font-semibold pdb:tabular-nums'}>{value}</p>
            {detail && <p className={'pdb:truncate pdb:text-xs pdb:text-muted-foreground'}>{detail}</p>}
        </div>
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

/** A read-only value with a Copy button, and an eye for secrets. */
export function CopyField({ label, value, secret }: { label: string; value: string | null; secret?: boolean }) {
    const [shown, setShown] = useState(!secret);

    return (
        <label className={'pdb:flex pdb:min-w-0 pdb:flex-col pdb:gap-1'}>
            <span className={'pdb:text-xs pdb:uppercase pdb:tracking-wide pdb:text-muted-foreground'}>{label}</span>
            <span className={'pdb:flex pdb:min-w-0 pdb:items-center pdb:gap-1 pdb:rounded-md pdb:border pdb:border-border pdb:bg-background/60 pdb:px-3 pdb:py-2'}>
                <span className={cn('pdb:min-w-0 pdb:flex-1 pdb:truncate pdb:font-mono pdb:text-sm', !shown && 'pdb:blur-sm pdb:select-none')}>{value ?? 'Hidden'}</span>
                {secret && value && (
                    <button type={'button'} onClick={() => setShown(!shown)} aria-label={shown ? 'Hide' : 'Show'} className={'pdb:cursor-pointer pdb:text-muted-foreground pdb:hover:text-foreground'}>
                        <NamedIcon name={shown ? 'eye-off' : 'eye'} size={14} />
                    </button>
                )}
                {value && (
                    <button type={'button'} onClick={() => copy(value, `${label} copied`)} className={'pdb:text-xs pdb:text-muted-foreground pdb:cursor-pointer pdb:hover:text-primary'}>
                        Copy
                    </button>
                )}
            </span>
        </label>
    );
}

/** A small area chart of a series over time. */
export function UsageChart({ points, format }: { points: { at: string; value: number }[]; format: (value: number) => string }) {
    if (points.length < 2) return <p className={'pdb:py-6 pdb:text-sm pdb:text-muted-foreground'}>Not enough history yet. A point is recorded every hour.</p>;

    const max = Math.max(...points.map((point) => point.value), 1);
    const min = Math.min(...points.map((point) => point.value));
    const first = Date.parse(points[0].at);
    const span = Math.max(1, Date.parse(points[points.length - 1].at) - first);
    const coords = points.map((point) => [((Date.parse(point.at) - first) / span) * 100, 38 - ((point.value - min * 0.9) / Math.max(1, max - min * 0.9)) * 34]);
    const line = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

    return (
        <div className={'pdb:flex pdb:flex-col pdb:gap-1'}>
            <svg viewBox={'0 0 100 40'} preserveAspectRatio={'none'} className={'pdb:h-32 pdb:w-full'} aria-hidden>
                <polygon points={`0,40 ${line} 100,40`} className={'pdb:fill-primary/15'} />
                <polyline points={line} fill={'none'} className={'pdb:stroke-primary'} strokeWidth={1.5} vectorEffect={'non-scaling-stroke'} />
            </svg>
            <div className={'pdb:flex pdb:justify-between pdb:text-xs pdb:text-muted-foreground'}>
                <span>{new Date(first).toLocaleDateString()}</span>
                <span>
                    now {format(points[points.length - 1].value)} · high {format(max)}
                </span>
            </div>
        </div>
    );
}
