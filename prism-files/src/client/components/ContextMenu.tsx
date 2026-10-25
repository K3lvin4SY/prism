import { useEffect } from 'react';
import { cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';

type MenuItem = { icon: string; label: string; danger?: boolean; run: () => unknown } | false | null | undefined | '' | 0;

/** A right-click menu at the pointer; closes on any outside click. */
export default function ContextMenu({ menu, items, onClose }: { menu: { x: number; y: number }; items: MenuItem[]; onClose: () => void }) {
    useEffect(() => {
        const close = () => onClose();
        window.addEventListener('mousedown', close);
        window.addEventListener('blur', close);

        return () => {
            window.removeEventListener('mousedown', close);
            window.removeEventListener('blur', close);
        };
    }, [onClose]);

    return (
        <div
            className={'pt-surface pt-overlay pfl:fixed pfl:z-50 pfl:min-w-48 pfl:rounded-lg pfl:border pfl:border-border pfl:bg-card pfl:p-1 pfl:shadow-xl'}
            style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 280) }}
            onMouseDown={(event) => event.stopPropagation()}
        >
            {items.filter(Boolean).map((item) => {
                const entry = item as Exclude<MenuItem, false | null | undefined | '' | 0>;

                return (
                    <button
                        key={entry.label}
                        type={'button'}
                        onClick={() => {
                            onClose();
                            void entry.run();
                        }}
                        className={cn('pfl:flex pfl:w-full pfl:items-center pfl:gap-2 pfl:rounded-md pfl:px-2 pfl:py-1.5 pfl:text-left pfl:text-sm pfl:cursor-pointer pfl:hover:bg-muted', entry.danger && 'pfl:text-destructive')}
                    >
                        <NamedIcon name={entry.icon} size={14} /> {entry.label}
                    </button>
                );
            })}
        </div>
    );
}
