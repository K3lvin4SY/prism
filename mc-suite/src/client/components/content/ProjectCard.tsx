import type { KeyboardEvent, MouseEvent } from 'react';
import { NamedIcon, Spinner, cn, fromNow } from '@pterodactyl/sdk';
import { compactNumber, type ProjectHit, type Tag } from '../../api/content';
import { Chip, LOADER_COLORS, TagIcon, tagIcon, tagLabel } from './tags';

export function ProjectIcon({ src, className }: { src: string | null | undefined; className?: string }) {
    return src ? (
        <img src={src} alt={''} loading={'lazy'} className={cn('mcs:rounded-lg mcs:object-cover mcs:bg-muted', className)} />
    ) : (
        <div className={cn('mcs:rounded-lg mcs:bg-muted mcs:flex mcs:items-center mcs:justify-center mcs:text-muted-foreground', className)}>
            <NamedIcon name={'package'} size={20} />
        </div>
    );
}

const MAX_LOADER_CHIPS = 4;

/** Where the project runs: "Client or server", "Server", "Client". */
function environment(hit: ProjectHit): { label: string; icon: string } | null {
    const server = hit.serverSide !== 'unsupported' && hit.serverSide !== null;
    const client = hit.clientSide !== 'unsupported' && hit.clientSide !== null;
    if (server && client) return { label: hit.serverSide === 'required' && hit.clientSide === 'required' ? 'Client and server' : 'Client or server', icon: 'globe' };
    if (server) return { label: 'Server', icon: 'server' };
    if (client) return { label: 'Client', icon: 'monitor' };

    return null;
}

/**
 * "+ Install" on a solid green background, or "✓ Installed" with only a green border.
 * Installed projects open their versions; the rest go straight to installing.
 */
export function InstallButton({ installed, busy = false, onClick }: { installed: boolean; busy?: boolean; onClick: () => void }) {
    return (
        <button
            type={'button'}
            disabled={busy}
            onClick={(event: MouseEvent) => {
                event.stopPropagation();
                onClick();
            }}
            className={cn(
                'mcs:inline-flex mcs:items-center mcs:gap-1.5 mcs:rounded-lg mcs:border-2 mcs:px-3 mcs:py-1.5 mcs:text-sm mcs:font-semibold mcs:cursor-pointer mcs:whitespace-nowrap mcs:transition-colors mcs:disabled:cursor-wait mcs:disabled:opacity-80',
                installed
                    ? 'mcs:border-success mcs:bg-transparent mcs:text-success mcs:hover:bg-success/10'
                    : 'mcs:border-success mcs:bg-success mcs:text-success-foreground mcs:hover:brightness-110'
            )}
        >
            {busy ? <Spinner size={'small'} /> : <NamedIcon name={installed ? 'check' : 'plus'} size={16} />}
            {busy ? 'Installing' : installed ? 'Installed' : 'Install'}
        </button>
    );
}

interface Props {
    hit: ProjectHit;
    layout: 'list' | 'grid';
    categories: Tag[];
    loaders: Tag[];
    onOpen: () => void;
    onInstall: () => void;
    busy?: boolean;
}

export default function ProjectCard({ hit, layout, categories, loaders, onOpen, onInstall, busy = false }: Props) {
    const env = environment(hit);
    const extraLoaders = Math.max(0, hit.loaders.length - MAX_LOADER_CHIPS);

    const stats = (
        <div className={cn('mcs:flex mcs:gap-x-4 mcs:gap-y-1 mcs:text-sm mcs:text-muted-foreground', layout === 'list' ? 'mcs:flex-col mcs:items-end' : 'mcs:flex-wrap mcs:items-center')}>
            <div className={'mcs:flex mcs:gap-3'}>
                <span className={'mcs:inline-flex mcs:items-center mcs:gap-1'} title={`${hit.downloads.toLocaleString()} downloads`}>
                    <NamedIcon name={'download'} size={14} /> <strong className={'mcs:text-foreground mcs:font-semibold'}>{compactNumber(hit.downloads)}</strong>
                </span>
                {hit.source !== 'pumpkin-market' && (
                    <span className={'mcs:inline-flex mcs:items-center mcs:gap-1'} title={`${hit.follows.toLocaleString()} followers`}>
                        <NamedIcon name={'heart'} size={14} /> <strong className={'mcs:text-foreground mcs:font-semibold'}>{compactNumber(hit.follows)}</strong>
                    </span>
                )}
            </div>
            {hit.updated && (
                <span className={'mcs:inline-flex mcs:items-center mcs:gap-1'} title={'Last updated'}>
                    <NamedIcon name={'history'} size={14} /> {fromNow(hit.updated)}
                </span>
            )}
        </div>
    );

    const action = <InstallButton installed={hit.installed} busy={busy} onClick={hit.installed ? onOpen : onInstall} />;

    return (
        <div
            role={'button'}
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(event: KeyboardEvent) => {
                if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    onOpen();
                }
            }}
            className={
                'mcs:relative mcs:flex mcs:gap-4 mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:p-4 mcs:text-left mcs:cursor-pointer mcs:hover:border-primary mcs:min-w-0 mcs:overflow-hidden mcs:focus-visible:outline-2 mcs:focus-visible:outline-primary'
            }
        >
            <ProjectIcon src={hit.icon} className={cn('mcs:shrink-0', layout === 'list' ? 'mcs:size-20' : 'mcs:size-16')} />
            <div className={'mcs:min-w-0 mcs:flex-1 mcs:flex mcs:flex-col mcs:gap-1.5'}>
                <div className={'mcs:flex mcs:flex-wrap mcs:items-baseline mcs:gap-x-2'}>
                    <span className={'mcs:text-lg mcs:font-bold mcs:text-foreground mcs:truncate'}>{hit.title}</span>
                    {hit.author && <span className={'mcs:text-sm mcs:text-muted-foreground'}>by {hit.author}</span>}
                </div>
                <p className={'mcs:text-sm mcs:text-muted-foreground mcs:line-clamp-2'}>{hit.description}</p>
                <div className={'mcs:flex mcs:flex-wrap mcs:gap-1.5'}>
                    {env && (
                        <Chip>
                            <NamedIcon name={env.icon} size={12} /> {env.label}
                        </Chip>
                    )}
                    {hit.categories.slice(0, 3).map((name) => (
                        <Chip key={name}>
                            <TagIcon icon={tagIcon(categories, name)} className={'mcs:size-3'} /> {tagLabel(name)}
                        </Chip>
                    ))}
                    {hit.loaders.slice(0, MAX_LOADER_CHIPS).map((name) => (
                        <Chip key={name} color={LOADER_COLORS[name]}>
                            <TagIcon icon={tagIcon(loaders, name)} className={'mcs:size-3'} /> {tagLabel(name)}
                        </Chip>
                    ))}
                    {extraLoaders > 0 && <Chip title={hit.loaders.slice(MAX_LOADER_CHIPS).map(tagLabel).join(', ')}>+{extraLoaders}</Chip>}
                </div>
                {layout === 'grid' && (
                    <div className={'mcs:mt-auto mcs:flex mcs:flex-wrap mcs:items-end mcs:justify-between mcs:gap-2 mcs:pt-1'}>
                        {stats}
                        {action}
                    </div>
                )}
            </div>
            {layout === 'list' && (
                <div className={'mcs:flex mcs:shrink-0 mcs:flex-col mcs:items-end mcs:justify-between mcs:gap-3'}>
                    {stats}
                    {action}
                </div>
            )}
        </div>
    );
}
