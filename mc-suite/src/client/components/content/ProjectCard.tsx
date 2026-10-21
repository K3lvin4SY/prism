import { Badge, NamedIcon, cn, fromNow } from '@pterodactyl/sdk';
import { compactNumber, type ProjectHit } from '../../api/content';

export function ProjectIcon({ src, className }: { src: string | null | undefined; className?: string }) {
    return src ? (
        <img src={src} alt={''} loading={'lazy'} className={cn('mcs:rounded-md mcs:object-cover mcs:bg-muted', className)} />
    ) : (
        <div className={cn('mcs:rounded-md mcs:bg-muted mcs:flex mcs:items-center mcs:justify-center mcs:text-muted-foreground', className)}>
            <NamedIcon name={'package'} size={20} />
        </div>
    );
}

export default function ProjectCard({ hit, layout, onOpen }: { hit: ProjectHit; layout: 'list' | 'grid'; onOpen: () => void }) {
    return (
        <button
            type={'button'}
            onClick={onOpen}
            className={cn(
                'mcs:relative mcs:overflow-hidden mcs:flex mcs:gap-3 mcs:rounded-md mcs:border mcs:border-border mcs:bg-card mcs:p-3 mcs:text-left mcs:cursor-pointer mcs:hover:border-primary mcs:min-w-0'
            )}
        >
            {layout === 'grid' && hit.gallery && (
                <img src={hit.gallery} alt={''} loading={'lazy'} className={'mcs:absolute mcs:inset-0 mcs:size-full mcs:object-cover mcs:opacity-15 mcs:pointer-events-none'} />
            )}
            <ProjectIcon src={hit.icon} className={'mcs:relative mcs:size-12 mcs:shrink-0'} />
            <div className={'mcs:relative mcs:min-w-0 mcs:flex-1'}>
                <div className={'mcs:flex mcs:flex-wrap mcs:items-baseline mcs:gap-x-2'}>
                    <span className={'mcs:font-semibold mcs:truncate'}>{hit.title}</span>
                    {hit.author && <span className={'mcs:text-xs mcs:text-muted-foreground'}>by {hit.author}</span>}
                    {hit.installed && (
                        <Badge size={'sm'} tone={'success'}>
                            Installed
                        </Badge>
                    )}
                </div>
                <p className={cn('mcs:text-xs mcs:text-muted-foreground mcs:mt-0.5', layout === 'grid' ? 'mcs:line-clamp-2' : 'mcs:line-clamp-1')}>{hit.description}</p>
                <div className={'mcs:flex mcs:flex-wrap mcs:gap-3 mcs:mt-1.5 mcs:text-xs mcs:text-muted-foreground'}>
                    <span className={'mcs:inline-flex mcs:items-center mcs:gap-1'} title={'Downloads'}>
                        <NamedIcon name={'download'} size={12} /> {compactNumber(hit.downloads)}
                    </span>
                    <span className={'mcs:inline-flex mcs:items-center mcs:gap-1'} title={'Followers'}>
                        <NamedIcon name={'heart'} size={12} /> {compactNumber(hit.follows)}
                    </span>
                    {layout === 'list' && hit.updated && (
                        <span className={'mcs:inline-flex mcs:items-center mcs:gap-1'} title={'Last updated'}>
                            <NamedIcon name={'clock'} size={12} /> {fromNow(hit.updated)}
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
}
