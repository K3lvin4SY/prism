import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';

/** A small icon button for the terminal's toolbar. */
export function IconButton({ icon, label, active, onClick, disabled }: { icon: string; label: string; active?: boolean; onClick: () => void; disabled?: boolean }) {
    return (
        <button
            type={'button'}
            title={label}
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'pcn:flex pcn:size-7 pcn:items-center pcn:justify-center pcn:rounded-md pcn:cursor-pointer pcn:transition-colors pcn:disabled:opacity-40',
                active ? 'pcn:bg-primary pcn:text-primary-foreground' : 'pcn:text-muted-foreground pcn:hover:bg-white/10 pcn:hover:text-foreground'
            )}
        >
            <NamedIcon name={icon} size={15} />
        </button>
    );
}

/** A menu anchored to an icon button that closes on an outside click or Escape. */
export function Popover({ icon, label, children, width = 'pcn:w-64' }: { icon: string; label: string; children: (close: () => void) => ReactNode; width?: string }) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const outside = (event: MouseEvent) => root.current && !root.current.contains(event.target as Node) && setOpen(false);
        const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', outside);
        document.addEventListener('keydown', escape);

        return () => {
            document.removeEventListener('mousedown', outside);
            document.removeEventListener('keydown', escape);
        };
    }, [open]);

    return (
        <div ref={root} className={'pcn:relative'}>
            <IconButton icon={icon} label={label} active={open} onClick={() => setOpen(!open)} />
            {open && (
                <div className={cn('pcn:absolute pcn:right-0 pcn:top-full pcn:z-30 pcn:mt-1 pcn:rounded-lg pcn:border pcn:border-border pcn:bg-card pcn:p-2 pcn:text-foreground pcn:shadow-xl', width)}>
                    {children(() => setOpen(false))}
                </div>
            )}
        </div>
    );
}

export function MenuItem({ icon, children, onClick }: { icon: string; children: ReactNode; onClick: () => void }) {
    return (
        <button type={'button'} onClick={onClick} className={'pcn:flex pcn:w-full pcn:items-center pcn:gap-2 pcn:rounded-md pcn:px-2 pcn:py-1.5 pcn:text-left pcn:text-sm pcn:cursor-pointer pcn:hover:bg-muted'}>
            <NamedIcon name={icon} size={14} className={'pcn:text-muted-foreground'} />
            {children}
        </button>
    );
}
