import { useState, type ReactNode } from 'react';
import { NamedIcon, cn } from '@pterodactyl/sdk';
import type { Tag } from '../../api/content';

/** Loader colours, as Modrinth shows them. */
export const LOADER_COLORS: Record<string, string> = {
    fabric: '#dbb69b',
    quilt: '#c796f9',
    forge: '#959eef',
    neoforge: '#f99e6b',
    paper: '#eeaaaa',
    purpur: '#c3abf7',
    spigot: '#f1cc84',
    bukkit: '#f6af7b',
    folia: '#a5e388',
    sponge: '#f9e580',
    velocity: '#83d5ef',
    waterfall: '#78a4fb',
    bungeecord: '#d2c080',
    liteloader: '#7ab0ee',
};

const LABELS: Record<string, string> = {
    neoforge: 'NeoForge',
    bungeecord: 'BungeeCord',
    liteloader: 'LiteLoader',
    'game-mechanics': 'Game Mechanics',
    'legacy-fabric': 'Legacy Fabric',
    'bta-babric': 'BTA (Babric)',
    'java-agent': 'Java Agent',
    'kitchen-sink': 'Kitchen Sink',
};

export function tagLabel(name: string): string {
    return LABELS[name] ?? name.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Draws a Modrinth tag icon. The markup was sanitised by the Panel before it got here. */
export function TagIcon({ icon, className }: { icon: string | null | undefined; className?: string }) {
    if (!icon) {
        return <NamedIcon name={'tag'} size={14} className={className} />;
    }

    return <span aria-hidden className={cn('mcs-tag-icon', className)} dangerouslySetInnerHTML={{ __html: icon }} />;
}

/** A small rounded label, like the tags on Modrinth's project cards. */
export function Chip({ children, color, title }: { children: ReactNode; color?: string; title?: string }) {
    return (
        <span
            title={title}
            className={'mcs:inline-flex mcs:items-center mcs:gap-1 mcs:rounded-full mcs:border mcs:border-border mcs:bg-muted/40 mcs:px-2 mcs:py-0.5 mcs:text-xs mcs:text-muted-foreground'}
            style={color ? { color } : undefined}
        >
            {children}
        </span>
    );
}

export function tagIcon(tags: Tag[], name: string): string | null {
    return tags.find((tag) => tag.name === name)?.icon ?? null;
}

/** A filter block that folds away, as on Modrinth's sidebar. */
export function FilterSection({ title, children, action, defaultOpen = true }: { title: string; children: ReactNode; action?: ReactNode; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <section className={'mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card'}>
            <div className={'mcs:flex mcs:items-center mcs:gap-2 mcs:px-4 mcs:py-3'}>
                <button
                    type={'button'}
                    onClick={() => setOpen(!open)}
                    aria-expanded={open}
                    className={'mcs:flex mcs:flex-1 mcs:items-center mcs:justify-between mcs:text-left mcs:font-semibold mcs:cursor-pointer'}
                >
                    {title}
                    <NamedIcon name={open ? 'chevron-up' : 'chevron-down'} size={18} className={'mcs:text-muted-foreground'} />
                </button>
                {action}
            </div>
            {open && <div className={'mcs:px-3 mcs:pb-3'}>{children}</div>}
        </section>
    );
}

/** One row in a filter list: click to include it, or use the ban button to exclude it. */
export function FilterRow({
    label,
    icon,
    color,
    state,
    onToggle,
    onExclude,
}: {
    label: string;
    icon?: ReactNode;
    color?: string;
    state: 'off' | 'on' | 'excluded';
    onToggle: () => void;
    onExclude?: () => void;
}) {
    return (
        <div className={'mcs:group mcs:flex mcs:items-center mcs:gap-1'}>
            <button
                type={'button'}
                onClick={onToggle}
                aria-pressed={state === 'on'}
                className={cn(
                    'mcs:flex mcs:flex-1 mcs:min-w-0 mcs:items-center mcs:gap-2 mcs:rounded-md mcs:px-2 mcs:py-1 mcs:text-sm mcs:text-left mcs:cursor-pointer',
                    state === 'on' && 'mcs:bg-primary/20 mcs:font-semibold',
                    state === 'excluded' && 'mcs:bg-destructive/15 mcs:line-through mcs:opacity-80',
                    state === 'off' && 'mcs:hover:bg-muted'
                )}
                style={color ? { color } : undefined}
            >
                {icon && <span className={'mcs:flex mcs:size-4 mcs:shrink-0 mcs:items-center mcs:justify-center'}>{icon}</span>}
                <span className={'mcs:flex-1 mcs:truncate'}>{label}</span>
                {state === 'on' && <NamedIcon name={'check'} size={14} className={'mcs:text-success'} />}
            </button>
            {onExclude && (
                <button
                    type={'button'}
                    onClick={onExclude}
                    title={state === 'excluded' ? `Stop excluding ${label}` : `Exclude ${label}`}
                    aria-label={state === 'excluded' ? `Stop excluding ${label}` : `Exclude ${label}`}
                    className={cn(
                        'mcs:rounded-md mcs:p-1 mcs:cursor-pointer mcs:text-muted-foreground mcs:hover:text-destructive',
                        state === 'excluded' ? 'mcs:text-destructive mcs:opacity-100' : 'mcs:opacity-0 mcs:group-hover:opacity-100 mcs:focus:opacity-100'
                    )}
                >
                    <NamedIcon name={'ban'} size={14} />
                </button>
            )}
        </div>
    );
}
