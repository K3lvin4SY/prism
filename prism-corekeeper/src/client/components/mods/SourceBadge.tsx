import { cn } from '@pterodactyl/sdk';
import { SOURCE_NAMES, type SourceName } from '../../api/mods';
import { NamedIcon } from '../../icons';

const ICONS: Record<SourceName, string> = { modio: 'box', steam: 'brand-steam' };

/** Where a mod comes from: mod.io or the Steam Workshop. */
export default function SourceBadge({ source, className }: { source: SourceName; className?: string }) {
    return (
        <span
            className={cn(
                'cks:inline-flex cks:items-center cks:gap-1 cks:rounded-full cks:px-2 cks:py-0.5 cks:text-xs cks:font-medium',
                source === 'modio' ? 'cks:bg-[#07c1d8]/15 cks:text-[#07a3b8]' : 'cks:bg-[#1b2838]/15 cks:text-foreground',
                className
            )}
        >
            <NamedIcon name={ICONS[source]} size={12} /> {SOURCE_NAMES[source]}
        </span>
    );
}
