import { cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../../icons';

export default function SoftwareIcon({ src, className }: { src: string | null | undefined; className?: string }) {
    return src ? (
        <img src={src} alt={''} className={cn('mcs:rounded-md mcs:bg-muted mcs:object-contain', className)} />
    ) : (
        <span className={cn('mcs:flex mcs:items-center mcs:justify-center mcs:rounded-md mcs:bg-muted mcs:text-muted-foreground', className)}>
            <NamedIcon name={'server'} size={16} />
        </span>
    );
}
